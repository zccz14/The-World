import express, { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { logger } from '../utils/logger';
import { AIIdentity } from '../utils/types';
import { WorldMemory } from '../memory/MemoryManager';

export class AIProxyServer {
  private app = express();
  private memory: WorldMemory;
  private realApiKey: string;
  private aiIdentities: Map<string, AIIdentity> = new Map();

  constructor(config: {
    port: number;
    realApiKey: string;
    targetBaseUrl: string;
    memory: WorldMemory;
  }) {
    this.memory = config.memory;
    this.realApiKey = config.realApiKey;
    this.setupProxy(config.targetBaseUrl);
    
    this.app.listen(config.port, () => {
      logger.info(`AI Proxy Server started on port ${config.port}`);
    });
  }

  private setupProxy(targetBaseUrl: string) {
    this.app.use(
      '/v1',
      createProxyMiddleware({
        target: targetBaseUrl,
        changeOrigin: true,
        on: {
          proxyReq: async (proxyReq, req: Request, res: Response) => {
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
          proxyRes: async (proxyRes, req: Request) => {
            await this.logAIResponse(req, proxyRes);
          },
        },
      })
    );
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
}
