# ADR-004: World Scheduler Architecture Design

## Status

Planned (Implementation in v0.3.0)

## Date

2026-03-08

## Context

The current MVP architecture is **completely passive and reactive**:

```
User sends command → TheWorldServer → RegionDaemon → Execution → Returns result
```

This leads to a fundamental problem: **AI cannot act autonomously**.

The long-term vision mentions:

- "AI is always in an 'awake' state"
- "Driven by a Heartbeat mechanism"
- "AI can actively learn, explore, work"

However, key architectural components are missing to achieve these goals:

- **What triggers the Heartbeat?**
- **How to schedule the execution of multiple AIs?**
- **How to manage task queues and priorities?**
- **How to handle resource contention?**

## Decision

Introduce the **World Scheduler** as a core architectural component.

### Architectural Position

```
TheWorldServer
├── World Scheduler (New) ⭐
│   ├── Scheduling Loop (Periodic tick)
│   ├── Region Lock Management
│   ├── Task Queue (Priority)
│   └── Scheduling Strategy (Configurable)
│
├── AI Proxy Handler
├── Region Manager
└── AI User Manager
```

### Core Responsibilities

1.  **Time-Driven**: Periodically triggers AI Heartbeats.
2.  **Event-Driven**: Responds to oracles, user commands, messages, etc.
3.  **Concurrency Control**: Manages resource contention via Region exclusive locks.
4.  **Task Queue**: Manages pending tasks, supporting priority scheduling.
5.  **Configurability**: Scheduling strategies can be customized based on business value.

### Design Choices

#### 1. Centralized Scheduler + Region Exclusive Lock

**Reason for Choice**:

-   In a single-user architecture, the true purpose of multi-user isolation is **concurrency control**.
-   Using **Region exclusive locks** is simpler than multi-user isolation.
-   Only one AI executes in a Region at any given time.
-   Avoids resource contention and state conflicts.

**Implementation**:

```typescript
class WorldScheduler {
  private regionLocks = new Map<string, boolean>();

  async executeTask(ai: string, region: string, task: Task) {
    // Acquire Region lock
    await this.acquireRegionLock(region);

    try {
      // Execute task
      await this.execute(ai, region, task);
    } finally {
      // Release lock
      this.releaseRegionLock(region);
    }
  }
}
```

**Alternative (Not Chosen)**:

-   Hierarchical Scheduler (Global + Region): Too complex, not needed for MVP.
-   Multi-User Isolation: Already decided in ADR-001 to be deferred until v0.5.0.

#### 2. Hybrid Scheduling Strategy

**Reason for Choice**:

-   Different business scenarios have different definitions of value.
-   Flexible scheduling configuration capability is needed.
-   Allows users to customize scheduling behavior based on business value.

**Scheduling Modes**:

**Time-Driven (Periodic Heartbeat)**:

```typescript
async tick() {
  for (const ai of this.aiList) {
    if (ai.shouldRunHeartbeat()) {
      await this.scheduleTask(ai, {
        type: 'heartbeat',
        priority: 'LOW'
      });
    }
  }
}
```

**Event-Driven (Immediate Response)**:

```typescript
async onOracle(ai: string, message: string) {
  await this.scheduleTask(ai, {
    type: 'oracle',
    priority: 'CRITICAL',
    message
  });
}
```

**Priority Definition**:

```typescript
enum TaskPriority {
  CRITICAL = 0, // Oracle, urgent events
  HIGH = 1, // User commands
  NORMAL = 2, // Daily tasks
  LOW = 3, // Heartbeat, learning
}
```

#### 3. Configurable Scheduling Strategy

**Core Principle**: Provide diverse scheduling possibilities to align with different business values.

**Preset Strategy Templates**:

**Real-Time Responsive**:

```typescript
{
  heartbeatInterval: 3600000,  // 1 hour
  priorityWeights: {
    CRITICAL: 1000,
    HIGH: 100,
    NORMAL: 10,
    LOW: 1
  },
  maxConcurrentTasks: 10
}
```

**Batch Processing**:

```typescript
{
  heartbeatInterval: 86400000,  // 24 hours
  batchSize: 100,
  batchInterval: 3600000,  // Process in batches every hour
  priorityWeights: {
    CRITICAL: 100,
    HIGH: 10,
    NORMAL: 5,
    LOW: 1
  }
}
```

**Learning-Oriented**:

```typescript
{
  heartbeatInterval: 300000,  // 5 minutes
  longRunningTaskTimeout: 3600000,  // 1 hour
  priorityWeights: {
    CRITICAL: 1000,
    HIGH: 10,
    NORMAL: 5,
    LOW: 100  // High priority for learning tasks
  }
}
```

**Custom Strategy**:

```typescript
interface ScheduleStrategy {
  // Calculate task priority
  calculatePriority(task: Task): number;

  // Decide whether to execute a task
  shouldExecute(task: Task, context: Context): boolean;

  // Select the next task
  selectNextTask(queue: Task[]): Task | null;
}
```

## Rationale

### 1. Solving AI Autonomy

**Current Problem**: AI is completely passive, unable to act autonomously.

**Solution**:

-   World Scheduler periodically triggers Heartbeats.
-   AI can perform daily tasks during Heartbeats.
-   Achieves a true "always-on" state.

### 2. Unified Task Management

**Current Problem**: Oracles, commands, messages, etc., are handled separately.

**Solution**:

-   Unified task queue.
-   Priority management.
-   Fair scheduling.

### 3. Simplified Concurrency Control

**Current Problem**: Lack of concurrency control in a single-user architecture.

**Solution**:

-   Region exclusive locks.
-   Avoids resource contention.
-   Simple and reliable.

### 4. Alignment with Business Value

**Core Insight**: Scheduling strategy must align with business value.

**Design Principle**:

-   Do not predefine a "correct" scheduling strategy.
-   Provide flexible configuration capabilities.
-   Allow users to customize based on business scenarios.

**Example Scenarios**:

**Scenario 1: Customer Service Bot**

-   Business Value: Response speed.
-   Scheduling Strategy: Real-Time Responsive, high-priority event-driven.

**Scenario 2: Data Analysis**

-   Business Value: Throughput.
-   Scheduling Strategy: Batch Processing, scheduled batch execution.

**Scenario 3: AI Research**

-   Business Value: Learning effectiveness.
-   Scheduling Strategy: Learning-Oriented, long-running background tasks.

## Consequences

### Positive Impacts

✅ **Enables AI Autonomy** - AI can actively learn, explore, work.  
✅ **Unified Task Management** - Oracles, commands, messages are scheduled uniformly.  
✅ **Simplifies Concurrency Control** - Region locks replace multi-user isolation.  
✅ **Flexible and Configurable** - Adapts to different business scenarios.  
✅ **Lays Foundation for Future Extensions** - Prerequisite for features like projection, collaboration.

### Negative Impacts

⚠️ **Increases System Complexity** - Adds a new core component.  
⚠️ **Scheduling Latency** - Tasks need to queue and wait.  
⚠️ **Lock Contention** - Multiple AIs compete for the same Region.  
⚠️ **Configuration Complexity** - Users need to understand scheduling strategies.

### Risk Mitigation

-   Provide reasonable default configurations.
-   Provide preset strategy templates.
-   Detailed documentation and examples.
-   Monitoring and debugging tools.

## Implementation Plan

### v0.3.0 - Basic Implementation

**Core Features**:

-   Centralized scheduler.
-   Region exclusive lock (in-memory implementation).
-   Periodic Heartbeat (every hour).
-   Simple priority queue.

**Code Structure**:

```typescript
// src/scheduler/WorldScheduler.ts
export class WorldScheduler {
  private regionLocks: Map<string, boolean>;
  private taskQueue: PriorityQueue<Task>;
  private strategy: ScheduleStrategy;

  async start() {}
  async tick() {}
  async scheduleTask(task: Task) {}
  async executeTask(task: Task) {}
}

// src/scheduler/strategies/
export class RealtimeStrategy implements ScheduleStrategy {}
export class BatchStrategy implements ScheduleStrategy {}
export class LearningStrategy implements ScheduleStrategy {}
```

### v0.4.0 - Strategy Optimization

**Enhanced Features**:

-   Advanced task queue (dependencies, timeouts, retries).
-   Scheduling strategy library.
-   Monitoring and analytics.
-   Custom strategy support.

### v0.5.0+ - Integration with Multi-User Isolation

**Evolution Direction**:

-   Optimized lock mechanisms for multi-user environments.
-   Fine-grained concurrency control.
-   User-level resource quotas.

## Future Considerations

### Distributed Scheduling

If scheduling across multiple TheWorld instances is needed:

-   Use Redis for distributed locks.
-   Use message queues (RabbitMQ/Kafka).
-   Use distributed schedulers (Kubernetes CronJob).

### Intelligent Scheduling

AI-based scheduling optimization:

-   Learn task execution patterns.
-   Predict task execution times.
-   Dynamically adjust priorities.

### Fault Tolerance and Recovery

-   Task persistence.
-   Scheduler failure recovery.
-   Task retry mechanisms.

## Related Decisions

-   ADR-001: Single-User Architecture - Region locks replace multi-user isolation.
-   ADR-003: Synchronous Command Execution - Scheduler uniformly manages synchronous and asynchronous tasks.

## References

-   `docs/01-vision.md` - Position of World Scheduler in the vision.
-   `docs/04-roadmap.md` - v0.3.0 implementation plan.
-   Future implementation: `src/scheduler/WorldScheduler.ts`