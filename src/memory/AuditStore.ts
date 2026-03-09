import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

export interface AuditRecord {
  timestamp: number;
  eventType: string;
  layer: 'audit' | 'working' | 'knowledge' | 'episode';
  aiName?: string;
  regionId?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export class AuditStore {
  constructor(private filePath: string) {}

  async append(record: AuditRecord): Promise<void> {
    try {
      await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
      const line = `${JSON.stringify(record)}\n`;
      await fs.promises.appendFile(this.filePath, line, 'utf-8');
    } catch (error: unknown) {
      logger.error({ error, filePath: this.filePath }, 'Failed to append audit record');
    }
  }
}
