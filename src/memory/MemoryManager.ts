import { EverMemOSClient } from './EverMemOSClient';
import { logger } from '../utils/logger';
import { AuditStore } from './AuditStore';

type MemoryLayer = 'working' | 'knowledge' | 'episode' | 'audit';

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
    logger.debug({ params }, 'Logging oracle message');

    const summary = this.compactText(params.content, 500);

    await this.writeAudit({
      eventType: 'oracle_in',
      layer: 'audit',
      aiName: params.aiName,
      regionId: params.regionId,
      content: params.content,
      metadata: {
        direction: 'human_to_ai',
      },
    });

    return this.client.storeMemory({
      message_id: `oracle-${Date.now()}`,
      create_time: new Date().toISOString(),
      sender: 'human',
      content: summary,
      group_id: params.regionId,
      sender_name: 'Human (Oracle)',
      role: 'user',
      metadata: {
        type: 'oracle',
        memory_layer: 'working',
        summary_mode: 'compact',
        target_ai: params.aiName,
      },
    });
  }

  async logOracleResponse(params: { aiName: string; regionId: string; content: string }) {
    logger.debug({ params }, 'Logging oracle response');

    const summary = this.compactText(params.content, 700);

    await this.writeAudit({
      eventType: 'oracle_out',
      layer: 'audit',
      aiName: params.aiName,
      regionId: params.regionId,
      content: params.content,
      metadata: {
        direction: 'ai_to_human',
      },
    });

    return this.client.storeMemory({
      message_id: `oracle-response-${Date.now()}`,
      create_time: new Date().toISOString(),
      sender: params.aiName,
      content: summary,
      group_id: params.regionId,
      sender_name: params.aiName,
      role: 'assistant',
      metadata: {
        type: 'oracle_response',
        memory_layer: 'working',
        summary_mode: 'compact',
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

  private compactText(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    return `${content.slice(0, maxLength)}... [truncated ${content.length - maxLength} chars]`;
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
