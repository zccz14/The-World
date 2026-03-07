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

  static get AI_PROXY_PORT(): number {
    this.load();
    return parseInt(process.env.AI_PROXY_PORT || '3456', 10);
  }

  static get LLM_API_KEY(): string {
    this.load();
    return process.env.LLM_API_KEY || '';
  }

  static get VECTORIZE_API_KEY(): string {
    this.load();
    return process.env.VECTORIZE_API_KEY || '';
  }

  static get SERVER_PORT(): number {
    this.load();
    return parseInt(process.env.SERVER_PORT || '1996', 10);
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
