# ADR-004: World Scheduler 架构设计

## 状态

已规划（v0.3.0 实现）

## 日期

2026-03-08

## 背景

当前 MVP 架构是**完全被动响应式**的：

```
用户发送命令 → TheWorldServer → RegionDaemon → 执行 → 返回结果
```

这导致了一个根本性的问题：**AI 无法自主行动**。

长期愿景中提到：

- "AI 一直处于'醒着'的状态"
- "由 Heartbeat 机制驱动"
- "AI 可以主动学习、探索、工作"

但缺少了关键的架构组件来实现这些目标：

- **谁来触发 Heartbeat？**
- **如何调度多个 AI 的执行？**
- **如何管理任务队列和优先级？**
- **如何处理资源竞争？**

## 决策

引入 **World Scheduler（世界调度器）** 作为核心架构组件。

### 架构位置

```
TheWorldServer
├── World Scheduler (新增) ⭐
│   ├── 调度循环（定期 tick）
│   ├── Region 锁管理
│   ├── 任务队列（优先级）
│   └── 调度策略（可配置）
│
├── AI Proxy Handler
├── Region Manager
└── AI User Manager
```

### 核心职责

1. **时间驱动**：定期触发 AI 的 Heartbeat
2. **事件驱动**：响应神谕、用户命令、消息等
3. **并发控制**：通过 Region 独占锁管理资源竞争
4. **任务队列**：管理待办任务，支持优先级调度
5. **可配置性**：调度策略可根据业务价值定制

### 设计选择

#### 1. 中心化调度器 + Region 独占锁

**选择理由**：

- 单用户架构下，多用户隔离的真正目的是**并发控制**
- 用 **Region 独占锁** 替代多用户隔离，更简单
- 同一 Region 同一时间只有一个 AI 在执行
- 避免资源竞争和状态冲突

**实现方式**：

```typescript
class WorldScheduler {
  private regionLocks = new Map<string, boolean>();

  async executeTask(ai: string, region: string, task: Task) {
    // 获取 Region 锁
    await this.acquireRegionLock(region);

    try {
      // 执行任务
      await this.execute(ai, region, task);
    } finally {
      // 释放锁
      this.releaseRegionLock(region);
    }
  }
}
```

**替代方案（未采纳）**：

- 分层调度器（Global + Region）：过于复杂，MVP 不需要
- 多用户隔离：已在 ADR-001 中决定推迟到 v0.5.0

#### 2. 混合调度策略

**选择理由**：

- 不同业务场景有不同的价值定义
- 需要提供灵活的调度配置能力
- 让用户根据业务价值定制调度行为

**调度模式**：

**时间驱动（定期 Heartbeat）**：

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

**事件驱动（即时响应）**：

```typescript
async onOracle(ai: string, message: string) {
  await this.scheduleTask(ai, {
    type: 'oracle',
    priority: 'CRITICAL',
    message
  });
}
```

**优先级定义**：

```typescript
enum TaskPriority {
  CRITICAL = 0, // 神谕、紧急事件
  HIGH = 1, // 用户命令
  NORMAL = 2, // 日常任务
  LOW = 3, // Heartbeat、学习
}
```

#### 3. 可配置的调度策略

**核心原则**：提供多样化的调度可能性，适应不同业务价值

**预设策略模板**：

**实时响应型**：

```typescript
{
  heartbeatInterval: 3600000,  // 1 小时
  priorityWeights: {
    CRITICAL: 1000,
    HIGH: 100,
    NORMAL: 10,
    LOW: 1
  },
  maxConcurrentTasks: 10
}
```

**批处理型**：

```typescript
{
  heartbeatInterval: 86400000,  // 24 小时
  batchSize: 100,
  batchInterval: 3600000,  // 每小时批量处理
  priorityWeights: {
    CRITICAL: 100,
    HIGH: 10,
    NORMAL: 5,
    LOW: 1
  }
}
```

**学习型**：

```typescript
{
  heartbeatInterval: 300000,  // 5 分钟
  longRunningTaskTimeout: 3600000,  // 1 小时
  priorityWeights: {
    CRITICAL: 1000,
    HIGH: 10,
    NORMAL: 5,
    LOW: 100  // 学习任务高优先级
  }
}
```

**自定义策略**：

```typescript
interface ScheduleStrategy {
  // 计算任务优先级
  calculatePriority(task: Task): number;

  // 决定是否执行任务
  shouldExecute(task: Task, context: Context): boolean;

  // 选择下一个任务
  selectNextTask(queue: Task[]): Task | null;
}
```

## 理由

### 1. 解决 AI 自主性问题

**当前问题**：AI 完全被动，无法主动行动

**解决方案**：

- World Scheduler 定期触发 Heartbeat
- AI 可以在 Heartbeat 中执行日常任务
- 实现真正的"常驻状态"

### 2. 统一的任务管理

**当前问题**：神谕、命令、消息等分散处理

**解决方案**：

- 统一的任务队列
- 优先级管理
- 公平调度

### 3. 简化并发控制

**当前问题**：单用户架构下缺少并发控制

**解决方案**：

- Region 独占锁
- 避免资源竞争
- 简单可靠

### 4. 业务价值对齐

**核心洞察**：调度策略必然与业务价值对齐

**设计原则**：

- 不预设"正确"的调度策略
- 提供灵活的配置能力
- 让用户根据业务场景定制

**示例场景**：

**场景 1：客服机器人**

- 业务价值：响应速度
- 调度策略：实时响应型，高优先级事件驱动

**场景 2：数据分析**

- 业务价值：吞吐量
- 调度策略：批处理型，定时批量执行

**场景 3：AI 研究**

- 业务价值：学习效果
- 调度策略：学习型，长时间后台运行

## 后果

### 正面影响

✅ **实现 AI 自主性** - AI 可以主动学习、探索、工作  
✅ **统一任务管理** - 神谕、命令、消息统一调度  
✅ **简化并发控制** - Region 锁替代多用户隔离  
✅ **灵活可配置** - 适应不同业务场景  
✅ **为未来扩展奠定基础** - 投影、协作等功能的前提

### 负面影响

⚠️ **增加系统复杂度** - 新增核心组件  
⚠️ **调度延迟** - 任务需要排队等待  
⚠️ **锁竞争** - 多个 AI 竞争同一 Region  
⚠️ **配置复杂性** - 用户需要理解调度策略

### 风险缓解

- 提供合理的默认配置
- 提供预设策略模板
- 详细的文档和示例
- 监控和调试工具

## 实现计划

### v0.3.0 - 基础实现

**核心功能**：

- 中心化调度器
- Region 独占锁（内存实现）
- 定期 Heartbeat（每小时）
- 简单的优先级队列

**代码结构**：

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

### v0.4.0 - 策略优化

**增强功能**：

- 高级任务队列（依赖、超时、重试）
- 调度策略库
- 监控和分析
- 自定义策略支持

### v0.5.0+ - 与多用户隔离集成

**演进方向**：

- 多用户环境下的锁机制优化
- 细粒度并发控制
- 用户级别的资源配额

## 未来考虑

### 分布式调度

如果需要跨多个 TheWorld 实例调度：

- 使用 Redis 实现分布式锁
- 使用消息队列（RabbitMQ/Kafka）
- 使用分布式调度器（Kubernetes CronJob）

### 智能调度

基于 AI 的调度优化：

- 学习任务执行模式
- 预测任务执行时间
- 动态调整优先级

### 容错和恢复

- 任务持久化
- 调度器故障恢复
- 任务重试机制

## 相关决策

- ADR-001: 单用户架构 - Region 锁替代多用户隔离
- ADR-003: 同步命令执行 - 调度器统一管理同步和异步任务

## 参考

- `docs/01-vision.md` - World Scheduler 在愿景中的位置
- `docs/04-roadmap.md` - v0.3.0 实现计划
- 未来实现：`src/scheduler/WorldScheduler.ts`
