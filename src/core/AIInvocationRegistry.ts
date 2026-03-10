interface InvocationRecord {
  runId: string;
  aiName: string;
  regionName: string;
  startedAt: number;
}

interface SessionBinding {
  sessionId: string;
  aiName: string;
  regionName: string;
  runId?: string;
  updatedAt: number;
}

interface ResolveInput {
  requestedAiName?: string;
  sessionId?: string;
  runId?: string;
}

export interface ResolveResult {
  aiName?: string;
  source: 'session' | 'run' | 'active' | 'arg' | 'none';
  sessionId?: string;
  runId?: string;
}

const INVOCATION_TTL_MS = 30 * 60 * 1000;
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const RESERVED_AI_NAMES = new Set([
  '',
  'unknown',
  'opencode',
  'opencode-agent',
  'assistant',
  'agent',
  'system',
  'null',
  'undefined',
]);

export class AIInvocationRegistry {
  private invocationByRunId: Map<string, InvocationRecord> = new Map();
  private activeInvocations: InvocationRecord[] = [];
  private sessionBindings: Map<string, SessionBinding> = new Map();

  beginInvocation(aiName: string, regionName: string): string {
    this.prune();
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const record: InvocationRecord = {
      runId,
      aiName,
      regionName,
      startedAt: Date.now(),
    };

    this.invocationByRunId.set(runId, record);
    this.activeInvocations.push(record);
    return runId;
  }

  endInvocation(runId: string): void {
    this.invocationByRunId.delete(runId);
    this.activeInvocations = this.activeInvocations.filter(record => record.runId !== runId);
  }

  bindSession(sessionId: string, runId: string): void {
    this.prune();
    const invocation = this.invocationByRunId.get(runId);
    if (!invocation) {
      return;
    }

    this.sessionBindings.set(sessionId, {
      sessionId,
      aiName: invocation.aiName,
      regionName: invocation.regionName,
      runId,
      updatedAt: Date.now(),
    });
  }

  resolve(input: ResolveInput): ResolveResult {
    this.prune();

    if (input.sessionId) {
      const bound = this.sessionBindings.get(input.sessionId);
      if (bound) {
        bound.updatedAt = Date.now();
        return {
          aiName: bound.aiName,
          source: 'session',
          sessionId: bound.sessionId,
          runId: bound.runId,
        };
      }
    }

    if (input.runId) {
      const invocation = this.invocationByRunId.get(input.runId);
      if (invocation) {
        return {
          aiName: invocation.aiName,
          source: 'run',
          runId: invocation.runId,
        };
      }
    }

    if (this.activeInvocations.length > 0) {
      const latest = this.activeInvocations[this.activeInvocations.length - 1];
      return {
        aiName: latest.aiName,
        source: 'active',
        runId: latest.runId,
      };
    }

    const normalized = this.normalizeAiName(input.requestedAiName);
    if (normalized) {
      return {
        aiName: normalized,
        source: 'arg',
      };
    }

    return { source: 'none' };
  }

  private normalizeAiName(aiName?: string): string | undefined {
    if (!aiName) {
      return undefined;
    }

    const normalized = aiName.trim();
    if (!normalized) {
      return undefined;
    }

    if (RESERVED_AI_NAMES.has(normalized.toLowerCase())) {
      return undefined;
    }

    return normalized;
  }

  private prune(): void {
    const now = Date.now();

    for (const [runId, record] of this.invocationByRunId.entries()) {
      if (now - record.startedAt > INVOCATION_TTL_MS) {
        this.invocationByRunId.delete(runId);
      }
    }

    this.activeInvocations = this.activeInvocations.filter(
      record => now - record.startedAt <= INVOCATION_TTL_MS
    );

    for (const [sessionId, binding] of this.sessionBindings.entries()) {
      if (now - binding.updatedAt > SESSION_TTL_MS) {
        this.sessionBindings.delete(sessionId);
      }
    }
  }
}
