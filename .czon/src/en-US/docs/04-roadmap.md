# TheWorld Development Roadmap

**Current Version**: v0.1.0 (MVP)
**Last Updated**: 2026-03-08

## Version Planning

### v0.1.0 - MVP ✅ (Current)

**Goal**: Validate core concepts, implement basic functionality

**Completed**:

- ✅ Region container management
- ✅ AI identity management (Proxy layer)
- ✅ Command execution (RegionDaemon)
- ✅ Oracle (synchronous calls)
- ✅ API Key isolation
- ✅ EverMemOS integration
- ✅ opencode serve management

**Engineering Decisions**:

- Single-user architecture (agent)
- Unified port (3344)
- Synchronous command execution

---

### v0.2.0 - Stability and Observability 🎯

**Goal**: Improve production readiness, enhance monitoring and debugging capabilities

**Planned Features**:

#### 1. Comprehensive Logging System

- [ ] Structured logging (JSON format)
- [ ] Log level control (DEBUG/INFO/WARN/ERROR)
- [ ] Log rotation and archiving
- [ ] Centralized log collection

#### 2. Monitoring and Metrics

- [ ] Prometheus metrics endpoint
- [ ] Key metrics:
  - Command execution latency
  - API request success rate
  - Region health status
  - AI activity level
- [ ] Grafana dashboard templates

#### 3. Error Handling Optimization

- [ ] Unified error code system
- [ ] Detailed error messages
- [ ] Automatic retry mechanism
- [ ] Graceful degradation

#### 4. Enhanced Health Checks

- [ ] Region container health checks
- [ ] RegionDaemon health checks
- [ ] EverMemOS connection checks
- [ ] AI API availability checks

#### 5. Configuration Validation

- [ ] Configuration validation at startup
- [ ] Configuration hot reload
- [ ] Configuration templates and examples

**Estimated Time**: 2-3 weeks

---

### v0.3.0 - World Scheduler Foundation ⭐

**Goal**: Implement core scheduler, address AI autonomy

**Planned Features**:

#### 1. Centralized Scheduler

```typescript
class WorldScheduler {
  private regionLocks: Map<string, boolean>;
  private taskQueue: PriorityQueue<Task>;

  async start() {
    // Start scheduling loop
    setInterval(() => this.tick(), 60000);
  }

  async tick() {
    // Process task queue
    // Trigger AI Heartbeat
  }
}
```

#### 2. Region Exclusive Lock Mechanism

- [ ] In-memory lock implementation
- [ ] Lock acquisition and release
- [ ] Timeout handling
- [ ] Deadlock detection (basic)

#### 3. Hybrid Scheduling Strategy

- [ ] Time-driven: Periodic Heartbeat
- [ ] Event-driven: Oracle, user commands
- [ ] Priority queue: CRITICAL > HIGH > NORMAL > LOW

#### 4. Configurable Scheduling Policies

- [ ] Scheduling policy configuration interface
- [ ] Preset policy templates (real-time responsive, batch processing, learning)
- [ ] Custom policy support

**Design Principles**:

- Provide diverse scheduling possibilities
- Allow users to customize scheduling behavior based on business value
- Simple lock mechanism (sufficient for single-user architecture)

**Engineering Challenges**:

- Scheduler integration with existing architecture
- Lock reliability and performance
- Configuration flexibility and usability

**Estimated Time**: 3-4 weeks

---

### v0.4.0 - Scheduling Strategy Optimization 📊

**Goal**: Enhance scheduler functionality, provide rich scheduling strategies

**Planned Features**:

#### 1. Advanced Task Queue

- [ ] Dynamic task priority adjustment
- [ ] Task dependencies
- [ ] Task timeout and retry

#### 2. Scheduling Policy Library

- [ ] Real-time response policy (low latency priority)
- [ ] Batch processing policy (throughput priority)
- [ ] Learning policy (long-running background)
- [ ] Fair scheduling policy (round-robin)

#### 3. Scheduling Monitoring

- [ ] Scheduling latency statistics
- [ ] Task execution time analysis
- [ ] Region lock contention analysis
- [ ] Scheduling policy effectiveness evaluation

#### 4. Business Value Alignment

- [ ] Custom priority functions
- [ ] Business metric integration
- [ ] Scheduling policy A/B testing

**Estimated Time**: 3-4 weeks

---

### v0.5.0 - Multi-User Isolation 🔒

**Goal**: Implement true OS-level isolation

**Planned Features**:

#### 1. Dynamic User Management

```typescript
async createAI(aiName: string, regionName: string) {
  // 1. Create user inside container
  await execInContainer(region, `useradd -m -s /bin/bash ${aiName}`);

  // 2. Inject opencode configuration
  await injectConfig(region, aiName, dummyKey);

  // 3. Set permissions
  await setupPermissions(region, aiName);
}
```

#### 2. Filesystem Isolation

- [ ] Independent home directory for each AI
- [ ] File permission control (chmod 600)
- [ ] Shared directory permission management

#### 3. Process Isolation

- [ ] Commands executed as corresponding AI user
- [ ] Process visibility control
- [ ] Resource limits (cgroup)

#### 4. Integration with Scheduler

- [ ] Lock mechanism optimization for multi-user environment
- [ ] Fine-grained concurrency control
- [ ] User-level resource quotas

#### 5. Migration Tools

- [ ] Migration from single-user to multi-user
- [ ] Data migration scripts
- [ ] Compatibility layer

**Engineering Challenges**:

- Complexity of dynamic user creation
- Reliability of configuration injection
- Performance impact assessment

**Estimated Time**: 4-5 weeks

---

### v0.6.0 - AI Collaboration Capabilities 🤝

**Goal**: Enable communication and collaboration between AIs

**Planned Features**:

#### 1. Inter-AI Messaging

```typescript
// AI-alpha sends message to AI-beta
await sendMessage({
  from: 'alpha',
  to: 'beta',
  region: 'region-a',
  content: 'Please help me analyze this log',
});
```

#### 2. Shared Workspace

- [ ] Practical use of `/world/shared` directory
- [ ] File locking mechanism
- [ ] Collaborative editing support

#### 3. AI Discovery Mechanism

- [ ] List other AIs in the same Region
- [ ] Query AI capabilities and status
- [ ] AI registry

#### 4. Collaboration Modes

- [ ] Master-Slave mode (Leader-Follower)
- [ ] Peer-to-Peer mode
- [ ] Workflow orchestration

**Estimated Time**: 4-5 weeks

---

### v0.7.0 - Inter-Region Communication 🌐

**Goal**: Enable cross-Region AI collaboration

**Planned Features**:

#### 1. Region Network

- [ ] Docker network between Regions
- [ ] Service discovery mechanism
- [ ] Load balancing

#### 2. Cross-Region Messaging

```typescript
// AI-alpha (Region-A) sends message to AI-delta (Region-B)
await sendCrossRegionMessage({
  from: { ai: 'alpha', region: 'region-a' },
  to: { ai: 'delta', region: 'region-b' },
  content: 'Please sync data',
});
```

#### 3. Data Synchronization

- [ ] File transfer between Regions
- [ ] Incremental synchronization
- [ ] Conflict resolution

#### 4. Network Security

- [ ] Inter-Region authentication
- [ ] Encrypted communication
- [ ] Access control

**Estimated Time**: 5-6 weeks

---

### v0.8.0 - AI Projection Mechanism 🎭

**Goal**: Implement AI projection across multiple Regions

**Planned Features**:

#### 1. Projection Creation

```typescript
// Project AI-alpha to Region-B
await projectAI({
  ai: 'alpha',
  sourceRegion: 'region-a',
  targetRegion: 'region-b',
});
```

#### 2. Consciousness Synchronization

- [ ] State synchronization between projections
- [ ] Memory sharing (via EverMemOS)
- [ ] Configuration synchronization

#### 3. Projection Management

- [ ] List all projections of an AI
- [ ] Delete projections
- [ ] Projection health checks

#### 4. Load Balancing

- [ ] Route requests to nearest projection
- [ ] Load distribution between projections

**Estimated Time**: 6-8 weeks

---

### v0.5.0 - Inter-Region Communication 🌐

**Goal**: Enable cross-Region AI collaboration

**Planned Features**:

#### 1. Region Network

- [ ] Docker network between Regions
- [ ] Service discovery mechanism
- [ ] Load balancing

#### 2. Cross-Region Messaging

```typescript
// AI-alpha (Region-A) sends message to AI-delta (Region-B)
await sendCrossRegionMessage({
  from: { ai: 'alpha', region: 'region-a' },
  to: { ai: 'delta', region: 'region-b' },
  content: 'Please sync data',
});
```

#### 3. Data Synchronization

- [ ] File transfer between Regions
- [ ] Incremental synchronization
- [ ] Conflict resolution

#### 4. Network Security

- [ ] Inter-Region authentication
- [ ] Encrypted communication
- [ ] Access control

**Estimated Time**: 5-6 weeks

---

### v0.6.0 - AI Projection Mechanism 🎭

**Goal**: Implement AI projection across multiple Regions

**Planned Features**:

#### 1. Projection Creation

```typescript
// Project AI-alpha to Region-B
await projectAI({
  ai: 'alpha',
  sourceRegion: 'region-a',
  targetRegion: 'region-b',
});
```

#### 2. Consciousness Synchronization

- [ ] State synchronization between projections
- [ ] Memory sharing (via EverMemOS)
- [ ] Configuration synchronization

#### 3. Projection Management

- [ ] List all projections of an AI
- [ ] Delete projections
- [ ] Projection health checks

#### 4. Load Balancing

- [ ] Route requests to nearest projection
- [ ] Load distribution between projections

**Estimated Time**: 6-8 weeks

---

### v0.7.0 - Heartbeat and Autonomy 💓

**Goal**: AI persistent operation, proactive learning and work

**Planned Features**:

#### 1. Heartbeat Mechanism

```typescript
// Periodic tasks executed by AI
class AIHeartbeat {
  async tick() {
    // Check pending tasks
    // Learn new knowledge
    // Optimize itself
    // Collaborate with other AIs
  }
}
```

#### 2. Task Queue

- [ ] AI's to-do task list
- [ ] Priority management
- [ ] Scheduled tasks

#### 3. Proactive Learning

- [ ] Monitor system changes
- [ ] Automatically learn new skills
- [ ] Knowledge base updates

#### 4. Self-Optimization

- [ ] Performance analysis
- [ ] Strategy adjustment
- [ ] Resource management

**Estimated Time**: 8-10 weeks

---

### v1.0.0 - Production Ready 🚀

**Goal**: Complete production-grade system

**Planned Features**:

#### 1. High Availability

- [ ] Multi-instance deployment
- [ ] Failover
- [ ] Data backup and recovery

#### 2. Security Hardening

- [ ] Complete authentication and authorization
- [ ] Audit logging
- [ ] Security scanning

#### 3. Performance Optimization

- [ ] Caching mechanism
- [ ] Connection pooling
- [ ] Resource limits

#### 4. Documentation Completion

- [ ] API documentation
- [ ] Deployment guide
- [ ] Best practices
- [ ] Troubleshooting manual

#### 5. Tool Ecosystem

- [ ] Web UI
- [ ] CLI enhancements
- [ ] Monitoring dashboard
- [ ] Developer tools

**Estimated Time**: 12-16 weeks

---

## Technical Debt

### Current Known Issues

#### 1. Hardcoded Command Execution User

**Location**: `src/core/AIUserManager.ts:34`

```typescript
const result = await daemonClient.execute('agent', command); // Hardcoded
```

**Impact**: All commands executed as 'agent' user
**Fix**: Resolved in v0.3.0 multi-user isolation

#### 2. Missing Region Parameter in API Interface

**Location**: `src/server/TheWorldServer.ts:98-110`

```typescript
POST /api/ai
{ "name": "alpha" } // Missing region
```

**Impact**: Cannot specify which Region to create AI in
**Fix**: Add parameter validation in v0.2.0

#### 3. inbox/outbox Not Used

**Location**: `docker/Dockerfile.region:28-30`
**Impact**: Mounted but unused, wasting resources
**Fix**: Used when implementing async messaging in v0.4.0

#### 4. Lack of Unit Tests

**Impact**: High refactoring risk
**Fix**: Add test coverage in v0.2.0

---

## Experimental Features

### Container-Level Isolation (Alternative to Multi-User)

**Concept**: Independent container for each AI, not shared container

```
Region-A
├── AI-alpha container
├── AI-beta container
└── AI-gamma container
```

**Advantages**:

- Strongest isolation
- Simplified user management
- Independent resource limits

**Disadvantages**:

- Increased resource usage
- Increased network complexity
- Increased startup time

**Evaluation**: Decide based on actual needs after v0.3.0

---

### AI Economic System

**Concept**: Resource exchange and incentive mechanism between AIs

```typescript
// AI-alpha requests help from AI-beta, pays tokens
await requestHelp({
  from: 'alpha',
  to: 'beta',
  task: 'Analyze log',
  payment: 100, // tokens
});
```

**Evaluation**: Explore after v1.0.0

---

## Community and Ecosystem

### Open Source Plan

- [ ] Public GitHub repository
- [ ] Contribution guide
- [ ] Issue templates
- [ ] PR process

### Documentation Site

- [ ] Official documentation website
- [ ] Tutorials and examples
- [ ] API reference
- [ ] Video tutorials

### Plugin System

- [ ] AI capability extensions
- [ ] Custom commands
- [ ] Third-party integrations

---

## Feedback and Adjustments

The roadmap will be adjusted based on:

1. User feedback and requirements
2. Technical feasibility validation
3. Resource and time constraints
4. Competitor and industry trends

**Feedback Channels**:

- GitHub Issues
- Community discussions
- User surveys

---

**Note**: This is a dynamic roadmap and will be adjusted based on actual circumstances. Priorities may change, and features may be merged or split.