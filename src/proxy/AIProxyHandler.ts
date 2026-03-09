import { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { WorldMemory } from '../memory/MemoryManager';
import { logger } from '../utils/logger';
import { AIIdentity } from '../utils/types';

export class AIProxyHandler {
  private memory: WorldMemory;
  private realApiKey: string;
  private targetBaseUrl: string;
  private realModel: string;
  private aiIdentities: Map<string, AIIdentity> = new Map();
  private proxyMiddleware: any;

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

    this.proxyMiddleware = createProxyMiddleware({
      target: this.targetBaseUrl,
      changeOrigin: true,
      pathRewrite: path => path,
      on: {
        proxyReq: async (proxyReq: any, req: Request, res: Response) => {
          logger.info(`Proxy request: ${req.method} ${req.url}...`);

          proxyReq.setHeader('Authorization', `Bearer ${this.realApiKey}`);

          // Override model for chat completions requests
          if (req.path.includes('/chat/completions') && req.body) {
            const originalModel = req.body.model;
            const modifiedBody = { ...req.body, model: this.realModel };
            const bodyData = JSON.stringify(modifiedBody);

            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
            proxyReq.end();

            logger.info(`AI -> model override: ${originalModel} -> ${this.realModel}`);
          }

          await this.logAIRequest(req);
          logger.info(`AI -> ${req.method} ${req.url}`);
        },
        proxyRes: async (proxyRes: any, req: Request) => {
          logger.info(`Response for ${req.method} ${req.url}: ${proxyRes.statusCode}`);
          await this.logAIResponse(req, proxyRes);
        },
        error: (err: any, req: Request, res: any) => {
          logger.error(`Proxy error: ${err.message}`);
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
