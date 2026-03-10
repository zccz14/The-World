import { EverMemOSClient } from './EverMemOSClient';
import { logger } from '../utils/logger';
import { AuditStore } from './AuditStore';

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

    return this.client.searchMemories({
      query: params.query,
      user_id: params.aiName,
      group_id: params.regionId,
      memory_types: ['episodic_memory'],
      retrieve_method: 'rrf',
      top_k: 10,
    });
  }

  async buildWakeupMemory(params: {
    aiName: string;
    regionId: string;
    message: string;
    fromType: MessageSourceType;
    fromId: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const header = [
      `# MEMORY for ${params.aiName}`,
      '',
      `GeneratedAt: ${new Date().toISOString()}`,
      `Region: ${params.regionId}`,
      `IncomingFrom: ${params.fromType}:${params.fromId}`,
      '',
      '## Incoming Message',
      this.compactText(params.message, 1200),
      '',
      '## Recalled Memories',
    ];

    try {
      const response = await this.retrieveMemories({
        aiName: params.aiName,
        regionId: params.regionId,
        query: this.compactText(params.message, 300),
      });

      const items = this.extractMemoryItems(response);
      if (items.length === 0) {
        return `${header.join('\n')}\n- No relevant recalled memory. Continue with current message only.\n`;
      }

      const memoryLines = items
        .slice(0, 8)
        .map((item, index) => `- ${index + 1}. ${this.compactText(item, 500)}`)
        .join('\n');

      return `${header.join('\n')}\n${memoryLines}\n`;
    } catch (error) {
      logger.warn(
        { error, params },
        'Failed to retrieve memories for wakeup, fallback to minimal memory'
      );
      return `${header.join('\n')}\n- Memory retrieval unavailable. Proceed with conservative assumptions.\n`;
    }
  }

  private compactText(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    return `${content.slice(0, maxLength)}... [truncated ${content.length - maxLength} chars]`;
  }

  private extractMemoryItems(payload: unknown): string[] {
    const candidates = this.findFirstArray(payload);
    if (!candidates) {
      return [];
    }

    const items: string[] = [];
    for (const entry of candidates) {
      if (typeof entry === 'string') {
        items.push(entry);
        continue;
      }

      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>;
        const content = record.content;
        if (typeof content === 'string') {
          items.push(content);
          continue;
        }

        const text = record.text;
        if (typeof text === 'string') {
          items.push(text);
          continue;
        }

        items.push(JSON.stringify(record));
      }
    }

    return items;
  }

  private findFirstArray(value: unknown): unknown[] | null {
    if (Array.isArray(value)) {
      return value;
    }

    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    for (const key of ['memories', 'results', 'items', 'data']) {
      if (Array.isArray(record[key])) {
        return record[key] as unknown[];
      }
    }

    for (const nested of Object.values(record)) {
      const found = this.findFirstArray(nested);
      if (found) {
        return found;
      }
    }

    return null;
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
