import fs from 'fs';
import path from 'path';
import { PersistedQueue, Task } from './types';

export class TaskQueue {
  private tasks: Task[] = [];

  constructor(private persistencePath: string) {}

  enqueue(task: Task): void {
    this.tasks.push(task);
  }

  dequeueById(taskId: string): Task | null {
    const index = this.tasks.findIndex(task => task.id === taskId);
    if (index < 0) {
      return null;
    }

    const [task] = this.tasks.splice(index, 1);
    return task || null;
  }

  removeById(taskId: string): boolean {
    const index = this.tasks.findIndex(task => task.id === taskId);
    if (index < 0) {
      return false;
    }

    this.tasks.splice(index, 1);
    return true;
  }

  list(): Task[] {
    return [...this.tasks];
  }

  size(): number {
    return this.tasks.length;
  }

  isEmpty(): boolean {
    return this.tasks.length === 0;
  }

  clear(): void {
    this.tasks = [];
  }

  async save(): Promise<void> {
    const payload: PersistedQueue = {
      version: '1.0',
      savedAt: Date.now(),
      tasks: this.tasks,
    };

    const parent = path.dirname(this.persistencePath);
    fs.mkdirSync(parent, { recursive: true });
    fs.writeFileSync(this.persistencePath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  async load(): Promise<void> {
    if (!fs.existsSync(this.persistencePath)) {
      this.tasks = [];
      return;
    }

    const raw = fs.readFileSync(this.persistencePath, 'utf-8');
    const parsed = JSON.parse(raw) as PersistedQueue;

    if (!Array.isArray(parsed.tasks)) {
      this.tasks = [];
      return;
    }

    this.tasks = parsed.tasks;
  }
}
