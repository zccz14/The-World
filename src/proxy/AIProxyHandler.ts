import { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { WorldMemory } from '../memory/MemoryManager';
import { logger } from '../utils/logger';
import { AIIdentity } from '../utils/types';

export class AIProxyHandler {
  private memory: WorldMemory;
  private realApiKey: string;
  private targetBaseUrl: string;
  private aiIdentities: Map<string, AIIdentity> = new Map();
  private proxyMiddleware: any;

  constructor(config: {
    realApiKey: string;
    targetBaseUrl: string;
    memory: WorldMemory;
  }) {
    this.memory = config.memory;
    this.realApiKey = config.realApiKey;
    this.targetBaseUrl = config.targetBaseUrl;
    
    this.proxyMiddleware = createProxyMiddleware({
      target: this.targetBaseUrl,
      changeOrigin: true,
      on: {
        proxyReq: async (proxyReq: any, req: Request, res: Response) => {
          const dummyKey = req.headers['authorization']?.replace('Bearer ', '');
          
          const identity = this.verifyAI(dummyKey);
          if (!identity) {
            res.status(401).json({ error: 'Invalid AI identity' });
            return;
          }
          
          proxyReq.setHeader('Authorization', `Bearer ${this.realApiKey}`);
          
          await this.logAIRequest(identity.aiName, req);
          
          logger.debug(`AI ${identity.aiName} -> ${req.method} ${req.url}`);
        },
        proxyRes: async (proxyRes: any, req: Request) => {
          await this.logAIResponse(req, proxyRes);
        },
      },
    });
  }

  private verifyAI(dummyKey?: string): AIIdentity | null {
    if (!dummyKey) return null;
    return this.aiIdentities.get(dummyKey) || null;
  }

  private async logAIRequest(aiName: string, req: Request) {
    try {
      await this.memory.logAIAction({
        aiName,
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

  registerAI(aiName: string, regionId?: string): string {
    const dummyKey = `tw-${aiName}-${Date.now()}`;
    this.aiIdentities.set(dummyKey, { aiName, dummyKey, regionId });
    logger.info(`Registered AI: ${aiName} with dummy key: ${dummyKey}`);
    return dummyKey;
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
