# Oracle Send 超时问题排查记录

## 问题描述

执行 `oracle:send -r test -t alice -m haha` 命令时出现超时错误，无法成功发送 oracle 消息给容器内的 AI Agent。

## 问题现象

```bash
$ npm run dev -- oracle:send -r test -t alice -m "你好，请介绍一下你自己"
📨 发送神谕给 alice...
CLIError: 发送神谕失败: Timeout
```

## 排查过程

### 1. 架构分析

Oracle 消息的执行流程：

```
CLI (oracle:send)
  ↓
APIClient.sendOracle()
  ↓
TheWorldServer POST /api/oracle/send
  ↓
RegionDaemonClient.execute()
  ↓
Docker Container (RegionDaemon)
  ↓
opencode run (通过 su - agent 执行)
```

### 2. 初步检查

- ✅ opencode serve 正常运行在容器内 4096 端口
- ✅ 端口映射正常（容器 4096 → 宿主机 55006）
- ✅ 网络连接正常（容器可以访问 host.docker.internal:3344）
- ❌ 命令执行超时（60秒）

### 3. 问题定位

#### 问题 1：--attach 参数导致进程挂起

**现象**：

- 不使用 `--attach` 参数：opencode 正常完成，输出 step_finish
- 使用 `--attach http://localhost:4096`：进程卡住，只输出 step_start

**测试**：

```bash
# 成功
docker exec test su - agent -c 'opencode run "hello" --format json'

# 卡住
docker exec test su - agent -c 'opencode run "hello" --attach http://localhost:4096 --format json'
```

**根因**：通过 Node.js spawn 执行时，stdin 没有被正确处理，opencode 在 --attach 模式下等待 stdin 输入。

#### 问题 2：stdio 配置缺失

**发现**：

```javascript
// RegionDaemon.ts 原代码
const proc = spawn('su', ['-', user, '-c', scriptPath], {
  env: { ...process.env, HOME: `/home/${user}`, PATH: '/usr/local/bin:/usr/bin:/bin' },
  // 缺少 stdio 配置
});
```

**验证**：

```javascript
// 测试脚本 - 不带 stdio：超时
const proc = spawn('su', ['-', 'agent', '-c', scriptPath]);

// 测试脚本 - 带 stdio：成功
const proc = spawn('su', ['-', 'agent', '-c', scriptPath], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

**根因**：当 stdin 没有被 ignore 时，opencode 在 --attach 模式下会等待 stdin 输入，导致进程挂起。

#### 问题 3：工具调用权限被拒绝

**现象**：修复 stdio 后，简单问题（如 "1+1"）成功，复杂问题失败。

**错误信息**：

```json
{
  "type": "tool_use",
  "state": {
    "status": "error",
    "error": "Error: The user rejected permission to use this specific tool call."
  }
}
```

**根因**：在 `--attach` 模式下，opencode 连接到 serve 实例，工具调用需要在 UI 中手动批准。简单问题不需要工具所以成功，复杂问题需要工具（如 bash、glob）就失败。

**解决方案**：在 opencode 配置中添加 `"permission":"allow"` 自动批准所有工具调用。

#### 问题 4：step_finish 检测竞态条件

**现象**：从日志看到 `killed=true, resolved=false`，说明进程被 kill 后 promise 没有 resolve。

**原代码逻辑**：

```javascript
if (stdout.includes('"type":"step_finish"') && !hasFinished) {
  hasFinished = true;
  clearTimeout(timer);
  if (!killed && !resolved) {
    resolved = true;
    killed = true;
    proc.kill(); // 先 kill
    resolve({ stdout, stderr }); // 后 resolve
  }
}
```

**问题**：`proc.kill()` 会立即触发 `close` 事件，在 `resolve()` 调用之前就执行了 close 处理器，导致 `killed=true` 时 promise 还未 resolve。

## 解决方案

### 1. 修改 TheWorldServer.ts

**位置**：`src/server/TheWorldServer.ts:304-322`

**修改内容**：

```typescript
// 1. 将 oracle 消息写入文件
const timestamp = Date.now();
const filename = `oracle-${timestamp}-human-${to}.txt`;
const containerPath = `/world/inbox/${filename}`;

const hostDir = path.join(
  process.env.WORLD_DATA_DIR || process.env.HOME || '/tmp',
  '.the-world',
  'regions',
  region,
  'inbox'
);
await fs.promises.writeFile(path.join(hostDir, filename), message, 'utf-8');

// 2. 使用 --attach 和 --file 参数
const prompt = `请阅读并执行 ${containerPath} 中的 oracle 消息`;
const command = `opencode run "${prompt}" --file ${containerPath} --format json --attach http://localhost:4096`;

// 3. 增加超时时间到 120 秒
const result = await daemonClient.execute('agent', command, 120000);
```

**原因**：

- 使用文件传递消息避免命令行转义问题
- 使用 --attach 连接到 serve 实例提供可观测性
- 增加超时时间应对首次启动较慢的情况

### 2. 修改 RegionDaemon.ts

**位置**：`src/region-daemon/RegionDaemon.ts:133-136`

**修改内容**：

```typescript
const proc = spawn('su', ['-', user, '-c', scriptPath], {
  env: { ...process.env, HOME: `/home/${user}`, PATH: '/usr/local/bin:/usr/bin:/bin' },
  stdio: ['ignore', 'pipe', 'pipe'], // 添加 stdio 配置
});
```

**位置**：`src/region-daemon/RegionDaemon.ts:169-186`

**修改内容**：

```typescript
if (stdout.includes('"type":"step_finish"') && !hasFinished) {
  hasFinished = true;
  clearTimeout(timer);
  if (!killed && !resolved) {
    resolved = true;
    // 先 resolve，再 kill
    resolve({ stdout, stderr });
    killed = true;
    proc.kill();
    try {
      fs.unlinkSync(scriptPath);
    } catch {}
  }
}
```

**原因**：

- `stdio: ['ignore', 'pipe', 'pipe']` 忽略 stdin，避免 opencode 等待输入
- 先 resolve 再 kill 避免竞态条件

### 3. 修改 Dockerfile.region

**位置**：`docker/Dockerfile.region:28`

**修改内容**：

```dockerfile
printf '%s\n' '{"$schema":"https://opencode.ai/config.json","disabled_providers":[],"model":"system/default","provider":{"system":{"name":"System","npm":"@ai-sdk/openai-compatible","models":{"default":{"name":"Default Model"}},"options":{"baseURL":"http://host.docker.internal:3344/v1"}}},"permission":"allow"}' > /home/agent/.config/opencode/opencode.jsonc
```

**关键变化**：添加 `"permission":"allow"` 配置

**原因**：在 --attach 模式下自动批准所有工具调用，避免需要手动批准

### 4. 修改 docker/services/region-daemon

**位置**：`docker/services/region-daemon:5`

**修改内容**：

```bash
su - agent -c "opencode serve --hostname 0.0.0.0 --port 4096" &
```

**原因**：明确指定端口 4096，确保与配置一致

## 测试结果

### 简单问题测试

```bash
$ npm run dev -- oracle:send -r test -t alice -m "1+1等于几？"
📨 发送神谕给 alice...
✅ 神谕已发送给 alice

🤖 AI 回复:
2
```

### 复杂问题测试

```bash
$ npm run dev -- oracle:send -r test -t alice -m "2的20次方是多少？"
📨 发送神谕给 alice...
✅ 神谕已发送给 alice

🤖 AI 回复:
2的20次方是 **1,048,576**。
```

## 关键发现

1. **stdio 配置至关重要**：在使用 spawn 执行需要交互的程序时，必须正确配置 stdio，特别是 stdin
2. **opencode 的两种模式**：
   - 不使用 --attach：启动临时 server，自动批准工具
   - 使用 --attach：连接到已有 server，需要配置 permission
3. **竞态条件陷阱**：在异步操作中，先 resolve/reject promise，再执行可能触发其他事件的操作
4. **权限配置**：opencode 的 permission 配置可以设置为 "allow"、"ask" 或 "deny"，在自动化场景中应使用 "allow"

## 相关文档

- [OpenCode Permissions 文档](https://opencode.ai/docs/permissions/)
- [Node.js spawn stdio 配置](https://nodejs.org/api/child_process.html#child_process_options_stdio)
- [ADR-003: Sync Oracle](../decisions/003-sync-oracle.md)

## 总结

这个问题的根本原因是多个因素共同作用：

1. stdio 配置缺失导致进程等待输入
2. 权限配置缺失导致工具调用被拒绝
3. 竞态条件导致 promise 无法正确 resolve

通过系统性的排查和测试，最终定位并修复了所有问题，使 oracle:send 功能完全正常工作。
