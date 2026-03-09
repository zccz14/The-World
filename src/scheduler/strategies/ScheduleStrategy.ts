import { ScheduleStrategyConfig, Task } from '../types';

export interface ScheduleStrategy {
  getConfig(): ScheduleStrategyConfig;
  shouldRunHeartbeat(lastHeartbeatAt?: number): boolean;
  calculatePriority(task: Task): number;
  selectNextTask(queue: Task[]): Task | null;
}
