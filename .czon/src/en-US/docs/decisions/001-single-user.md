# ADR-001: Use a Single Agent User Instead of Multi-User Isolation

## Status

Adopted

## Date

2026-03-08

## Context

The long-term vision (`docs/01-vision.md`) envisions each AI having its own separate Linux user (alpha, beta, gamma), achieving full OS-level isolation:

```
Region Container
├── AI-alpha (user: alpha, uid: 1001)
├── AI-beta (user: beta, uid: 1002)
└── AI-gamma (user: gamma, uid: 1003)
```

Advantages of this design:

- Complete filesystem isolation (chmod 600 is effective)
- Process isolation (visible in `ps aux` but cannot interfere)
- Aligns with Unix philosophy
- True multi-tenant architecture

However, during the MVP phase, this introduces significant complexity:

- Requires dynamic user creation (`useradd`)
- Requires injecting configuration files for each user
- Requires managing user permissions and home directories
- Increases container startup time
- Increases debugging and maintenance costs

## Decision

For the MVP phase, use a single `agent` user and achieve identity isolation through dummy keys in the Proxy layer.

**Implementation**:

1. Create a single `agent` user during container build
2. Pre-configure the opencode configuration file
3. Execute all commands under the `agent` user identity
4. Distinguish between different AIs via the dummy key in `AIProxyHandler`

```typescript
// Generate a unique dummy key when an AI is registered
const dummyKey = `tw-${aiName}-${Date.now()}`;
aiIdentities.set(dummyKey, { aiName, dummyKey });

// All AIs share the agent user but use different dummy keys
```

## Rationale

### 1. Simplified Deployment

- No dynamic user management required
- Container image can be pre-configured
- Startup time < 2 seconds

### 2. Reduced Complexity

- Reduces user management code by ~50%
- Avoids debugging permission issues
- Simplifies the configuration injection process

### 3. Acceptable MVP Security (Subject to Baseline Constraints)

- The Proxy layer already provides identity isolation
- API Keys cannot escape (dummy key mechanism)
- Audit logs record all operations
- File-level isolation is not a priority for the MVP phase
- This compromise is valid only when the runtime security baseline is met (see ADR-007)

### 4. Performance Benefits

- No need to create a user for each AI
- Reduces resource usage within the container
- Simplifies the command execution flow

## Consequences

### Positive

✅ Deployment complexity significantly reduced  
✅ Development speed increased 3-5x  
✅ Maintenance costs lowered  
✅ Container startup speed improved

### Negative

⚠️ OS-level file permission isolation is sacrificed  
⚠️ All AIs can read each other's files  
⚠️ Cannot use the Linux permission model for access control

### Risk Mitigation

- The Proxy layer provides API-level identity isolation
- EverMemOS logs all operations for auditability
- Stronger isolation can be achieved in the future via container-level isolation (separate container per AI)
- Default adherence to ADR-007 (non-root, least privilege, disabling high-risk mounts and privileged mode)

## Future Considerations

If true file isolation is needed, there are two evolution paths:

### Path 1: Dynamic Multi-User

```typescript
async createAI(aiName: string, regionName: string) {
  // 1. Create user inside the container
  await execInContainer(region, `useradd -m -s /bin/bash ${aiName}`);

  // 2. Inject configuration
  await injectConfig(region, aiName, dummyKey);

  // 3. Execute commands using the corresponding user
  await execAsUser(region, aiName, command);
}
```

**Advantage**: Maintains single-container, multi-AI architecture  
**Disadvantage**: Increases complexity, requires refactoring

### Path 2: Container-Level Isolation

```
Region-A
├── AI-alpha Container
├── AI-beta Container
└── AI-gamma Container
```

**Advantage**: Strongest isolation, simplifies user management  
**Disadvantage**: Increased resource usage, increased network complexity

## Related Decisions

- ADR-002: Unified Port Architecture
- ADR-003: Synchronous Command Execution
- ADR-007: Runtime Security Baseline

## References

- `src/core/AIUserManager.ts:19-24` - AI creation implementation
- `docker/Dockerfile.region:14-22` - agent user configuration
- `src/proxy/AIProxyHandler.ts:84-89` - dummy key mechanism