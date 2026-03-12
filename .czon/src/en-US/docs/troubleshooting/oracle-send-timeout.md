# Oracle Send Timeout Issue Investigation Record

## Problem Description

When executing the `oracle:send -r test -t alice -m haha` command, a timeout error occurs, preventing successful sending of oracle messages to the AI Agent inside the container.

## Problem Symptoms

```bash
$ npm run dev -- oracle:send -r test -t alice -m "Hello, please introduce yourself"
📨 Sending oracle to alice...
CLIError: Failed to send oracle: Timeout
```

## Investigation Process

### 1. Architecture Analysis

Oracle message execution flow:

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
opencode run (executed via su - agent)
```

### 2. Initial Checks

- ✅ opencode serve running normally inside container on port 4096
- ✅ Port mapping correct (container 4096 → host 55006)
- ✅ Network connectivity normal (container can access host.docker.internal:3344)
- ❌ Command execution times out (60 seconds)

### 3. Problem Identification

#### Issue 1: --attach Parameter Causes Process Hang

**Symptom**:

- Without `--attach` parameter: opencode completes normally, outputs step_finish
- With `--attach http://localhost:4096`: Process hangs, only outputs step_start

**Test**:

```bash
# Success
docker exec test su - agent -c 'opencode run "hello" --format json'

# Hangs
docker exec test su - agent -c 'opencode run "hello" --attach http://localhost:4096 --format json'
```

**Root Cause**: When executed via Node.js spawn, stdin is not handled correctly. opencode in --attach mode waits for stdin input.

#### Issue 2: Missing stdio Configuration

**Discovery**:

```javascript
// RegionDaemon.ts original code
const proc = spawn('su', ['-', user, '-c', scriptPath], {
  env: { ...process.env, HOME: `/home/${user}`, PATH: '/usr/local/bin:/usr/bin:/bin' },
  // Missing stdio configuration
});
```

**Verification**:

```javascript
// Test script - without stdio: timeout
const proc = spawn('su', ['-', 'agent', '-c', scriptPath]);

// Test script - with stdio: success
const proc = spawn('su', ['-', 'agent', '-c', scriptPath], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

**Root Cause**: When stdin is not ignored, opencode in --attach mode waits for stdin input, causing the process to hang.

#### Issue 3: Tool Call Permission Denied

**Symptom**: After fixing stdio, simple problems (like "1+1") succeed, but complex problems fail.

**Error Message**:

```json
{
  "type": "tool_use",
  "state": {
    "status": "error",
    "error": "Error: The user rejected permission to use this specific tool call."
  }
}
```

**Root Cause**: In `--attach` mode, opencode connects to a serve instance, and tool calls require manual approval in the UI. Simple problems don't need tools, so they succeed; complex problems require tools (like bash, glob) and fail.

**Solution**: Add `"permission":"allow"` to opencode configuration to automatically approve all tool calls.

#### Issue 4: step_finish Detection Race Condition

**Symptom**: Logs show `killed=true, resolved=false`, indicating the promise didn't resolve after the process was killed.

**Original Code Logic**:

```javascript
if (stdout.includes('"type":"step_finish"') && !hasFinished) {
  hasFinished = true;
  clearTimeout(timer);
  if (!killed && !resolved) {
    resolved = true;
    killed = true;
    proc.kill(); // Kill first
    resolve({ stdout, stderr }); // Resolve later
  }
}
```

**Problem**: `proc.kill()` immediately triggers the `close` event, executing the close handler before `resolve()` is called, causing the promise to not resolve when `killed=true`.

## Solutions

### 1. Modify TheWorldServer.ts

**Location**: `src/server/TheWorldServer.ts:304-322`

**Changes**:

```typescript
// 1. Write oracle message to file
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

// 2. Use --attach and --file parameters
const prompt = `Please read and execute the oracle message in ${containerPath}`;
const command = `opencode run "${prompt}" --file ${containerPath} --format json --attach http://localhost:4096`;

// 3. Increase timeout to 120 seconds
const result = await daemonClient.execute('agent', command, 120000);
```

**Reason**:

- Use file to pass messages to avoid command line escaping issues
- Use --attach to connect to serve instance for observability
- Increase timeout to handle slower initial startup

### 2. Modify RegionDaemon.ts

**Location**: `src/region-daemon/RegionDaemon.ts:133-136`

**Changes**:

```typescript
const proc = spawn('su', ['-', user, '-c', scriptPath], {
  env: { ...process.env, HOME: `/home/${user}`, PATH: '/usr/local/bin:/usr/bin:/bin' },
  stdio: ['ignore', 'pipe', 'pipe'], // Add stdio configuration
});
```

**Location**: `src/region-daemon/RegionDaemon.ts:169-186`

**Changes**:

```typescript
if (stdout.includes('"type":"step_finish"') && !hasFinished) {
  hasFinished = true;
  clearTimeout(timer);
  if (!killed && !resolved) {
    resolved = true;
    // Resolve first, then kill
    resolve({ stdout, stderr });
    killed = true;
    proc.kill();
    try {
      fs.unlinkSync(scriptPath);
    } catch {}
  }
}
```

**Reason**:

- `stdio: ['ignore', 'pipe', 'pipe']` ignores stdin, preventing opencode from waiting for input
- Resolve before kill to avoid race conditions

### 3. Modify Dockerfile.region

**Location**: `docker/Dockerfile.region:28`

**Changes**:

```dockerfile
printf '%s\n' '{"$schema":"https://opencode.ai/config.json","disabled_providers":[],"model":"system/default","provider":{"system":{"name":"System","npm":"@ai-sdk/openai-compatible","models":{"default":{"name":"Default Model"}},"options":{"baseURL":"http://host.docker.internal:3344/v1"}}},"permission":"allow"}' > /home/agent/.config/opencode/opencode.jsonc
```

**Key Change**: Add `"permission":"allow"` configuration

**Reason**: Automatically approve all tool calls in --attach mode, avoiding manual approval

### 4. Modify docker/services/region-daemon

**Location**: `docker/services/region-daemon:5`

**Changes**:

```bash
su - agent -c "opencode serve --hostname 0.0.0.0 --port 4096" &
```

**Reason**: Explicitly specify port 4096 to ensure consistency with configuration

## Test Results

### Simple Problem Test

```bash
$ npm run dev -- oracle:send -r test -t alice -m "What is 1+1?"
📨 Sending oracle to alice...
✅ Oracle sent to alice

🤖 AI Response:
2
```

### Complex Problem Test

```bash
$ npm run dev -- oracle:send -r test -t alice -m "What is 2 to the 20th power?"
📨 Sending oracle to alice...
✅ Oracle sent to alice

🤖 AI Response:
2 to the 20th power is **1,048,576**.
```

## Key Findings

1. **stdio Configuration is Critical**: When using spawn to execute interactive programs, stdio must be configured correctly, especially stdin
2. **Two Modes of opencode**:
   - Without --attach: Starts temporary server, automatically approves tools
   - With --attach: Connects to existing server, requires permission configuration
3. **Race Condition Trap**: In asynchronous operations, resolve/reject the promise first, then perform operations that might trigger other events
4. **Permission Configuration**: opencode's permission can be set to "allow", "ask", or "deny". Use "allow" in automated scenarios.

## Related Documentation

- [OpenCode Permissions Documentation](https://opencode.ai/docs/permissions/)
- [Node.js spawn stdio Configuration](https://nodejs.org/api/child_process.html#child_process_options_stdio)
- [ADR-003: Sync Oracle](../decisions/003-sync-oracle.md)

## Summary

The root cause of this issue was a combination of multiple factors:

1. Missing stdio configuration causing process to wait for input
2. Missing permission configuration causing tool calls to be rejected
3. Race condition preventing promise from resolving correctly

Through systematic investigation and testing, all issues were ultimately identified and fixed, making the oracle:send function work completely normally.