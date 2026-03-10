import { logger } from '../utils/logger';
import { AIProxyHandler } from '../proxy/AIProxyHandler';
import { WorldMemory } from '../memory/MemoryManager';
import { RegionDaemonClient } from '../region-daemon/RegionDaemonClient';

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

export class AIUserManager {
  private memory: WorldMemory;
  private proxy: AIProxyHandler;

  constructor(memory: WorldMemory, proxy: AIProxyHandler) {
    this.memory = memory;
    this.proxy = proxy;
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
    const command = `opencode run "${this.escapeDoubleQuotes(prompt)}" --file /home/agent/MEMORY.md --format json --attach http://localhost:4096`;
    const result = await daemonClient.execute('agent', command, params.timeout);

    if (!result.success) {
      throw new Error(result.error || 'AI speak execution failed');
    }

    const responseText = this.extractTextFromOpencodeOutput(result.stdout, result.stderr);
    const output = responseText || result.stdout || result.stderr;

    await this.memory.logOutgoingMessage({
      aiName: params.aiName,
      regionId: params.regionName,
      content: output,
      metadata: {
        fromType: params.fromType,
        fromId: params.fromId,
        ...params.metadata,
      },
    });

    return output;
  }

  private buildSpeakPrompt(params: SpeakToAIParams): string {
    return [
      '请先阅读 /home/agent/MEMORY.md 中的记忆上下文，然后再回答。',
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
}
