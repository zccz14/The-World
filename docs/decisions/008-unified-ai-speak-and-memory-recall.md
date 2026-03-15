# ADR-008: 统一 AI 对话接口与强制记忆召回

## 状态

已接受

## 日期

2026-03-10

## 背景

在 v0.1 架构中，存在多个与 AI 交互的入口：

- `POST /api/ai/exec` - 通用命令执行接口
- `POST /api/oracle/send` - 神谕消息接口
- Scheduler 的 `oracle`/`heartbeat`/`command` 任务类型

这些入口存在以下问题：

1. **语义混乱**：`exec` 是"执行命令"还是"对 AI 说话"？
2. **记忆召回不一致**：部分路径有记忆日志，但没有统一的"召回 → 注入 → 执行"流程
3. **扩展性差**：无法统一处理 human→AI、AI→AI、system→AI 等多种消息来源
4. **安全边界模糊**：AI 身份面与提权运维面混在一起

核心问题：**缺少"对 AI 说话"的统一抽象**。

## 决策

### 1. 引入统一的 `speakToAI` 接口

所有"向 AI 发送自然语言消息"的场景，统一通过 `speakToAI` 接口：

```typescript
interface SpeakToAIParams {
  aiName: string;
  regionName: string;
  message: string;
  fromType: 'human' | 'ai' | 'system';
  fromId: string;
  timeout?: number;
  metadata?: Record<string, unknown>;
}
```

### 2. 强制记忆召回流水线

`speakToAI` 内部固定执行顺序：

```
1. logIncomingMessage (记录入站消息到 EverMemOS + 审计层)
2. buildWakeupMemory (从 EverMemOS 召回相关记忆)
3. 写入 /home/agent/MEMORY.md
4. 构造 opencode run --file /home/agent/MEMORY.md
5. 执行并解析回复
6. logOutgoingMessage (记录出站消息到 EverMemOS + 审计层)
```

**关键约束**：记忆召回是强制步骤，不可跳过。失败时降级（写入最小 MEMORY 模板），但不阻断执行。

### 3. 退役 `execCommand` 接口

- 删除 `POST /api/ai/exec`
- 删除 `AIUserManager.execCommand(...)`
- 删除 `dio ai:exec` CLI 命令
- 删除 Scheduler 的 `command` 任务类型

**理由**：`execCommand` 的语义是"以 AI 身份执行任意 shell 命令"，这属于提权运维面，不应作为 AI 交互接口。真正的运维需求应通过专门的 maintenance 通道（见 ADR-007）。

### 4. 保留 `oracle/send` 作为兼容别名

`POST /api/oracle/send` 保留，但内部转调 `speakToAI`：

```typescript
this.app.post('/api/oracle/send', async (req, res) => {
  const { to, region, message } = req.body;
  const result = await this.aiManager.speakToAI({
    aiName: to,
    regionName: region,
    message,
    fromType: 'human',
    fromId: 'oracle',
    metadata: { channel: 'oracle' },
  });
  res.json({ status: 'ok', response: { from: to, response: result } });
});
```

### 5. Scheduler 任务类型调整

- `oracle` → 调用 `speakToAI`，fromType='system', fromId='world-scheduler'
- `heartbeat` → 调用 `speakToAI`，fromType='system', fromId='world-scheduler-heartbeat'
- `message` → 调用 `speakToAI`，fromType/fromId 可配置
- `command` → **删除**（不再支持）

## 理由

### 1. 统一语义，降低认知负担

"对 AI 说话"是明确的领域概念，比"执行命令"更贴近实际用途。

### 2. 记忆召回成为架构保证

不依赖调用方自觉，而是接口契约强制执行。每次 AI 被唤醒时，都能看到相关历史上下文。

### 3. 支持多源消息

统一接口天然支持：

- human → AI（神谕、对话）
- AI → AI（未来的 Agent 间通信）
- system → AI（Scheduler 心跳、系统通知）

### 4. 安全边界清晰

AI 身份面（speak）与提权运维面（maintenance）彻底分离，符合 ADR-007 的安全基线。

### 5. 为异步演进铺路

未来迁移到 inbox/outbox 异步模型时，只需在 `speakToAI` 外层换传输，核心记忆机制不变。

## 后果

### 正面影响

✅ 所有 AI 交互统一走记忆召回流程，上下文连续性有保障  
✅ 接口语义清晰，新人理解成本降低  
✅ 多源消息支持为 AI→AI 通信、多 Agent 协作打下基础  
✅ 安全边界明确，符合最小权限原则  
✅ 代码复杂度降低（删除 execCommand 及相关适配逻辑）

### 负面影响

⚠️ 破坏性变更：`/api/ai/exec` 和 `dio ai:exec` 被移除  
⚠️ 现有依赖 `execCommand` 的外部调用方需要迁移  
⚠️ 每次 speak 都召回记忆，EverMemOS 负载增加（可通过缓存优化）

### 风险缓解

- 保留 `/api/oracle/send` 作为兼容别名，平滑过渡
- EverMemOS 召回失败时降级，不阻断主流程
- 记忆召回结果写入 `/home/agent/MEMORY.md`，可审计、可调试

## 实现细节

### MEMORY.md 格式

```markdown
# MEMORY for <aiName>

GeneratedAt: 2026-03-10T12:34:56.789Z
Region: region-a
IncomingFrom: human:oracle

## Incoming Message

<当前收到的消息内容>

## Recalled Memories

- 1. <相关记忆1>
- 2. <相关记忆2>
     ...
```

### 记忆召回策略

- 使用当前消息的前 300 字符作为 query
- 从 EverMemOS 检索 top_k=10 条相关记忆
- 每条记忆截断到 500 字符
- 总长度控制在 5000 字符以内

### 降级策略

EverMemOS 不可用时：

```markdown
# MEMORY for <aiName>

GeneratedAt: ...
Region: ...
IncomingFrom: ...

## Incoming Message

<当前消息>

## Recalled Memories

- Memory retrieval unavailable. Proceed with conservative assumptions.
```

## 迁移指南

### 对于 API 调用方

**旧代码**：

```bash
curl -X POST http://localhost:3344/api/ai/exec \
  -d '{"ai":"alpha","region":"region-a","command":"opencode run \"hello\""}'
```

**新代码**：

```bash
curl -X POST http://localhost:3344/api/ai/speak \
  -d '{"to":"alpha","region":"region-a","message":"hello"}'
```

### 对于 CLI 用户

**旧命令**：

```bash
dio ai:exec -a alpha -r region-a -c "opencode run 'hello'"
```

**新命令**：

```bash
dio ai:speak -t alpha -r region-a -m "hello"
# 或继续使用 oracle（兼容别名）
dio oracle:send --to alpha --region region-a --message "hello"
```

### 对于 Scheduler 任务

**旧配置**：

```json
{
  "type": "command",
  "payload": {
    "command": "opencode run 'hello'"
  }
}
```

**新配置**：

```json
{
  "type": "message",
  "payload": {
    "message": "hello",
    "fromType": "system",
    "fromId": "custom-scheduler"
  }
}
```

## 相关决策

- ADR-003: 同步命令执行（记录了 v0.1 的同步模型，本 ADR 在此基础上统一接口）
- ADR-007: 运行时安全基线（本 ADR 强化了 AI 身份面与运维面的分离）

## 未来演进

### v0.3: 异步 inbox/outbox 模型

`speakToAI` 可以改为：

```
1. logIncomingMessage
2. buildWakeupMemory
3. 写入 /world/inbox/<message-id>.msg
4. 立即返回 message_id
5. Agent 通过 serve 监听 inbox，自主处理
6. Agent 通过 tool 写入 /world/outbox/<response-id>.msg
7. WorldServer 监听 outbox，通知订阅方
```

核心记忆流程不变，只是传输层从同步 HTTP 改为异步文件。

### v0.4: AI→AI 直接通信

```typescript
await speakToAI({
  aiName: 'beta',
  regionName: 'region-a',
  message: 'Can you help me with this task?',
  fromType: 'ai',
  fromId: 'alpha',
});
```

记忆系统会记录 AI 间的对话历史，支持多 Agent 协作。

## 验收标准

- [ ] `POST /api/ai/speak` 正常工作
- [ ] `POST /api/oracle/send` 作为兼容别名正常工作
- [ ] Scheduler 的 oracle/heartbeat/message 任务正常执行
- [ ] 每次 speak 都生成 `/home/agent/MEMORY.md`
- [ ] EverMemOS 不可用时，speak 仍可执行（降级）
- [ ] `dio ai:speak` CLI 命令正常工作
- [ ] `dio ai:exec` 已删除
- [ ] 构建通过，无 TypeScript 错误
