import { AIUserManager } from '../core/AIUserManager';
import { RegionManager } from '../core/RegionManager';
import { WorldMemory } from '../memory/MemoryManager';
import { logger } from '../utils/logger';
import { RegionLockManager } from './RegionLockManager';
import { TaskQueue } from './TaskQueue';
import { BatchStrategy } from './strategies/BatchStrategy';
import { LearningStrategy } from './strategies/LearningStrategy';
import { RealtimeStrategy } from './strategies/RealtimeStrategy';
import { ScheduleStrategy } from './strategies/ScheduleStrategy';
import {
  NewTaskInput,
  SchedulerConfig,
  SchedulerStatus,
  Task,
  TaskPriority,
  TaskResult,
} from './types';

export class WorldScheduler {
  private taskQueue: TaskQueue;
  private lockManager = new RegionLockManager();
  private strategy: ScheduleStrategy;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private tickInProgress = false;
  private lastTickAt: number | null = null;
  private heartbeatMap = new Map<string, number>();

  constructor(
    private aiManager: AIUserManager,
    private regionManager: RegionManager,
    private memory: WorldMemory,
    private config: SchedulerConfig
  ) {
    this.taskQueue = new TaskQueue(config.persistencePath);
    this.strategy = this.buildStrategy(config);
  }

  async start(): Promise<void> {
    if (!this.config.enabled || this.running) {
      return;
    }

    await this.taskQueue.load();
    this.running = true;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.tickInterval);
    await this.tick();

    logger.info(
      {
        strategy: this.strategy.getConfig().name,
        queueSize: this.taskQueue.size(),
      },
      'World Scheduler started'
    );
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.running = false;
    await this.taskQueue.save();
    logger.info('World Scheduler stopped');
  }

  async scheduleTask(input: NewTaskInput): Promise<string> {
    const task: Task = {
      ...input,
      id: this.generateTaskId(),
      createdAt: Date.now(),
    };

    this.taskQueue.enqueue(task);
    await this.taskQueue.save();

    await this.memory.logSystemEvent({
      type: 'scheduler_task_enqueued',
      aiName: task.aiName,
      regionId: task.regionName,
      timestamp: Date.now(),
      details: {
        taskId: task.id,
        taskType: task.type,
        priority: task.priority,
      },
    });

    return task.id;
  }

  getStatus(): SchedulerStatus {
    return {
      enabled: this.config.enabled,
      strategy: this.strategy.getConfig().name,
      running: this.running,
      queueSize: this.taskQueue.size(),
      lastTickAt: this.lastTickAt,
      lockedRegions: this.lockManager.getLockedRegions(),
    };
  }

  getPendingTasks(): Task[] {
    return this.taskQueue.list();
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const removed = this.taskQueue.removeById(taskId);
    if (removed) {
      await this.taskQueue.save();
    }
    return removed;
  }

  private async tick(): Promise<void> {
    if (!this.running || this.tickInProgress) {
      return;
    }

    this.tickInProgress = true;
    this.lastTickAt = Date.now();

    try {
      await this.generateHeartbeatTasks();

      while (!this.taskQueue.isEmpty()) {
        const candidate = this.pickNextExecutableTask();
        if (!candidate) {
          break;
        }

        const task = this.taskQueue.dequeueById(candidate.id);
        if (!task) {
          continue;
        }

        await this.executeTask(task);
      }

      await this.taskQueue.save();
    } catch (error: unknown) {
      logger.error({ error }, 'World Scheduler tick failed');
    } finally {
      this.tickInProgress = false;
    }
  }

  private pickNextExecutableTask(): Task | null {
    const queue = this.taskQueue.list().filter(task => !this.lockManager.isLocked(task.regionName));

    return this.strategy.selectNextTask(queue);
  }

  private async generateHeartbeatTasks(): Promise<void> {
    const aiList = this.aiManager.listAllAI();
    const regions = await this.regionManager.listRegions();

    for (const aiName of aiList) {
      for (const regionName of regions) {
        const key = `${aiName}:${regionName}`;
        const lastHeartbeatAt = this.heartbeatMap.get(key);
        if (!this.strategy.shouldRunHeartbeat(lastHeartbeatAt)) {
          continue;
        }

        const alreadyQueued = this.taskQueue
          .list()
          .some(
            task =>
              task.type === 'heartbeat' && task.aiName === aiName && task.regionName === regionName
          );
        if (alreadyQueued) {
          continue;
        }

        this.taskQueue.enqueue({
          id: this.generateTaskId(),
          type: 'heartbeat',
          priority: TaskPriority.LOW,
          aiName,
          regionName,
          payload: {
            prompt: this.renderHeartbeatPrompt(aiName, regionName),
          },
          createdAt: Date.now(),
        });

        this.heartbeatMap.set(key, Date.now());
      }
    }
  }

  private async executeTask(task: Task): Promise<TaskResult> {
    const startAt = Date.now();
    const lockAcquired = this.lockManager.acquireLock(task.regionName, task.aiName);

    if (!lockAcquired) {
      return {
        taskId: task.id,
        success: false,
        error: `Region ${task.regionName} is locked`,
        executedAt: Date.now(),
        duration: Date.now() - startAt,
      };
    }

    try {
      const output = await this.executeTaskByType(task);

      await this.memory.logAIAction({
        aiName: task.aiName,
        regionId: task.regionName,
        action: `scheduler:${task.type}`,
        result: output.slice(0, 1000),
      });

      return {
        taskId: task.id,
        success: true,
        output,
        executedAt: Date.now(),
        duration: Date.now() - startAt,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown scheduler task error';
      logger.error({ task, error }, 'Failed to execute scheduler task');

      await this.memory.logSystemEvent({
        type: 'scheduler_task_failed',
        aiName: task.aiName,
        regionId: task.regionName,
        timestamp: Date.now(),
        details: {
          taskId: task.id,
          message,
        },
      });

      return {
        taskId: task.id,
        success: false,
        error: message,
        executedAt: Date.now(),
        duration: Date.now() - startAt,
      };
    } finally {
      this.lockManager.releaseLock(task.regionName);
    }
  }

  private async executeTaskByType(task: Task): Promise<string> {
    if (task.type === 'oracle') {
      const message = this.readString(task.payload.message);
      if (!message) {
        throw new Error('Oracle task requires payload.message');
      }

      return this.aiManager.speakToAI({
        aiName: task.aiName,
        regionName: task.regionName,
        message,
        fromType: 'system',
        fromId: 'world-scheduler',
        metadata: {
          taskType: task.type,
          taskId: task.id,
        },
      });
    }

    if (task.type === 'heartbeat') {
      const prompt =
        this.readString(task.payload.prompt) ||
        this.renderHeartbeatPrompt(task.aiName, task.regionName);

      return this.aiManager.speakToAI({
        aiName: task.aiName,
        regionName: task.regionName,
        message: prompt,
        fromType: 'system',
        fromId: 'world-scheduler-heartbeat',
        metadata: {
          taskType: task.type,
          taskId: task.id,
        },
      });
    }

    if (task.type === 'message') {
      const message = this.readString(task.payload.message);
      if (!message) {
        throw new Error('Message task requires payload.message');
      }

      const fromType = this.readSourceType(task.payload.fromType);
      const fromId = this.readString(task.payload.fromId) || 'scheduler-message';

      return this.aiManager.speakToAI({
        aiName: task.aiName,
        regionName: task.regionName,
        message,
        fromType,
        fromId,
        metadata: {
          taskType: task.type,
          taskId: task.id,
        },
      });
    }

    throw new Error(`Unsupported task type: ${task.type}`);
  }

  private renderHeartbeatPrompt(aiName: string, regionName: string): string {
    return this.config.heartbeatPrompt
      .replaceAll('{aiName}', aiName)
      .replaceAll('{regionName}', regionName)
      .replaceAll('{timestamp}', new Date().toISOString());
  }

  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private buildStrategy(config: SchedulerConfig): ScheduleStrategy {
    if (config.strategyName === 'batch') {
      return new BatchStrategy(config.heartbeatPrompt);
    }

    if (config.strategyName === 'learning') {
      return new LearningStrategy(config.heartbeatPrompt);
    }

    return new RealtimeStrategy(config.heartbeatPrompt);
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private readSourceType(value: unknown): 'human' | 'ai' | 'system' {
    if (value === 'human' || value === 'ai' || value === 'system') {
      return value;
    }

    return 'system';
  }
}
