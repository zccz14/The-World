# ADR-002: Unified Port Architecture

## Status

Accepted

## Date

2026-03-08

## Context

The architecture proposed in `SERVER_REDESIGN.md`:

```
Host Machine
├── TheWorld Daemon (HTTP Server)
│   └── Port: 1996 (TheWorld API Server)
│
└── AI Proxy Server
    └── Port: 3456 (AI API Proxy)
```

Advantages of this separated architecture:

- Separation of concerns (API Server vs Proxy)
- Can scale independently
- Aligns with microservices philosophy

But it also introduces complexity:

- Need to manage two ports
- Requires two independent processes
- More complex configuration
- Increased deployment and monitoring costs

## Decision

Use a single port, 3344, and differentiate responsibilities via paths:

```
TheWorldServer (Port 3344)
├── /health                    # Health check
├── /api/status                # Status query
├── /api/regions               # Region management
├── /api/ai                    # AI management
├── /api/ai/exec               # Command execution
├── /api/oracle/send           # Oracle
├── /api/agent/:region/:user/* # Agent management
├── /opencode/:region/*        # OpenCode proxy
└── /v1/*                      # AI API proxy
```

**Implementation**:

```typescript
export class TheWorldServer {
  private app: Express;
  private proxyHandler: AIProxyHandler;

  constructor() {
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes() {
    // API routes
    this.app.get('/health', ...);
    this.app.post('/api/regions', ...);
    // ...

    // AI Proxy (integrated into the same service)
    this.app.use('/v1', this.proxyHandler.getMiddleware());
  }

  start(port: number = 3344) {
    this.app.listen(port);
  }
}
```

## Rationale

### 1. Simplified Deployment

- Only need to manage one port
- Only need to start one process
- Firewall configuration is simple

### 2. Simplified Configuration

```bash
# Before (two ports)
THEWORLD_PORT=1996
AI_PROXY_PORT=3456

# Now (one port)
SERVER_PORT=3344
```

### 3. Unified Monitoring and Logging

- Single health check endpoint
- Unified log output
- Simplified error tracing

### 4. Better Developer Experience

- Local development only requires starting one service
- Debugging is simpler
- Testing is easier

### 5. Path Differentiation is Sufficiently Clear

- `/api/*` - TheWorld management API
- `/v1/*` - AI API proxy
- Clear responsibility boundaries without physical separation

## Consequences

### Positive Impacts

✅ Deployment complexity reduced by 50%  
✅ Configuration simplified  
✅ Port management simplified  
✅ Monitoring and logging unified  
✅ Development and debugging efficiency improved

### Negative Impacts

⚠️ Single point of failure (if the service fails, all functionality is unavailable)  
⚠️ Cannot scale API Server and Proxy independently  
⚠️ Resource contention (API and Proxy share process resources)

### Risk Mitigation

- Node.js asynchronous I/O performance is sufficient
- Traffic is low during the MVP phase, a single process is adequate
- Can scale via load balancing in the future
- Can improve availability using PM2 cluster mode

## Performance Considerations

### Single Process Performance Tests

- 50 concurrent requests: < 1 second
- API latency: ~10-50ms
- Proxy latency: ~100-200ms (depends on upstream)
- Memory usage: ~50MB

### Scalability

If scaling is needed in the future, we can:

1. Use PM2 cluster mode (multi-process)
2. Use Nginx load balancing (multi-instance)
3. Split into microservices (if truly necessary)

## Future Considerations

Consider splitting if the following scenarios occur:

### Scenario 1: Performance Bottleneck

- API Server and Proxy negatively impact each other
- Single process cannot meet concurrency demands
- Need to scale independently

**Solution**: Split into two services, use load balancing

### Scenario 2: Security Isolation

- Need stronger security boundaries
- Proxy requires independent security policies

**Solution**: Deploy Proxy independently, use separate network policies

### Scenario 3: Team Division

- Different teams responsible for API and Proxy
- Need independent release cycles

**Solution**: Split into independent code repositories and services

## Related Decisions

- ADR-001: Single-User Architecture
- ADR-003: Synchronous Command Execution

## References

- `src/server/TheWorldServer.ts` - Unified service implementation
- `src/utils/config.ts:34-37` - Port configuration
- `.env.example:41-43` - Configuration example