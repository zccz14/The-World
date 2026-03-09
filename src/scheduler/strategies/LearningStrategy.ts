import { ScheduleStrategyConfig, Task, TaskPriority } from '../types';
import { ScheduleStrategy } from './ScheduleStrategy';

export class LearningStrategy implements ScheduleStrategy {
  constructor(private heartbeatPrompt: string) {}

  getConfig(): ScheduleStrategyConfig {
    return {
      name: 'learning',
      heartbeatInterval: 5 * 60 * 1000,
      heartbeatPrompt: this.heartbeatPrompt,
      priorityWeights: {
        [TaskPriority.CRITICAL]: 1000,
        [TaskPriority.HIGH]: 10,
        [TaskPriority.NORMAL]: 5,
        [TaskPriority.LOW]: 100,
      },
      longRunningTaskTimeout: 60 * 60 * 1000,
    };
  }

  shouldRunHeartbeat(lastHeartbeatAt?: number): boolean {
    if (!lastHeartbeatAt) {
      return true;
    }

    return Date.now() - lastHeartbeatAt >= this.getConfig().heartbeatInterval;
  }

  calculatePriority(task: Task): number {
    return this.getConfig().priorityWeights[task.priority];
  }

  selectNextTask(queue: Task[]): Task | null {
    if (queue.length === 0) {
      return null;
    }

    const sorted = [...queue].sort((a, b) => {
      const weightDiff = this.calculatePriority(b) - this.calculatePriority(a);
      if (weightDiff !== 0) {
        return weightDiff;
      }
      return a.createdAt - b.createdAt;
    });

    return sorted[0] || null;
  }
}
