import { logger } from '../utils/logger';
import { AIProxyHandler } from '../proxy/AIProxyHandler';
import { WorldMemory } from '../memory/MemoryManager';
import { RegionDaemonClient } from '../region-daemon/RegionDaemonClient';
import { AIInvocationRegistry } from './AIInvocationRegistry';

type MessageSourceType = 'human' | 'ai' | 'system';

interface SpeakToAIParams {
  aiName: string;
  regionName: string;
  message: string;
  fromType: MessageSourceType;
  fromId: string;
  timeout?: number;
  metadata?: Record<string, unknown>;
}

interface RecallMemoryParams {
  aiName: string;
  query: string;
  fromType?: MessageSourceType;
  fromId?: string;
  topK?: number;
  budgetChars?: number;
}

interface RememberMemoryParams {
  aiName: string;
  content: string;
  kind: 'fact' | 'key_dialogue' | 'decision' | 'constraint' | 'todo' | 'lesson' | 'episode';
  importance: number;
  source: string;
  metadata?: Record<string, unknown>;
}

export class AIUserManager {
  private memory: WorldMemory;
  private proxy: AIProxyHandler;
  private invocationRegistry: AIInvocationRegistry;

  constructor(
    memory: WorldMemory,
    proxy: AIProxyHandler,
    invocationRegistry: AIInvocationRegistry
  ) {
    this.memory = memory;
    this.proxy = proxy;
    this.invocationRegistry = invocationRegistry;
  }

  async createAI(aiName: string): Promise<string> {
    logger.info(`Creating AI: ${aiName}`);
    const dummyKey = this.proxy.registerAI(aiName);
    logger.info(`AI created: ${aiName} with dummy key: ${dummyKey}`);
    return dummyKey;
  }

  listAllAI(): string[] {
    return this.proxy.listAI();
  }

  async recallMemoryForAI(params: RecallMemoryParams): Promise<{
    briefMarkdown: string;
    items: Array<{
      text: string;
      source: 'recent' | 'evermemos';
      kind?: string;
      importance: number;
      timestamp: number;
    }>;
    stats: {
      recentCount: number;
      everCount: number;
      mergedCount: number;
      returnedCount: number;
    };
  }> {
    logger.info(
      {
        aiName: params.aiName,
        fromType: params.fromType || 'system',
        fromId: params.fromId || 'memory-recall-api',
      },
      'Recalling memory for AI'
    );

    return this.memory.recall({
      aiName: params.aiName,
      query: params.query,
      topK: params.topK,
      budgetChars: params.budgetChars,
    });
  }

  async rememberMemoryForAI(params: RememberMemoryParams) {
    logger.info(
      {
        aiName: params.aiName,
        kind: params.kind,
        importance: params.importance,
        source: params.source,
      },
      'Remembering memory for AI'
    );

    return this.memory.remember(params);
  }

  getMemoryHealth() {
    return this.memory.getMemoryHealth();
  }

  async speakToAI(params: SpeakToAIParams): Promise<string> {
    logger.info(
      {
        aiName: params.aiName,
        regionName: params.regionName,
        fromType: params.fromType,
        fromId: params.fromId,
      },
      'Speaking to AI'
    );

    await this.memory.logIncomingMessage({
      aiName: params.aiName,
      regionId: params.regionName,
      fromType: params.fromType,
      fromId: params.fromId,
      content: params.message,
      metadata: params.metadata,
    });

    const memoryMarkdown = await this.memory.buildWakeupMemory({
      aiName: params.aiName,
      regionId: params.regionName,
      message: params.message,
      fromType: params.fromType,
      fromId: params.fromId,
      metadata: params.metadata,
    });

    const daemonClient = new RegionDaemonClient(params.regionName);
    await this.writeMemoryFile(daemonClient, memoryMarkdown, params.timeout);

    const prompt = this.buildSpeakPrompt(params);
    const command = `opencode run "${this.escapeDoubleQuotes(prompt)}" --agent region-worker --file /home/agent/MEMORY.md --format json --attach http://localhost:4096`;
    const runId = this.invocationRegistry.beginInvocation(params.aiName, params.regionName);
    const result = await daemonClient.execute('agent', command, params.timeout);

    try {
      if (!result.success) {
        throw new Error(result.error || 'AI speak execution failed');
      }

      const sessionId = this.extractSessionIdFromOpencodeOutput(result.stdout, result.stderr);
      if (sessionId) {
        this.invocationRegistry.bindSession(sessionId, runId);
      }

      const responseText = this.extractTextFromOpencodeOutput(result.stdout, result.stderr);

      // Only log meaningful text responses, not raw JSON event streams
      if (responseText && responseText.trim()) {
        await this.memory.logOutgoingMessage({
          aiName: params.aiName,
          regionId: params.regionName,
          content: responseText,
          metadata: {
            fromType: params.fromType,
            fromId: params.fromId,
            sessionId,
            ...params.metadata,
          },
        });
        return responseText;
      }

      // If no text extracted, log a placeholder instead of raw JSON
      const placeholder = '[AI processing - no text output generated]';
      await this.memory.logOutgoingMessage({
        aiName: params.aiName,
        regionId: params.regionName,
        content: placeholder,
        metadata: {
          fromType: params.fromType,
          fromId: params.fromId,
          noTextOutput: true,
          sessionId,
          ...params.metadata,
        },
      });

      return placeholder;
    } finally {
      this.invocationRegistry.endInvocation(runId);
    }
  }

  private buildSpeakPrompt(params: SpeakToAIParams): string {
    return [
      '请先阅读 /home/agent/MEMORY.md 中的记忆上下文，然后再回答。',
      '你可以使用 MCP 记忆工具：memory.recall 和 memory.remember。',
      '使用建议：',
      '- 当问题依赖历史偏好、长期约束、过去决策或上下文延续时，先调用 memory.recall。',
      '- 当你识别到高价值且可复用的信息（用户偏好、明确事实、约束、决策、TODO）时，调用 memory.remember。',
      '- 不要记忆敏感信息（密钥、口令、凭证、隐私数据）或一次性噪声内容。',
      '- remember 的临时/持久化细节由系统内部处理，你只需关注语义是否值得记住。',
      `消息来源: ${params.fromType}:${params.fromId}`,
      '收到的新消息如下：',
      params.message,
    ].join('\n\n');
  }

  private extractTextFromOpencodeOutput(stdout: string, stderr: string): string {
    const fullOutput = `${stdout}\n${stderr}`;
    const lines = fullOutput.split('\n').filter(line => line.trim());

    let responseText = '';
    for (const line of lines) {
      try {
        const payload = JSON.parse(line) as { type?: string; part?: { text?: string } };
        if (payload.type === 'text' && payload.part?.text) {
          responseText += payload.part.text;
        }
      } catch {
        // Ignore non-JSON lines
      }
    }

    return responseText;
  }

  private async writeMemoryFile(
    daemonClient: RegionDaemonClient,
    markdown: string,
    timeout?: number
  ): Promise<void> {
    const encoded = Buffer.from(markdown, 'utf-8').toString('base64');
    const command = `printf '%s' '${encoded}' | base64 -d > /home/agent/MEMORY.md`;
    const writeResult = await daemonClient.execute('agent', command, timeout);

    if (!writeResult.success) {
      throw new Error(writeResult.error || 'Failed to write MEMORY.md');
    }
  }

  private escapeDoubleQuotes(value: string): string {
    return value.replace(/"/g, '\\"');
  }

  private extractSessionIdFromOpencodeOutput(stdout: string, stderr: string): string | undefined {
    const lines = `${stdout}\n${stderr}`.split('\n').filter(line => line.trim());
    for (const line of lines) {
      try {
        const payload = JSON.parse(line) as unknown;
        const found = this.findFirstStringByKey(payload, ['session_id', 'sessionId', 'sessionID']);
        if (found) {
          return found;
        }
      } catch {
        // Ignore non-JSON lines
      }
    }
    return undefined;
  }

  private findFirstStringByKey(input: unknown, keys: string[]): string | undefined {
    if (input === null || input === undefined) {
      return undefined;
    }

    if (Array.isArray(input)) {
      for (const item of input) {
        const found = this.findFirstStringByKey(item, keys);
        if (found) {
          return found;
        }
      }
      return undefined;
    }

    if (typeof input !== 'object') {
      return undefined;
    }

    const record = input as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    for (const value of Object.values(record)) {
      const found = this.findFirstStringByKey(value, keys);
      if (found) {
        return found;
      }
    }

    return undefined;
  }
}
