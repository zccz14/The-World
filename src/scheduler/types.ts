export enum TaskPriority {
  CRITICAL = 0,
  HIGH = 1,
  NORMAL = 2,
  LOW = 3,
}

export type TaskType = 'heartbeat' | 'oracle' | 'command' | 'message';

export interface Task {
  id: string;
  type: TaskType;
  priority: TaskPriority;
  aiName: string;
  regionName: string;
  payload: Record<string, unknown>;
  createdAt: number;
  timeout?: number;
  retries?: number;
}

export type NewTaskInput = Omit<Task, 'id' | 'createdAt'>;

export interface TaskResult {
  taskId: string;
  success: boolean;
  output?: string;
  error?: string;
  executedAt: number;
  duration: number;
}

export interface ScheduleStrategyConfig {
  name: 'realtime' | 'batch' | 'learning';
  heartbeatInterval: number;
  heartbeatPrompt: string;
  priorityWeights: Record<TaskPriority, number>;
  maxConcurrentTasks?: number;
  batchSize?: number;
  batchInterval?: number;
  longRunningTaskTimeout?: number;
}

export interface SchedulerConfig {
  enabled: boolean;
  strategyName: 'realtime' | 'batch' | 'learning';
  tickInterval: number;
  persistencePath: string;
  heartbeatPrompt: string;
}

export interface SchedulerStatus {
  enabled: boolean;
  strategy: string;
  running: boolean;
  queueSize: number;
  lastTickAt: number | null;
  lockedRegions: string[];
}

export interface PersistedQueue {
  version: string;
  savedAt: number;
  tasks: Task[];
}
