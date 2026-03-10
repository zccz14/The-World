import { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import fs from 'fs/promises';
import path from 'path';
import { WorldMemory } from '../memory/MemoryManager';
import { logger } from '../utils/logger';
import { AIIdentity } from '../utils/types';
import { Config } from '../utils/config';

interface ProxyAuditRecord {
  id: string;
  startedAt: string;
  startedAtMs: number;
  dirPath: string;
  request: Record<string, unknown>;
}

export class AIProxyHandler {
  private memory: WorldMemory;
  private realApiKey: string;
  private targetBaseUrl: string;
  private realModel: string;
  private aiIdentities: Map<string, AIIdentity> = new Map();
  private proxyMiddleware: any;
  private auditRootDir: string;
  private requestAudits: WeakMap<Request, ProxyAuditRecord> = new WeakMap();

  constructor(config: {
    realApiKey: string;
    targetBaseUrl: string;
    realModel: string;
    memory: WorldMemory;
  }) {
    this.memory = config.memory;
    this.realApiKey = config.realApiKey;
    this.targetBaseUrl = config.targetBaseUrl;
    this.realModel = config.realModel;
    this.auditRootDir = path.join(Config.DATA_DIR, 'audit', 'ai-proxy');

    void this.ensureAuditRoot();

    this.proxyMiddleware = createProxyMiddleware({
      target: this.targetBaseUrl,
      changeOrigin: true,
      pathRewrite: rewritePath => rewritePath,
      on: {
        proxyReq: async (proxyReq: any, req: Request, res: Response) => {
          logger.info(`Proxy request: ${req.method} ${req.url}...`);

          proxyReq.setHeader('Authorization', `Bearer ${this.realApiKey}`);

          let outgoingBody = req.body;

          // Override model for chat completions requests
          if (req.path.includes('/chat/completions') && req.body) {
            const originalModel = req.body.model;
            const modifiedBody = { ...req.body, model: this.realModel };
            const bodyData = JSON.stringify(modifiedBody);
            outgoingBody = modifiedBody;

            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
            proxyReq.end();

            logger.info(`AI -> model override: ${originalModel} -> ${this.realModel}`);
          }

          await this.recordRequestAudit(req, outgoingBody);

          await this.logAIRequest(req);
          logger.info(`AI -> ${req.method} ${req.url}`);
        },
        proxyRes: async (proxyRes: any, req: Request) => {
          logger.info(`Response for ${req.method} ${req.url}: ${proxyRes.statusCode}`);
          this.captureResponseAudit(req, proxyRes);
          await this.logAIResponse(req, proxyRes);
        },
        error: (err: any, req: Request, res: any) => {
          logger.error(`Proxy error: ${err.message}`);
          void this.recordProxyError(req, err);
          if (!res.headersSent && res.status) {
            res.status(500).json({ error: 'Proxy error', details: err.message });
          }
        },
      },
    });
  }

  private async logAIRequest(req: Request) {
    try {
      await this.memory.logAIAction({
        aiName: 'active',
        regionId: 'global',
        action: 'api_request',
        result: `${req.method} ${req.url}`,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to log AI request');
    }
  }

  private async logAIResponse(req: Request, res: any) {
    logger.debug(`Response for ${req.method} ${req.url}: ${res.statusCode}`);
  }

  private async ensureAuditRoot(): Promise<void> {
    await fs.mkdir(this.auditRootDir, { recursive: true });
  }

  private async recordRequestAudit(req: Request, outgoingBody: unknown): Promise<void> {
    try {
      const id = this.buildAuditId();
      const startedAtMs = Date.now();
      const startedAt = new Date(startedAtMs).toISOString();
      const dirPath = path.join(this.auditRootDir, id);
      await fs.mkdir(dirPath, { recursive: true });

      const identity = this.resolveIdentity(req);
      const inferredAiName = this.inferAiNameFromBody(outgoingBody);
      const requestRecord: Record<string, unknown> = {
        id,
        startedAt,
        method: req.method,
        url: req.url,
        path: req.path,
        aiName: identity.aiName !== 'unknown' ? identity.aiName : inferredAiName || 'unknown',
        dummyKey: identity.dummyKey,
        inferredAiName,
        headers: this.sanitizeHeaders(req.headers as Record<string, unknown>),
        body: outgoingBody ?? null,
      };

      await fs.writeFile(
        path.join(dirPath, 'req.json'),
        JSON.stringify(requestRecord, null, 2),
        'utf-8'
      );

      this.requestAudits.set(req, {
        id,
        startedAt,
        startedAtMs,
        dirPath,
        request: requestRecord,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to write AI proxy request audit');
    }
  }

  private captureResponseAudit(req: Request, proxyRes: any): void {
    const audit = this.requestAudits.get(req);
    if (!audit) {
      return;
    }

    const chunks: Buffer[] = [];
    proxyRes.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buf);
    });

    proxyRes.on('end', () => {
      void this.writeMergedAudit(audit, proxyRes, Buffer.concat(chunks));
    });
  }

  private async writeMergedAudit(
    audit: ProxyAuditRecord,
    proxyRes: any,
    responseBuffer: Buffer
  ): Promise<void> {
    try {
      const finishedAtMs = Date.now();
      const responseText = responseBuffer.toString('utf-8');
      const merged = {
        id: audit.id,
        startedAt: audit.startedAt,
        finishedAt: new Date(finishedAtMs).toISOString(),
        durationMs: Math.max(0, finishedAtMs - audit.startedAtMs),
        request: audit.request,
        response: {
          statusCode: proxyRes.statusCode,
          headers: this.sanitizeHeaders((proxyRes.headers || {}) as Record<string, unknown>),
          bodyText: responseText,
          bodyJson: this.tryParseJson(responseText),
        },
      };

      await fs.writeFile(
        path.join(audit.dirPath, 'merged.json'),
        JSON.stringify(merged, null, 2),
        'utf-8'
      );
    } catch (error) {
      logger.error({ error, auditId: audit.id }, 'Failed to write AI proxy merged audit');
    }
  }

  private async recordProxyError(req: Request, err: Error): Promise<void> {
    const audit = this.requestAudits.get(req);
    if (!audit) {
      return;
    }

    try {
      const errorRecord = {
        id: audit.id,
        failedAt: new Date().toISOString(),
        error: {
          name: err.name,
          message: err.message,
          stack: err.stack,
        },
      };

      await fs.writeFile(
        path.join(audit.dirPath, 'merged.json'),
        JSON.stringify(errorRecord, null, 2),
        'utf-8'
      );
    } catch (writeError) {
      logger.error(
        { error: writeError, auditId: audit.id },
        'Failed to write AI proxy error audit'
      );
    }
  }

  private resolveIdentity(req: Request): { aiName: string; dummyKey: string } {
    const authHeader = req.header('authorization') || req.header('Authorization') || '';
    const dummyKey = authHeader.replace(/^Bearer\s+/i, '').trim();
    const identity = this.aiIdentities.get(dummyKey);
    return {
      aiName: identity?.aiName || 'unknown',
      dummyKey: dummyKey || 'unknown',
    };
  }

  private sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(headers || {})) {
      const lower = key.toLowerCase();
      if (lower === 'authorization' || lower === 'x-api-key' || lower === 'proxy-authorization') {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private tryParseJson(input: string): unknown {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  }

  private buildAuditId(): string {
    return `aiproxy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private inferAiNameFromBody(body: unknown): string | null {
    if (!body || typeof body !== 'object') {
      return null;
    }

    const payload = body as { messages?: Array<{ role?: string; content?: unknown }> };
    if (!Array.isArray(payload.messages)) {
      return null;
    }

    for (const message of payload.messages) {
      if (message?.role !== 'user') {
        continue;
      }

      const content = message.content;
      if (typeof content === 'string') {
        const matched = content.match(/\bYou are\s+([a-zA-Z0-9_-]+)\s+in region\b/i);
        if (matched?.[1]) {
          return matched[1];
        }
        continue;
      }

      if (Array.isArray(content)) {
        for (const part of content) {
          if (!part || typeof part !== 'object') {
            continue;
          }
          const text = (part as { text?: unknown }).text;
          if (typeof text !== 'string') {
            continue;
          }
          const matched = text.match(/\bYou are\s+([a-zA-Z0-9_-]+)\s+in region\b/i);
          if (matched?.[1]) {
            return matched[1];
          }
        }
      }
    }

    return null;
  }

  registerAI(aiName: string): string {
    const dummyKey = `tw-${aiName}-${Date.now()}`;
    this.aiIdentities.set(dummyKey, { aiName, dummyKey });
    logger.info(`Registered AI: ${aiName} with dummy key: ${dummyKey}`);
    return dummyKey;
  }

  listAI(): string[] {
    const aiNames = new Set<string>();
    for (const identity of this.aiIdentities.values()) {
      aiNames.add(identity.aiName);
    }
    return Array.from(aiNames);
  }

  unregisterAI(dummyKey: string): boolean {
    return this.aiIdentities.delete(dummyKey);
  }

  getMiddleware() {
    return this.proxyMiddleware;
  }

  getIdentities() {
    return this.aiIdentities;
  }
}
