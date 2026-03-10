import { Request, Response } from 'express';
import { AIUserManager } from '../core/AIUserManager';
import { AIInvocationRegistry } from '../core/AIInvocationRegistry';

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: any;
}

const JSON_RPC_VERSION = '2.0';

export class MemoryMcpServer {
  private aiManager: AIUserManager;
  private authToken?: string;
  private invocationRegistry: AIInvocationRegistry;

  constructor(
    aiManager: AIUserManager,
    invocationRegistry: AIInvocationRegistry,
    authToken?: string
  ) {
    this.aiManager = aiManager;
    this.invocationRegistry = invocationRegistry;
    this.authToken = authToken;
  }

  async handleRequest(req: Request, res: Response): Promise<void> {
    if (!this.isAuthorized(req)) {
      res.status(401).json({ error: 'Unauthorized MCP access' });
      return;
    }

    const payload = req.body as JsonRpcRequest;
    if (!payload || payload.jsonrpc !== JSON_RPC_VERSION || !payload.method) {
      this.writeError(res, payload?.id ?? null, -32600, 'Invalid Request');
      return;
    }

    try {
      switch (payload.method) {
        case 'initialize':
          this.writeResult(res, payload.id ?? null, {
            protocolVersion: '2024-11-05',
            serverInfo: {
              name: 'the-world-memory-mcp',
              version: '0.1.0',
            },
            capabilities: {
              tools: {
                listChanged: false,
              },
            },
          });
          return;
        case 'ping':
          this.writeResult(res, payload.id ?? null, {});
          return;
        case 'notifications/initialized':
          res.status(204).end();
          return;
        case 'tools/list':
          this.writeResult(res, payload.id ?? null, {
            tools: this.getToolDefinitions(),
          });
          return;
        case 'tools/call':
          await this.handleToolsCall(payload, res);
          return;
        default:
          this.writeError(res, payload.id ?? null, -32601, `Method not found: ${payload.method}`);
          return;
      }
    } catch (error: any) {
      this.writeError(res, payload.id ?? null, -32000, error?.message || 'Internal error');
    }
  }

  private async handleToolsCall(payload: JsonRpcRequest, res: Response): Promise<void> {
    const name = payload.params?.name;
    const args = payload.params?.arguments || {};
    const requestedAiName = typeof args.aiName === 'string' ? args.aiName : undefined;
    const sessionId = this.extractSessionId(payload, res.req);
    const runId = this.extractRunId(payload, res.req);
    const regionName = this.extractRegionName(payload, res.req);
    const user = this.extractUser(payload, res.req);
    const resolvedIdentity = this.invocationRegistry.resolve({
      requestedAiName,
      sessionId,
      runId,
      regionName,
      user,
    });

    if (sessionId && resolvedIdentity.aiName && resolvedIdentity.source !== 'session') {
      this.invocationRegistry.bindSessionToAI(
        sessionId,
        resolvedIdentity.aiName,
        regionName,
        runId
      );
    }

    if (typeof name !== 'string') {
      this.writeError(res, payload.id ?? null, -32602, 'Invalid params: tool name is required');
      return;
    }

    if (name === 'memory.remember') {
      if (!resolvedIdentity.aiName) {
        this.writeError(
          res,
          payload.id ?? null,
          -32602,
          'Unable to resolve AI identity for memory.remember'
        );
        return;
      }

      const result = await this.aiManager.rememberMemoryForAI({
        aiName: resolvedIdentity.aiName,
        content: String(args.content || ''),
        kind: args.kind,
        importance: typeof args.importance === 'number' ? args.importance : 3,
        source: String(args.source || 'mcp-memory-tool'),
        metadata:
          args.metadata && typeof args.metadata === 'object'
            ? (args.metadata as Record<string, unknown>)
            : undefined,
      });

      this.writeResult(res, payload.id ?? null, {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
        structuredContent: {
          ...result,
          identity: {
            requestedAiName: requestedAiName || null,
            resolvedAiName: resolvedIdentity.aiName,
            resolveSource: resolvedIdentity.source,
            sessionId: resolvedIdentity.sessionId || sessionId || null,
            runId: resolvedIdentity.runId || runId || null,
          },
        },
      });
      return;
    }

    if (name === 'memory.recall') {
      if (!resolvedIdentity.aiName) {
        this.writeError(
          res,
          payload.id ?? null,
          -32602,
          'Unable to resolve AI identity for memory.recall'
        );
        return;
      }

      const result = await this.aiManager.recallMemoryForAI({
        aiName: resolvedIdentity.aiName,
        query: String(args.query || ''),
        topK: typeof args.topK === 'number' ? args.topK : undefined,
        budgetChars: typeof args.budgetChars === 'number' ? args.budgetChars : undefined,
      });

      this.writeResult(res, payload.id ?? null, {
        content: [
          {
            type: 'text',
            text: result.briefMarkdown,
          },
        ],
        structuredContent: {
          ...result,
          identity: {
            requestedAiName: requestedAiName || null,
            resolvedAiName: resolvedIdentity.aiName,
            resolveSource: resolvedIdentity.source,
            sessionId: resolvedIdentity.sessionId || sessionId || null,
            runId: resolvedIdentity.runId || runId || null,
          },
        },
      });
      return;
    }

    if (name === 'memory.health') {
      const result = this.aiManager.getMemoryHealth();
      this.writeResult(res, payload.id ?? null, {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
        structuredContent: result,
      });
      return;
    }

    this.writeError(res, payload.id ?? null, -32601, `Tool not found: ${name}`);
  }

  private getToolDefinitions() {
    return [
      {
        name: 'memory.remember',
        description:
          'Alias: memory_memory_remember. Use AFTER you identify durable, reusable information: user preferences, stable facts, explicit constraints, decisions, or TODOs. Do NOT store secrets, credentials, private identifiers, or one-off noise.',
        inputSchema: {
          type: 'object',
          properties: {
            aiName: {
              type: 'string',
              description:
                'Optional AI identity name. The server auto-resolves identity from invocation/session context and may ignore this field.',
            },
            content: {
              type: 'string',
              description:
                'The durable memory text to store. Keep concise and reusable; avoid transient chatter.',
            },
            kind: {
              type: 'string',
              description:
                'Memory class. Prefer fact/constraint/decision/todo for reusable context.',
              enum: ['fact', 'key_dialogue', 'decision', 'constraint', 'todo', 'lesson', 'episode'],
            },
            importance: {
              type: 'number',
              minimum: 1,
              maximum: 5,
              description: 'Importance score from 1 (low) to 5 (critical).',
            },
            source: {
              type: 'string',
              description: 'Call-site source label, for example opencode-agent or scheduler.',
            },
            metadata: {
              type: 'object',
              description: 'Optional structured context for tracing and later filtering.',
            },
          },
          required: ['content', 'kind', 'source'],
          additionalProperties: false,
        },
      },
      {
        name: 'memory.recall',
        description:
          'Alias: memory_memory_recall. Default action: call this first before answering unless the task is purely local/math/syntax with no user history dependency. Always call when uncertainty exists about preferences, prior decisions, ongoing tasks, follow-ups, or references like "previously/earlier/that". Recall searches across all regions.',
        inputSchema: {
          type: 'object',
          properties: {
            aiName: {
              type: 'string',
              description:
                'Optional AI identity name. The server auto-resolves identity from invocation/session context and may ignore this field.',
            },
            query: {
              type: 'string',
              description:
                'What context is needed for the current response. Phrase as the user need, not keywords only.',
            },
            topK: {
              type: 'number',
              minimum: 1,
              description: 'Optional max number of candidate items before brief assembly.',
            },
            budgetChars: {
              type: 'number',
              minimum: 200,
              description: 'Optional character budget for returned brief markdown.',
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
      {
        name: 'memory.health',
        description:
          'Alias: memory_memory_health. Inspect pipeline health and counters for remember/recall diagnostics.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    ];
  }

  private writeResult(res: Response, id: JsonRpcId, result: unknown): void {
    res.json({
      jsonrpc: JSON_RPC_VERSION,
      id,
      result,
    });
  }

  private writeError(res: Response, id: JsonRpcId, code: number, message: string): void {
    res.json({
      jsonrpc: JSON_RPC_VERSION,
      id,
      error: {
        code,
        message,
      },
    });
  }

  private isAuthorized(req: Request): boolean {
    if (!this.authToken) {
      return true;
    }

    const token = req.header('x-mcp-token');
    return token === this.authToken;
  }

  private extractSessionId(payload: JsonRpcRequest, req: Request): string | undefined {
    const headerCandidates = [
      req.header('x-opencode-session-id'),
      req.header('x-session-id'),
      req.header('x-opencode-session'),
      req.header('opencode-session-id'),
    ];
    for (const candidate of headerCandidates) {
      if (candidate && candidate.trim()) {
        return candidate.trim();
      }
    }

    const fromPayload = this.findFirstStringByKey(payload.params, [
      'session_id',
      'sessionId',
      'sessionID',
    ]);
    return fromPayload;
  }

  private extractRunId(payload: JsonRpcRequest, req: Request): string | undefined {
    const headerCandidates = [req.header('x-tw-run-id'), req.header('x-run-id')];
    for (const candidate of headerCandidates) {
      if (candidate && candidate.trim()) {
        return candidate.trim();
      }
    }

    return this.findFirstStringByKey(payload.params, ['runId', 'run_id']);
  }

  private extractRegionName(payload: JsonRpcRequest, req: Request): string | undefined {
    const queryRegion = req.query?.region;
    if (typeof queryRegion === 'string' && queryRegion.trim()) {
      return queryRegion.trim();
    }

    const headerRegion = req.header('x-tw-region') || req.header('x-region');
    if (headerRegion && headerRegion.trim()) {
      return headerRegion.trim();
    }

    return this.findFirstStringByKey(payload.params, ['region', 'regionName', 'region_name']);
  }

  private extractUser(payload: JsonRpcRequest, req: Request): string {
    const queryUser = req.query?.user;
    if (typeof queryUser === 'string' && queryUser.trim()) {
      return queryUser.trim();
    }

    const headerUser = req.header('x-tw-user') || req.header('x-user');
    if (headerUser && headerUser.trim()) {
      return headerUser.trim();
    }

    const fromParams = this.findFirstStringByKey(payload.params, ['user']);
    if (fromParams) {
      return fromParams;
    }

    return 'agent';
  }

  private findFirstStringByKey(input: unknown, keys: string[]): string | undefined {
    if (!input) {
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
