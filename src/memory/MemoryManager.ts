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

type RememberKind =
  | 'fact'
  | 'key_dialogue'
  | 'decision'
  | 'constraint'
  | 'todo'
  | 'lesson'
  | 'episode';

type RecentStatus = 'pending_sync' | 'sync_submitted' | 'verified_recallable' | 'failed';

interface RecentMemoryEntry {
  recentId: string;
  aiName: string;
  content: string;
  kind: RememberKind;
  importance: number;
  source: string;
  createdAt: number;
  status: RecentStatus;
  requestId?: string;
  verifyAttempts: number;
}

interface RememberRequest {
  aiName: string;
  content: string;
  kind: RememberKind;
  importance: number;
  source: string;
  metadata?: Record<string, unknown>;
}

interface RememberQueueTask {
  recentId: string;
  payload: RememberRequest;
  attempts: number;
}

interface RecallRequest {
  aiName: string;
  query: string;
  topK?: number;
  budgetChars?: number;
}

interface RecallItem {
  text: string;
  source: 'recent' | 'evermemos';
  kind?: string;
  importance: number;
  timestamp: number;
  score: number;
}

export class WorldMemory {
  private client: EverMemOSClient;
  private auditStore?: AuditStore;
  private recentStore: Map<string, RecentMemoryEntry[]> = new Map();
  private requestToRecent: Map<string, { aiName: string; recentId: string }> = new Map();
  private rememberQueue: RememberQueueTask[] = [];
  private processingQueue = false;
  private verifierTimer?: NodeJS.Timeout;
  private readonly recentTTLms = 30 * 60 * 1000;
  private statsLookups = 0;
  private statsFound = 0;
  private fallbackVerifies = 0;

  constructor(baseUrl: string, auditLogPath?: string) {
    this.client = new EverMemOSClient(baseUrl);
    this.auditStore = auditLogPath ? new AuditStore(auditLogPath) : undefined;
    this.verifierTimer = setInterval(() => {
      void this.runVerificationCycle();
    }, 5000);
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

  async remember(params: RememberRequest): Promise<{
    accepted: boolean;
    queued: boolean;
    recentStored: boolean;
    recentId?: string;
    reason?: string;
  }> {
    if (!this.shouldRemember(params)) {
      return {
        accepted: false,
        queued: false,
        recentStored: false,
        reason: 'Filtered by remember gate',
      };
    }

    const recentId = `rmem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry: RecentMemoryEntry = {
      recentId,
      aiName: params.aiName,
      content: this.compactText(params.content, 1200),
      kind: params.kind,
      importance: Math.max(1, Math.min(5, params.importance)),
      source: params.source,
      createdAt: Date.now(),
      status: 'pending_sync',
      verifyAttempts: 0,
    };

    this.addRecentEntry(entry);
    this.rememberQueue.push({
      recentId,
      payload: params,
      attempts: 0,
    });
    void this.processRememberQueue();

    return {
      accepted: true,
      queued: true,
      recentStored: true,
      recentId,
    };
  }

  async recall(params: RecallRequest): Promise<{
    briefMarkdown: string;
    items: Array<Omit<RecallItem, 'score'>>;
    stats: {
      recentCount: number;
      everCount: number;
      mergedCount: number;
      returnedCount: number;
    };
  }> {
    const recallTopK = params.topK || Config.MEMORY_RECALL_TOP_K;
    const budgetChars = params.budgetChars || 2200;

    const recentCandidates = this.getRecentCandidates(params.aiName);
    const everResponse = await this.retrieveMemories({
      aiName: params.aiName,
      query: this.compactText(params.query, 300),
      regionId: undefined,
    });
    const everCandidates = this.extractRecallItemsFromEver(everResponse);

    const merged = this.mergeAndRankRecallItems(
      params.query,
      [...recentCandidates, ...everCandidates],
      recallTopK
    );

    const selected: RecallItem[] = [];
    let usedChars = 0;
    for (const item of merged) {
      const next = item.text;
      if (usedChars + next.length > budgetChars && selected.length > 0) {
        break;
      }

      selected.push({ ...item, text: next });
      usedChars += next.length;
      if (selected.length >= recallTopK) {
        break;
      }
    }

    const briefMarkdown = this.composeRecallBrief(params.aiName, params.query, selected);

    return {
      briefMarkdown,
      items: selected.map(item => ({
        text: item.text,
        source: item.source,
        kind: item.kind,
        importance: item.importance,
        timestamp: item.timestamp,
      })),
      stats: {
        recentCount: recentCandidates.length,
        everCount: everCandidates.length,
        mergedCount: merged.length,
        returnedCount: selected.length,
      },
    };
  }

  getMemoryHealth() {
    return {
      queueDepth: this.rememberQueue.length,
      recentCount: [...this.recentStore.values()].reduce((acc, items) => acc + items.length, 0),
      pendingVerificationCount: this.requestToRecent.size,
      statsLookupCount: this.statsLookups,
      statsFoundCount: this.statsFound,
      statsFoundRate: this.statsLookups > 0 ? this.statsFound / this.statsLookups : 0,
      fallbackVerifyCount: this.fallbackVerifies,
    };
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
    try {
      const recall = await this.recall({
        aiName: params.aiName,
        query: this.compactText(params.message, 300),
      });
      return recall.briefMarkdown;
    } catch (error) {
      logger.warn(
        { error, params },
        'Failed to retrieve memories for wakeup, fallback to minimal memory'
      );
      return [
        `# Memory Recall for ${params.aiName}`,
        '',
        `**Time**: ${new Date().toISOString()}`,
        `**Region**: all (cross-region)`,
        '',
        '---',
        '',
        '## Query',
        '',
        this.compactText(params.message, 1200),
        '',
        '---',
        '',
        '*Memory retrieval temporarily unavailable. Proceed with caution and conservative assumptions.*',
        '',
      ].join('\n');
    }
  }

  private shouldRemember(params: RememberRequest): boolean {
    if (!params.aiName || !params.content || !params.kind || !params.source) {
      return false;
    }

    const compacted = this.compactText(params.content, 1500);
    if (compacted.trim().length < 20) {
      return false;
    }

    if (this.isNoiseContent(compacted)) {
      return false;
    }

    return true;
  }

  private addRecentEntry(entry: RecentMemoryEntry): void {
    const list = this.recentStore.get(entry.aiName) || [];
    list.unshift(entry);

    if (list.length > 200) {
      list.length = 200;
    }

    this.recentStore.set(entry.aiName, list);
  }

  private async processRememberQueue(): Promise<void> {
    if (this.processingQueue) {
      return;
    }

    this.processingQueue = true;
    try {
      while (this.rememberQueue.length > 0) {
        const task = this.rememberQueue.shift();
        if (!task) {
          continue;
        }

        try {
          const result = await this.client.storeMemory({
            message_id: `remember-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            create_time: new Date().toISOString(),
            sender: task.payload.aiName,
            content: this.compactText(task.payload.content, 1200),
            sender_name: task.payload.aiName,
            role: 'assistant',
            metadata: {
              type: 'remember',
              remember_kind: task.payload.kind,
              importance: task.payload.importance,
              target_ai: task.payload.aiName,
              ...task.payload.metadata,
            },
          });

          const requestId =
            (result && typeof result === 'object' && 'request_id' in result
              ? (result.request_id as string)
              : undefined) || undefined;

          if (requestId) {
            this.requestToRecent.set(requestId, {
              aiName: task.payload.aiName,
              recentId: task.recentId,
            });
          }

          this.updateRecentStatus(task.payload.aiName, task.recentId, 'sync_submitted', requestId);
        } catch (error) {
          logger.warn({ error, task }, 'Remember queue write failed');

          if (task.attempts < 3) {
            this.rememberQueue.push({
              ...task,
              attempts: task.attempts + 1,
            });
          } else {
            this.updateRecentStatus(task.payload.aiName, task.recentId, 'failed');
          }
        }
      }
    } finally {
      this.processingQueue = false;
    }
  }

  private getRecentCandidates(aiName: string): RecallItem[] {
    const now = Date.now();
    const list = this.recentStore.get(aiName) || [];

    return list
      .filter(entry => now - entry.createdAt <= this.recentTTLms)
      .map(entry => ({
        text: entry.content,
        source: 'recent' as const,
        kind: entry.kind,
        importance: entry.importance,
        timestamp: entry.createdAt,
        score: 0,
      }));
  }

  private extractRecallItemsFromEver(payload: unknown): RecallItem[] {
    const memories = this.extractMemoriesArray(payload);
    if (!memories) {
      return [];
    }

    const items: RecallItem[] = [];
    for (const groupWrapper of memories) {
      if (!groupWrapper || typeof groupWrapper !== 'object') continue;

      for (const records of Object.values(groupWrapper)) {
        if (!Array.isArray(records)) continue;

        for (const rawRecord of records) {
          if (!rawRecord || typeof rawRecord !== 'object') continue;

          const record = rawRecord as Record<string, unknown>;
          const text = this.extractMemoryContent(record);
          if (!text || this.isNoiseContent(text)) continue;

          const timestampStr = record.timestamp;
          const timestamp =
            typeof timestampStr === 'string'
              ? new Date(timestampStr).getTime() || Date.now()
              : Date.now();

          const metadata = record.metadata as Record<string, unknown> | undefined;
          const importanceRaw = metadata?.importance;
          const importance =
            typeof importanceRaw === 'number' ? Math.max(1, Math.min(5, importanceRaw)) : 3;

          items.push({
            text,
            source: 'evermemos',
            kind:
              typeof metadata?.remember_kind === 'string'
                ? metadata.remember_kind
                : typeof record.type === 'string'
                  ? record.type
                  : undefined,
            importance,
            timestamp,
            score: 0,
          });
        }
      }
    }

    return items;
  }

  private mergeAndRankRecallItems(
    query: string,
    items: RecallItem[],
    maxItems: number
  ): RecallItem[] {
    const dedup = new Map<string, RecallItem>();

    for (const item of items) {
      const key = this.normalizeText(item.text);
      if (!key) continue;

      const existing = dedup.get(key);
      if (!existing || item.timestamp > existing.timestamp) {
        dedup.set(key, item);
      }
    }

    const ranked = [...dedup.values()].map(item => {
      const relevance = this.calculateRelevance(query, item.text);
      const freshness = this.calculateFreshness(item.timestamp);
      const sourceTrust = item.source === 'evermemos' ? 0.8 : 0.6;

      const score = relevance * 1000 + freshness * 100 + item.importance * 10 + sourceTrust;
      return {
        ...item,
        score,
      };
    });

    ranked.sort((a, b) => b.score - a.score);
    return ranked.slice(0, Math.max(1, maxItems * 3));
  }

  private composeRecallBrief(aiName: string, query: string, items: RecallItem[]): string {
    const lines = [
      `# Memory Recall for ${aiName}`,
      '',
      `**Time**: ${new Date().toISOString()}`,
      `**Region**: all (cross-region)`,
      '',
      '---',
      '',
      '## Query',
      '',
      query,
      '',
      '---',
      '',
      '## Relevant Context',
      '',
    ];

    if (items.length === 0) {
      lines.push('*No relevant memory recalled.*');
    } else {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        lines.push(`### ${i + 1}. ${item.text}`);
        lines.push(`- source: ${item.source}`);
        if (item.kind) {
          lines.push(`- kind: ${item.kind}`);
        }
        lines.push(`- importance: ${item.importance}`);
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('');
    lines.push('**Instructions**: Use the recalled context above to answer the query.');
    lines.push('');
    return lines.join('\n');
  }

  private async runVerificationCycle(): Promise<void> {
    await this.verifyPendingRequestStatuses();
    await this.verifyBySearchFallback();
    this.cleanupRecentStore();
  }

  private async verifyPendingRequestStatuses(): Promise<void> {
    for (const [requestId, ref] of this.requestToRecent.entries()) {
      try {
        this.statsLookups += 1;
        const status = await this.client.getRequestStatus(requestId);

        if (status.found && status.data) {
          this.statsFound += 1;
          if (status.data.status === 'success') {
            this.markRecentVerifiedAndDelete(ref.aiName, ref.recentId);
            this.requestToRecent.delete(requestId);
          } else if (status.data.status === 'failed') {
            this.updateRecentStatus(ref.aiName, ref.recentId, 'failed');
            this.requestToRecent.delete(requestId);
          }
        }
      } catch (error) {
        logger.warn({ error, requestId }, 'Request status verification failed');
      }
    }
  }

  private async verifyBySearchFallback(): Promise<void> {
    for (const [aiName, entries] of this.recentStore.entries()) {
      for (const entry of entries) {
        if (entry.status !== 'sync_submitted' && entry.status !== 'pending_sync') {
          continue;
        }

        if (entry.verifyAttempts >= 3) {
          continue;
        }

        entry.verifyAttempts += 1;
        this.fallbackVerifies += 1;

        try {
          const resp = await this.retrieveMemories({
            aiName,
            query: this.compactText(entry.content, 120),
            regionId: undefined,
          });
          const items = this.extractMemoryItems(resp);
          const target = this.normalizeText(entry.content);
          const found = items.some(item => this.normalizeText(item).includes(target.slice(0, 80)));

          if (found) {
            this.markRecentVerifiedAndDelete(aiName, entry.recentId);
            if (entry.requestId) {
              this.requestToRecent.delete(entry.requestId);
            }
          }
        } catch (error) {
          logger.warn({ error, aiName, recentId: entry.recentId }, 'Search fallback verify failed');
        }
      }
    }
  }

  private cleanupRecentStore(): void {
    const now = Date.now();

    for (const [aiName, entries] of this.recentStore.entries()) {
      const filtered = entries.filter(entry => now - entry.createdAt <= this.recentTTLms);
      this.recentStore.set(aiName, filtered);
    }
  }

  private updateRecentStatus(
    aiName: string,
    recentId: string,
    status: RecentStatus,
    requestId?: string
  ): void {
    const list = this.recentStore.get(aiName) || [];
    const hit = list.find(entry => entry.recentId === recentId);
    if (!hit) {
      return;
    }

    hit.status = status;
    if (requestId) {
      hit.requestId = requestId;
    }
  }

  private markRecentVerifiedAndDelete(aiName: string, recentId: string): void {
    const list = this.recentStore.get(aiName) || [];
    const filtered = list.filter(entry => entry.recentId !== recentId);
    this.recentStore.set(aiName, filtered);
  }

  private calculateRelevance(query: string, text: string): number {
    const q = this.normalizeText(query);
    const t = this.normalizeText(text);
    if (!q || !t) return 0;

    const tokens = q.split(' ').filter(Boolean);
    if (tokens.length === 0) return 0;

    const hit = tokens.filter(token => t.includes(token)).length;
    return hit / tokens.length;
  }

  private calculateFreshness(timestamp: number): number {
    const ageMs = Math.max(0, Date.now() - timestamp);
    const hours = ageMs / (1000 * 60 * 60);
    if (hours <= 1) return 1;
    if (hours <= 6) return 0.8;
    if (hours <= 24) return 0.6;
    if (hours <= 72) return 0.4;
    return 0.2;
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
    // Priority: episode > summary > subject > content
    const episode = record.episode;
    if (typeof episode === 'string' && episode.trim()) {
      return episode.trim();
    }

    const summary = record.summary;
    if (typeof summary === 'string' && summary.trim()) {
      return summary.trim();
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
