# ADR-003: Synchronous Command Execution Instead of Asynchronous Message Passing

## Status

**Historical Phase Decision (v0.1)** - Replaced by v0.2 Asynchronous Event-Driven Model

## Migration Note (2026-03-10)

This ADR documents the rationale for choosing synchronous calls during the v0.1 MVP phase, a decision that was a reasonable engineering trade-off at the time.

**v0.2 Migration Direction**:

-   Migrate from synchronous HTTP calls to an asynchronous event-driven model (inbox/outbox).
-   Core Reason: Tasks are inherently broad/heavyweight, may return multiple times, and involve ongoing dialogue; synchronous `req/res` semantics are a natural mismatch.
-   Agent Reply Sovereignty: Agents autonomously decide when/if/how to reply multiple times to humans.
-   Value Prioritization: Reliable delivery, recoverability, auditability > Low latency.

Refer to the "Design Intent and Value Judgments" section in `docs/02-current-arch.md` for details.

---

## Original Decision Record (v0.1)

## Date

2026-03-08

## Context

The long-term vision (`docs/01-vision.md`) envisioned asynchronous message passing via the filesystem:

```
Host Machine                       Inside Container
├── /var/world/inbox/    ←→    /world/inbox/
│   └── alpha.msg              └── alpha.msg (AI-α listens)
│
└── /var/world/outbox/   ←→    /world/outbox/
    └── alpha.result           └── alpha.result (AI-α writes)
```

**Workflow**:

1.  Human writes a message to the inbox.
2.  AI listens for file changes via inotify.
3.  AI reads and processes the message.
4.  AI writes the result to the outbox.
5.  Human reads the result.

Advantages of this design:

-   Asynchronous decoupling (sender and receiver are independent).
-   Auditable (files serve as logs).
-   Persistent (messages are not lost).
-   Simple and reliable (no network required).

But it also introduced complexity:

-   Requires implementing an inotify listener.
-   Requires handling file locks and concurrency.
-   Requires cleaning up processed messages.
-   Higher latency (file polling).
-   Complex error handling (timeouts, retries).

## Decision

Use synchronous HTTP calls to directly execute commands and return results:

```
User
  ↓ dio oracle send --to alpha --message "hello"
TheWorldServer
  ↓ POST /api/oracle/send
RegionDaemonClient
  ↓ docker exec <region> curl http://localhost:62191/execute
RegionDaemon
  ↓ executeAsUser('agent', 'opencode run "hello"')
Command Execution
  ↓ stdout/stderr
Return Result (synchronously)
```

**Implementation**:

```typescript
// src/server/TheWorldServer.ts
this.app.post('/api/oracle/send', async (req, res) => {
  const { to, region, message } = req.body;

  // Log to EverMemOS
  await this.memory.logOracle({ aiName: to, regionId: region, content: message });

  // Directly call RegionDaemon to execute
  const daemonClient = new RegionDaemonClient(region);
  const command = `opencode run "${message}" --format json`;
  const result = await daemonClient.execute('agent', command, 60000);

  // Return result synchronously
  res.json({ status: 'ok', response: parseResponse(result) });
});
```

## Rationale

### 1. Low Latency

-   Synchronous call: ~100-200ms
-   File polling: ~500-1000ms (depends on polling interval)
-   Better user experience.

### 2. Simplified Implementation

-   No inotify listener needed.
-   No file cleanup logic needed.
-   No file lock handling needed.
-   Reduces ~300 lines of code.

### 3. Better Error Handling

```typescript
// Synchronous call - get error directly
try {
  const result = await execute(command);
  return result;
} catch (error) {
  return { error: error.message };
}

// Asynchronous message - requires polling and timeout
while (timeout > 0) {
  if (fs.existsSync(resultFile)) {
    return fs.readFileSync(resultFile);
  }
  await sleep(100);
  timeout -= 100;
}
throw new Error('Timeout');
```

### 4. Sufficient for MVP Phase

-   Asynchronous decoupling not required.
-   Message queue not required.
-   Persistence not required (already logged by EverMemOS).

### 5. Preserves Extensibility

-   Inbox/outbox directories are already mounted (unused).
-   Asynchronous support can be added in the future.
-   Does not affect existing synchronous API.

## Consequences

### Positive

✅ Latency reduced 5-10x  
✅ Code complexity reduced ~40%  
✅ Error handling simplified  
✅ Debugging and testing easier  
✅ Better user experience (immediate feedback)

### Negative

⚠️ Gave up asynchronous decoupling  
⚠️ Long-running commands block the HTTP connection  
⚠️ Cannot implement "fire-and-forget" patterns

### Risk Mitigation

-   Set reasonable timeouts (default 60 seconds).
-   Support custom timeout parameters.
-   Log all operations via EverMemOS.
-   Future asynchronous API can be added (does not affect existing synchronous API).

## Performance Considerations

### Timeout Handling

```typescript
// RegionDaemon supports intelligent timeout
executeAsUser(user, command, timeout) {
  // Detect step_finish event, end early
  if (stdout.includes('"type":"step_finish"')) {
    clearTimeout(timer);
    resolve({ stdout, stderr });
  }
}
```

### Concurrency Support

-   Node.js asynchronous I/O supports multiple concurrent requests.
-   RegionDaemon is single-process but can handle multiple concurrent commands.
-   Actual test: 10 concurrent oracles < 2 seconds.

## Future Considerations

Consider adding asynchronous support if the following scenarios arise:

### Scenario 1: Long-Running Tasks

-   Task execution time > 5 minutes.
-   User does not need to wait for the result.

**Solution**: Add asynchronous API.

```typescript
POST /api/oracle/send-async
→ Returns task_id
→ Executes in background
→ Writes result to outbox

GET /api/oracle/result/:task_id
→ Queries result
```

### Scenario 2: Batch Tasks

-   Need to send multiple oracles.
-   Do not need immediate results.

**Solution**: Use inbox/outbox mechanism.

```typescript
// Batch write to inbox
for (const message of messages) {
  fs.writeFileSync(`/world/inbox/${message.id}.msg`, message.content);
}

// AI listens to inbox, processes, and writes to outbox
```

### Scenario 3: Offline Processing

-   AI needs to run continuously in the background.
-   Processes tasks in a queue.

**Solution**: Implement Heartbeat mechanism (see Roadmap).

## Actual Usage Patterns

### Current (Synchronous)

```bash
# Send oracle, wait for result
$ dio oracle send --to alpha --message "Analyze logs"
✅ AI Response: Found 3 errors...
```

### Future (Asynchronous, if needed)

```bash
# Send oracle, return immediately
$ dio oracle send-async --to alpha --message "Train model"
✅ Task submitted: task-123

# Query result later
$ dio oracle result task-123
⏳ In progress...

$ dio oracle result task-123
✅ Complete: Model accuracy 95%
```

## Related Decisions

-   ADR-001: Single-User Architecture
-   ADR-002: Unified Port Architecture

## References

-   `src/server/TheWorldServer.ts:189-243` - Oracle implementation
-   `src/region-daemon/RegionDaemon.ts:101-151` - Command execution
-   `src/region-daemon/RegionDaemonClient.ts:29-33` - Client invocation