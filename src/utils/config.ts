import dotenv from 'dotenv';
import path from 'path';

export class Config {
  private static loaded = false;

  static load() {
    if (this.loaded) return;

    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
    this.loaded = true;
  }

  static get EVERMEMOS_URL(): string {
    this.load();
    return process.env.EVERMEMOS_URL || 'http://localhost:1995';
  }

  static get REAL_AI_API_KEY(): string {
    this.load();
    return process.env.REAL_AI_API_KEY || '';
  }

  static get AI_TARGET_BASE_URL(): string {
    this.load();
    return process.env.AI_TARGET_BASE_URL || 'https://api.openai.com';
  }

  static get REAL_AI_MODEL(): string {
    this.load();
    return process.env.REAL_AI_MODEL || 'claude-opus-4-6-thinking';
  }

  static get SERVER_PORT(): number {
    this.load();
    return parseInt(process.env.SERVER_PORT || '3344', 10);
  }

  static get LLM_API_KEY(): string {
    this.load();
    return process.env.LLM_API_KEY || '';
  }

  static get VECTORIZE_API_KEY(): string {
    this.load();
    return process.env.VECTORIZE_API_KEY || '';
  }

  static get DATA_DIR(): string {
    this.load();
    return path.join(process.env.WORLD_DATA_DIR || process.env.HOME || '/tmp', '.the-world');
  }

  static get SCHEDULER_ENABLED(): boolean {
    this.load();
    return (process.env.SCHEDULER_ENABLED || 'true') === 'true';
  }

  static get SCHEDULER_STRATEGY(): 'realtime' | 'batch' | 'learning' {
    this.load();
    const strategy = process.env.SCHEDULER_STRATEGY || 'realtime';
    if (strategy === 'batch' || strategy === 'learning' || strategy === 'realtime') {
      return strategy;
    }
    return 'realtime';
  }

  static get SCHEDULER_TICK_INTERVAL(): number {
    this.load();
    return parseInt(process.env.SCHEDULER_TICK_INTERVAL || '5000', 10);
  }

  static get SCHEDULER_HEARTBEAT_PROMPT(): string {
    this.load();
    return (
      process.env.SCHEDULER_HEARTBEAT_PROMPT ||
      'You are {aiName} in region {regionName}. Perform your heartbeat check, review recent context, and plan your next valuable actions at {timestamp}.'
    );
  }

  static get SCHEDULER_PERSISTENCE_PATH(): string {
    this.load();
    return (
      process.env.SCHEDULER_PERSISTENCE_PATH || path.join(this.DATA_DIR, 'scheduler-queue.json')
    );
  }

  static get MEMORY_RECALL_ENABLED(): boolean {
    this.load();
    return (process.env.MEMORY_RECALL_ENABLED || 'true') === 'true';
  }

  static get MEMORY_RECALL_TOP_K(): number {
    this.load();
    return parseInt(process.env.MEMORY_RECALL_TOP_K || '10', 10);
  }

  static get MEMORY_RECALL_MAX_CHARS(): number {
    this.load();
    return parseInt(process.env.MEMORY_RECALL_MAX_CHARS || '500', 10);
  }

  static get MEMORY_MCP_TOKEN(): string {
    this.load();
    return process.env.MEMORY_MCP_TOKEN || '';
  }

  static validate(): { valid: boolean; missing: string[] } {
    this.load();
    const missing: string[] = [];

    if (!this.REAL_AI_API_KEY) {
      missing.push('REAL_AI_API_KEY');
    }

    if (!this.LLM_API_KEY) {
      missing.push('LLM_API_KEY');
    }

    if (!this.VECTORIZE_API_KEY) {
      missing.push('VECTORIZE_API_KEY');
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }
}
