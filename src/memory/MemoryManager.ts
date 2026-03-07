import { EverMemOSClient } from './EverMemOSClient';
import { logger } from '../utils/logger';

export class WorldMemory {
  private client: EverMemOSClient;

  constructor(baseUrl: string) {
    this.client = new EverMemOSClient(baseUrl);
  }

  async logOracle(params: { aiName: string; regionId: string; content: string }) {
    logger.debug({ params }, 'Logging oracle message');

    return this.client.storeMemory({
      message_id: `oracle-${Date.now()}`,
      create_time: new Date().toISOString(),
      sender: 'human',
      content: params.content,
      group_id: params.regionId,
      sender_name: 'Human (Oracle)',
      role: 'user',
      metadata: {
        type: 'oracle',
        target_ai: params.aiName,
      },
    });
  }

  async logAIAction(params: { aiName: string; regionId: string; action: string; result: string }) {
    logger.debug({ params }, 'Logging AI action');

    return this.client.storeMemory({
      message_id: `action-${Date.now()}`,
      create_time: new Date().toISOString(),
      sender: params.aiName,
      content: `${params.action}: ${params.result}`,
      group_id: params.regionId,
      sender_name: params.aiName,
      role: 'assistant',
      metadata: {
        type: 'ai_action',
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
}
