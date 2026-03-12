# ADR-008: Unified AI Conversation Interface and Mandatory Memory Recall

## Status

Accepted

## Date

2026-03-10

## Context

In the v0.1 architecture, there are multiple entry points for interacting with AI:

- `POST /api/ai/exec` - General command execution interface
- `POST /api/oracle/send` - Oracle message interface
- Scheduler task types: `oracle`/`heartbeat`/`command`

These entry points have the following issues:

1.  **Semantic Confusion**: Is `exec` for "executing a command" or "speaking to the AI"?
2.  **Inconsistent Memory Recall**: Some paths have memory logging, but lack a unified "recall → inject → execute" pipeline.
3.  **Poor Extensibility**: Cannot uniformly handle various message sources like human→AI, AI→AI, system→AI.
4.  **Blurred Security Boundaries**: The AI identity plane is mixed with privileged operations.

Core Problem: **Lack of a unified abstraction for "speaking to the AI".**

## Decision

### 1. Introduce a Unified `speakToAI` Interface

All scenarios involving "sending a natural language message to the AI" will uniformly use the `speakToAI` interface:

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

### 2. Mandatory Memory Recall Pipeline

`speakToAI` will internally enforce a fixed execution sequence:

```
1. logIncomingMessage (Log incoming message to EverMemOS + Audit Layer)
2. buildWakeupMemory (Recall relevant memories from EverMemOS)
3. Write to /home/agent/MEMORY.md
4. Construct `opencode run --file /home/agent/MEMORY.md`
5. Execute and parse the response
6. logOutgoingMessage (Log outgoing message to EverMemOS + Audit Layer)
```

**Key Constraint**: Memory recall is a mandatory step and cannot be skipped. On failure, it degrades (writes a minimal MEMORY template) but does not block execution.

### 3. Deprecate the `execCommand` Interface

- Remove `POST /api/ai/exec`
- Remove `AIUserManager.execCommand(...)`
- Remove the `dio ai exec` CLI command
- Remove the `command` task type from the Scheduler

**Rationale**: The semantics of `execCommand` are "execute arbitrary shell commands as the AI identity". This belongs to the privileged operations plane and should not serve as an AI interaction interface. Genuine operational needs should go through dedicated maintenance channels (see ADR-007).

### 4. Retain `oracle/send` as a Compatibility Alias

`POST /api/oracle/send` will be retained but internally redirect to `speakToAI`:

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

### 5. Scheduler Task Type Adjustments

- `oracle` → Calls `speakToAI`, with fromType='system', fromId='world-scheduler'
- `heartbeat` → Calls `speakToAI`, with fromType='system', fromId='world-scheduler-heartbeat'
- `message` → Calls `speakToAI`, with configurable fromType/fromId
- `command` → **Removed** (no longer supported)

## Rationale

### 1. Unified Semantics, Reduced Cognitive Load

"Speaking to the AI" is a clear domain concept, more aligned with actual use than "executing a command".

### 2. Memory Recall as an Architectural Guarantee

Does not rely on caller discipline; enforced by the interface contract. Every time the AI is awakened, it sees relevant historical context.

### 3. Supports Multi-Source Messages

The unified interface naturally supports:
- human → AI (oracle, conversation)
- AI → AI (future Agent-to-Agent communication)
- system → AI (Scheduler heartbeat, system notifications)

### 4. Clear Security Boundaries

Clear separation between the AI identity plane (speak) and the privileged operations plane (maintenance), aligning with ADR-007's security baseline.

### 5. Paves the Way for Asynchronous Evolution

When migrating to an inbox/outbox asynchronous model in the future, only the transport layer around `speakToAI` needs changing; the core memory mechanism remains.

## Consequences

### Positive

✅ All AI interactions follow the memory recall pipeline, ensuring contextual continuity.
✅ Clear interface semantics, reducing onboarding cost.
✅ Multi-source message support lays the foundation for AI→AI communication and multi-Agent collaboration.
✅ Clear security boundaries, adhering to the principle of least privilege.
✅ Reduced code complexity (removing execCommand and related adaptation logic).

### Negative

⚠️ Breaking Change: `/api/ai/exec` and `dio ai exec` are removed.
⚠️ Existing external callers relying on `execCommand` need to migrate.
⚠️ Memory recall on every `speak` increases EverMemOS load (can be optimized with caching).

### Risk Mitigation

- Retain `/api/oracle/send` as a compatibility alias for smooth transition.
- Degrade gracefully on EverMemOS recall failure, without blocking the main flow.
- Memory recall results are written to `/home/agent/MEMORY.md`, enabling audit and debugging.

## Implementation Details

### MEMORY.md Format

```markdown
# MEMORY for <aiName>

GeneratedAt: 2026-03-10T12:34:56.789Z
Region: region-a
IncomingFrom: human:oracle

## Incoming Message

<The currently received message content>

## Recalled Memories

- 1. <Relevant memory 1>
- 2. <Relevant memory 2>
     ...
```

### Memory Recall Strategy

- Use the first 300 characters of the current message as the query.
- Retrieve top_k=10 relevant memories from EverMemOS.
- Truncate each memory to 500 characters.
- Control total length within 5000 characters.

### Degradation Strategy

When EverMemOS is unavailable:

```markdown
# MEMORY for <aiName>

GeneratedAt: ...
Region: ...
IncomingFrom: ...

## Incoming Message

<Current message>

## Recalled Memories

- Memory retrieval unavailable. Proceed with conservative assumptions.
```

## Migration Guide

### For API Callers

**Old Code**:

```bash
curl -X POST http://localhost:3344/api/ai/exec \
  -d '{"ai":"alpha","region":"region-a","command":"opencode run \"hello\""}'
```

**New Code**:

```bash
curl -X POST http://localhost:3344/api/ai/speak \
  -d '{"to":"alpha","region":"region-a","message":"hello"}'
```

### For CLI Users

**Old Command**:

```bash
dio ai exec -a alpha -r region-a -c "opencode run 'hello'"
```

**New Command**:

```bash
dio ai speak -t alpha -r region-a -m "hello"
# Or continue using oracle (compatibility alias)
dio oracle send --to alpha --region region-a --message "hello"
```

### For Scheduler Tasks

**Old Configuration**:

```json
{
  "type": "command",
  "payload": {
    "command": "opencode run 'hello'"
  }
}
```

**New Configuration**:

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

## Related Decisions

- ADR-003: Synchronous Command Execution (documents v0.1's synchronous model; this ADR unifies the interface based on it).
- ADR-007: Runtime Security Baseline (this ADR reinforces the separation between AI identity and operations planes).

## Future Evolution

### v0.3: Asynchronous Inbox/Outbox Model

`speakToAI` could evolve to:

```
1. logIncomingMessage
2. buildWakeupMemory
3. Write to /world/inbox/<message-id>.msg
4. Immediately return message_id
5. Agent listens to inbox via `serve`, processes autonomously
6. Agent writes to /world/outbox/<response-id>.msg via tool
7. WorldServer listens to outbox, notifies subscribers
```

The core memory flow remains unchanged; only the transport layer shifts from synchronous HTTP to asynchronous files.

### v0.4: Direct AI→AI Communication

```typescript
await speakToAI({
  aiName: 'beta',
  regionName: 'region-a',
  message: 'Can you help me with this task?',
  fromType: 'ai',
  fromId: 'alpha',
});
```

The memory system will record AI-to-AI conversation history, supporting multi-Agent collaboration.

## Acceptance Criteria

- [ ] `POST /api/ai/speak` works correctly.
- [ ] `POST /api/oracle/send` works correctly as a compatibility alias.
- [ ] Scheduler tasks `oracle`/`heartbeat`/`message` execute correctly.
- [ ] `/home/agent/MEMORY.md` is generated for every `speak`.
- [ ] `speak` can still execute when EverMemOS is unavailable (degradation).
- [ ] The `dio ai speak` CLI command works correctly.
- [ ] `dio ai exec` is removed.
- [ ] Build passes, no TypeScript errors.