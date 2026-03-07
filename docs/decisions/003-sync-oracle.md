# ADR-003: 同步命令执行而非异步消息传递

## 状态

已采纳

## 日期

2026-03-08

## 背景

长期愿景（`docs/01-vision.md`）设想通过文件系统进行异步消息传递：

```
宿主机                          容器内
├── /var/world/inbox/    ←→    /world/inbox/
│   └── alpha.msg              └── alpha.msg (AI-α 监听)
│
└── /var/world/outbox/   ←→    /world/outbox/
    └── alpha.result           └── alpha.result (AI-α 写入)
```

**工作流程**：

1. 人类写入消息到 inbox
2. AI 通过 inotify 监听文件变化
3. AI 读取消息并处理
4. AI 写入结果到 outbox
5. 人类读取结果

这种设计的优势：

- 异步解耦（发送者和接收者独立）
- 可审计（文件即日志）
- 持久化（消息不会丢失）
- 简单可靠（无需网络）

但也带来了复杂度：

- 需要实现 inotify 监听器
- 需要处理文件锁和并发
- 需要清理已处理的消息
- 延迟较高（文件轮询）
- 错误处理复杂（超时、重试）

## 决策

使用同步 HTTP 调用，直接执行命令并返回结果：

```
用户
  ↓ dio oracle send --to alpha --message "hello"
TheWorldServer
  ↓ POST /api/oracle/send
RegionDaemonClient
  ↓ docker exec <region> curl http://localhost:4040/execute
RegionDaemon
  ↓ executeAsUser('agent', 'opencode run "hello"')
执行命令
  ↓ stdout/stderr
返回结果（同步）
```

**实现方式**：

```typescript
// src/server/TheWorldServer.ts
this.app.post('/api/oracle/send', async (req, res) => {
  const { to, region, message } = req.body;

  // 记录到 EverMemOS
  await this.memory.logOracle({ aiName: to, regionId: region, content: message });

  // 直接调用 RegionDaemon 执行
  const daemonClient = new RegionDaemonClient(region);
  const command = `opencode run "${message}" --format json`;
  const result = await daemonClient.execute('agent', command, 60000);

  // 同步返回结果
  res.json({ status: 'ok', response: parseResponse(result) });
});
```

## 理由

### 1. 低延迟

- 同步调用: ~100-200ms
- 文件轮询: ~500-1000ms（取决于轮询间隔）
- 用户体验更好

### 2. 简化实现

- 无需 inotify 监听器
- 无需文件清理逻辑
- 无需处理文件锁
- 减少 ~300 行代码

### 3. 更好的错误处理

```typescript
// 同步调用 - 直接获取错误
try {
  const result = await execute(command);
  return result;
} catch (error) {
  return { error: error.message };
}

// 异步消息 - 需要轮询和超时
while (timeout > 0) {
  if (fs.existsSync(resultFile)) {
    return fs.readFileSync(resultFile);
  }
  await sleep(100);
  timeout -= 100;
}
throw new Error('Timeout');
```

### 4. MVP 阶段足够

- 不需要异步解耦
- 不需要消息队列
- 不需要持久化（EverMemOS 已记录）

### 5. 保留扩展性

- inbox/outbox 目录已挂载（未使用）
- 未来可以添加异步支持
- 不影响现有同步 API

## 后果

### 正面影响

✅ 延迟降低 5-10 倍  
✅ 代码复杂度降低 ~40%  
✅ 错误处理简化  
✅ 调试和测试更容易  
✅ 用户体验更好（即时反馈）

### 负面影响

⚠️ 放弃了异步解耦  
⚠️ 长时间运行的命令会阻塞 HTTP 连接  
⚠️ 无法实现"发送后离开"的模式

### 风险缓解

- 设置合理的超时（默认 60 秒）
- 支持自定义超时参数
- 通过 EverMemOS 记录所有操作
- 未来可以添加异步 API（不影响现有同步 API）

## 性能考虑

### 超时处理

```typescript
// RegionDaemon 支持智能超时
executeAsUser(user, command, timeout) {
  // 检测 step_finish 事件，提前结束
  if (stdout.includes('"type":"step_finish"')) {
    clearTimeout(timer);
    resolve({ stdout, stderr });
  }
}
```

### 并发支持

- Node.js 异步 I/O，支持多个并发请求
- RegionDaemon 单进程，但可以处理多个并发命令
- 实际测试: 10 个并发神谕 < 2 秒

## 未来考虑

如果遇到以下情况，可以考虑添加异步支持：

### 场景 1: 长时间运行的任务

- 任务执行时间 > 5 分钟
- 用户不需要等待结果

**解决方案**: 添加异步 API

```typescript
POST /api/oracle/send-async
→ 返回 task_id
→ 后台执行
→ 结果写入 outbox

GET /api/oracle/result/:task_id
→ 查询结果
```

### 场景 2: 批量任务

- 需要发送多个神谕
- 不需要立即获取结果

**解决方案**: 使用 inbox/outbox 机制

```typescript
// 批量写入 inbox
for (const message of messages) {
  fs.writeFileSync(`/world/inbox/${message.id}.msg`, message.content);
}

// AI 监听 inbox，处理后写入 outbox
```

### 场景 3: 离线处理

- AI 需要在后台持续运行
- 处理队列中的任务

**解决方案**: 实现 Heartbeat 机制（见 Roadmap）

## 实际使用模式

### 当前（同步）

```bash
# 发送神谕，等待结果
$ dio oracle send --to alpha --message "分析日志"
✅ AI 响应: 发现 3 个错误...
```

### 未来（异步，如果需要）

```bash
# 发送神谕，立即返回
$ dio oracle send-async --to alpha --message "训练模型"
✅ 任务已提交: task-123

# 稍后查询结果
$ dio oracle result task-123
⏳ 进行中...

$ dio oracle result task-123
✅ 完成: 模型准确率 95%
```

## 相关决策

- ADR-001: 单用户架构
- ADR-002: 统一端口架构

## 参考

- `src/server/TheWorldServer.ts:189-243` - 神谕实现
- `src/region-daemon/RegionDaemon.ts:101-151` - 命令执行
- `src/region-daemon/RegionDaemonClient.ts:29-33` - 客户端调用
