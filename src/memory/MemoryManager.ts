import { EverMemOSClient } from './EverMemOSClient';
import { logger } from '../utils/logger';
import { AuditStore } from './AuditStore';
import { Config } from '../utils/config';

type MemoryLayer = 'working' | 'knowledge' | 'episode' | 'audit';
type MessageSourceType = 'human' | 'ai' | 'system';

interface AuditEvent {
  eventType: string;
  layer: MemoryLayer;
  aiName?: string;
  regionId?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export class WorldMemory {
  private client: EverMemOSClient;
  private auditStore?: AuditStore;

  constructor(baseUrl: string, auditLogPath?: string) {
    this.client = new EverMemOSClient(baseUrl);
    this.auditStore = auditLogPath ? new AuditStore(auditLogPath) : undefined;
  }

  async logOracle(params: { aiName: string; regionId: string; content: string }) {
    return this.logIncomingMessage({
      aiName: params.aiName,
      regionId: params.regionId,
      fromType: 'human',
      fromId: 'oracle',
      content: params.content,
      metadata: { type: 'oracle' },
    });
  }

  async logOracleResponse(params: { aiName: string; regionId: string; content: string }) {
    return this.logOutgoingMessage({
      aiName: params.aiName,
      regionId: params.regionId,
      content: params.content,
      metadata: { type: 'oracle_response' },
    });
  }

  async logIncomingMessage(params: {
    aiName: string;
    regionId: string;
    fromType: MessageSourceType;
    fromId: string;
    content: string;
    metadata?: Record<string, unknown>;
  }) {
    logger.debug({ params }, 'Logging incoming message');

    const summary = this.compactText(params.content, 700);

    await this.writeAudit({
      eventType: 'message_in',
      layer: 'audit',
      aiName: params.aiName,
      regionId: params.regionId,
      content: params.content,
      metadata: {
        fromType: params.fromType,
        fromId: params.fromId,
        ...params.metadata,
      },
    });

    return this.client.storeMemory({
      message_id: `message-in-${Date.now()}`,
      create_time: new Date().toISOString(),
      sender: params.fromId,
      content: summary,
      group_id: params.regionId,
      sender_name: params.fromId,
      role: 'user',
      metadata: {
        type: 'incoming_message',
        memory_layer: 'working',
        summary_mode: 'compact',
        target_ai: params.aiName,
        source_type: params.fromType,
        ...params.metadata,
      },
    });
  }

  async logOutgoingMessage(params: {
    aiName: string;
    regionId: string;
    content: string;
    metadata?: Record<string, unknown>;
  }) {
    logger.debug({ params }, 'Logging outgoing message');

    const summary = this.compactText(params.content, 900);

    await this.writeAudit({
      eventType: 'message_out',
      layer: 'audit',
      aiName: params.aiName,
      regionId: params.regionId,
      content: params.content,
      metadata: params.metadata,
    });

    return this.client.storeMemory({
      message_id: `message-out-${Date.now()}`,
      create_time: new Date().toISOString(),
      sender: params.aiName,
      content: summary,
      group_id: params.regionId,
      sender_name: params.aiName,
      role: 'assistant',
      metadata: {
        type: 'outgoing_message',
        memory_layer: 'working',
        summary_mode: 'compact',
        ...params.metadata,
      },
    });
  }

  async logAIAction(params: { aiName: string; regionId: string; action: string; result: string }) {
    logger.debug({ params }, 'Logging AI action');

    const compactResult = this.compactText(params.result, 700);

    await this.writeAudit({
      eventType: 'ai_action',
      layer: 'audit',
      aiName: params.aiName,
      regionId: params.regionId,
      content: params.result,
      metadata: {
        action: params.action,
      },
    });

    return this.client.storeMemory({
      message_id: `action-${Date.now()}`,
      create_time: new Date().toISOString(),
      sender: params.aiName,
      content: `${params.action}: ${compactResult}`,
      group_id: params.regionId,
      sender_name: params.aiName,
      role: 'assistant',
      metadata: {
        type: 'ai_action',
        memory_layer: 'episode',
        summary_mode: 'compact',
      },
    });
  }

  async logCommandExecution(params: {
    aiName: string;
    regionId: string;
    command: string;
    output: string;
    success: boolean;
  }) {
    logger.debug({ aiName: params.aiName, regionId: params.regionId }, 'Logging command execution');

    const commandSummary = this.compactText(params.command, 200);
    const outputSummary = this.compactText(params.output, 500);

    await this.writeAudit({
      eventType: 'command_execution',
      layer: 'audit',
      aiName: params.aiName,
      regionId: params.regionId,
      content: params.output,
      metadata: {
        command: params.command,
        success: params.success,
      },
    });

    return this.client.storeMemory({
      message_id: `command-${Date.now()}`,
      create_time: new Date().toISOString(),
      sender: params.aiName,
      content: `command=${commandSummary}; success=${params.success}; output=${outputSummary}`,
      group_id: params.regionId,
      sender_name: params.aiName,
      role: 'assistant',
      metadata: {
        type: 'command_execution',
        memory_layer: 'episode',
        summary_mode: 'compact',
        success: params.success,
      },
    });
  }

  async logSystemEvent(params: {
    type: string;
    regionId?: string;
    aiName?: string;
    timestamp: number;
    details?: any;
  }) {
    logger.debug({ params }, 'Logging system event');

    return this.client.storeMemory({
      message_id: `system-${Date.now()}`,
      create_time: new Date().toISOString(),
      sender: 'system',
      content: JSON.stringify(params),
      group_id: params.regionId || 'global',
      sender_name: 'TheWorld System',
      role: 'assistant',
      metadata: {
        type: 'system_event',
        event_type: params.type,
      },
    });
  }

  async retrieveMemories(params: { aiName: string; query: string; regionId?: string }) {
    logger.debug({ params }, 'Retrieving memories');

    const topK = Config.MEMORY_RECALL_TOP_K;

    return this.client.searchMemories({
      query: params.query,
      user_id: params.aiName,
      group_id: params.regionId,
      memory_types: ['episodic_memory'],
      retrieve_method: 'rrf',
      top_k: topK,
    });
  }

  async buildWakeupMemory(params: {
    aiName: string;
    regionId?: string;
    message: string;
    fromType: MessageSourceType;
    fromId: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const header = [
      `# Memory Context for ${params.aiName}`,
      '',
      `**Time**: ${new Date().toISOString()}`,
      `**Region**: ${params.regionId || 'all (cross-region)'}`,
      `**From**: ${params.fromType}:${params.fromId}`,
      '',
      '---',
      '',
      '## Current Message',
      '',
      this.compactText(params.message, 1200),
      '',
      '---',
      '',
      '## Relevant Context (Recalled from Memory)',
      '',
    ];

    try {
      const response = await this.retrieveMemories({
        aiName: params.aiName,
        regionId: params.regionId,
        query: this.compactText(params.message, 300),
      });

      const items = this.extractMemoryItems(response);
      if (items.length === 0) {
        return `${header.join('\n')}*No relevant recalled memory. You are starting fresh with this message.*\n\n---\n\n**Instructions**: Read the current message above and respond appropriately.\n`;
      }

      // Take top 5 most relevant, compact each to max 400 chars
      const topItems = items.slice(0, 5);
      const memoryLines = topItems
        .map((item, index) => {
          const compacted = this.compactText(item, 400);
          return `### ${index + 1}. ${compacted}\n`;
        })
        .join('\n');

      return `${header.join('\n')}${memoryLines}\n---\n\n**Instructions**: Use the recalled context above to inform your response to the current message.\n`;
    } catch (error) {
      logger.warn(
        { error, params },
        'Failed to retrieve memories for wakeup, fallback to minimal memory'
      );
      return `${header.join('\n')}*Memory retrieval temporarily unavailable. Proceed with caution and conservative assumptions.*\n\n---\n\n**Instructions**: Read the current message above and respond appropriately.\n`;
    }
  }

  private compactText(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    return `${content.slice(0, maxLength)}... [truncated ${content.length - maxLength} chars]`;
  }

  private extractMemoryItems(payload: unknown): string[] {
    // EverMemOS returns: { result: { memories: [{ "<group>": [memoryRecord...] }] } }
    const memories = this.extractMemoriesArray(payload);
    if (!memories || memories.length === 0) {
      return [];
    }

    const items: string[] = [];
    const seen = new Set<string>();

    for (const groupWrapper of memories) {
      if (!groupWrapper || typeof groupWrapper !== 'object') continue;

      // Each groupWrapper is like { "test-1": [memoryRecord...] }
      for (const records of Object.values(groupWrapper)) {
        if (!Array.isArray(records)) continue;

        for (const record of records) {
          if (!record || typeof record !== 'object') continue;

          const memRecord = record as Record<string, unknown>;
          const extracted = this.extractMemoryContent(memRecord);
          if (!extracted) continue;

          // Filter noise
          if (this.isNoiseContent(extracted)) continue;

          // Deduplicate
          const normalized = this.normalizeText(extracted);
          if (seen.has(normalized)) continue;
          seen.add(normalized);

          items.push(extracted);
        }
      }
    }

    return items;
  }

  private extractMemoriesArray(payload: unknown): unknown[] | null {
    if (!payload || typeof payload !== 'object') return null;

    const obj = payload as Record<string, unknown>;

    // Try result.memories first (EverMemOS standard response)
    if (obj.result && typeof obj.result === 'object') {
      const result = obj.result as Record<string, unknown>;
      if (Array.isArray(result.memories)) {
        return result.memories;
      }
    }

    // Fallback to direct memories array
    if (Array.isArray(obj.memories)) {
      return obj.memories;
    }

    return null;
  }

  private extractMemoryContent(record: Record<string, unknown>): string | null {
    // Priority: summary > episode > subject > content
    const summary = record.summary;
    if (typeof summary === 'string' && summary.trim()) {
      return summary.trim();
    }

    const episode = record.episode;
    if (typeof episode === 'string' && episode.trim()) {
      return episode.trim();
    }

    const subject = record.subject;
    if (typeof subject === 'string' && subject.trim()) {
      return subject.trim();
    }

    const content = record.content;
    if (typeof content === 'string' && content.trim()) {
      return content.trim();
    }

    return null;
  }

  private isNoiseContent(text: string): boolean {
    // Filter out event stream fragments
    if (text.includes('"type":"step_start"')) return true;
    if (text.includes('"type":"tool_use"')) return true;
    if (text.includes('"type":"step_finish"')) return true;
    if (text.startsWith('{"type":')) return true;

    // Filter out very short or empty content
    if (text.length < 20) return true;

    // Filter out pure JSON objects
    if (text.startsWith('{') && text.endsWith('}') && text.includes('"id":')) return true;

    return false;
  }

  private normalizeText(text: string): string {
    return text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  private async writeAudit(event: AuditEvent): Promise<void> {
    if (!this.auditStore) {
      return;
    }

    await this.auditStore.append({
      timestamp: Date.now(),
      eventType: event.eventType,
      layer: event.layer,
      aiName: event.aiName,
      regionId: event.regionId,
      content: event.content,
      metadata: event.metadata,
    });
  }
}
