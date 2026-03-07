import express, { Express, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { AIProxyHandler } from '../proxy/AIProxyHandler';
import { WorldMemory } from '../memory/MemoryManager';
import { RegionManager } from '../core/RegionManager';
import { AIUserManager } from '../core/AIUserManager';
import { Config } from '../utils/config';
import { logger } from '../utils/logger';
import Docker from 'dockerode';

export class TheWorldServer {
  private app: Express;
  private proxyHandler?: AIProxyHandler;
  private memory?: WorldMemory;
  private regionManager?: RegionManager;
  private aiManager?: AIUserManager;
  private server?: any;

  constructor() {
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  async initialize() {
    logger.info('Initializing TheWorld Server...');

    this.memory = new WorldMemory(Config.EVERMEMOS_URL);
    
    this.proxyHandler = new AIProxyHandler({
      realApiKey: Config.REAL_AI_API_KEY,
      targetBaseUrl: Config.AI_TARGET_BASE_URL,
      memory: this.memory,
    });

    this.regionManager = new RegionManager(this.memory, this.proxyHandler);
    this.aiManager = new AIUserManager(this.memory, this.proxyHandler);

    logger.info('TheWorld Server initialized');
  }

  private setupRoutes() {
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: Date.now(),
        services: {
          server: 'running',
          proxy: this.proxyHandler ? 'running' : 'stopped',
        },
      });
    });

    this.app.get('/api/status', async (req: Request, res: Response) => {
      try {
        const regions = this.regionManager ? await this.regionManager.listRegions() : [];
        res.json({
          status: 'ok',
          regions: regions.length,
          aiIdentities: this.proxyHandler?.getIdentities().size || 0,
          uptime: process.uptime(),
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/regions', async (req: Request, res: Response) => {
      try {
        const { name } = req.body;
        if (!name) {
          return res.status(400).json({ error: 'Region name is required' });
        }

        await this.regionManager!.createRegion(name);
        res.json({ status: 'ok', region: name });
      } catch (error: any) {
        logger.error({ error }, 'Failed to create region');
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/regions', async (req: Request, res: Response) => {
      try {
        const regions = await this.regionManager!.listRegions();
        res.json({ regions });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/ai', async (req: Request, res: Response) => {
      try {
        const { name, region } = req.body;
        if (!name || !region) {
          return res.status(400).json({ error: 'AI name and region are required' });
        }

        const dummyKey = await this.aiManager!.createAI(name, region);
        res.json({ status: 'ok', ai: name, dummyKey });
      } catch (error: any) {
        logger.error({ error }, 'Failed to create AI');
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/ai', async (req: Request, res: Response) => {
      try {
        const { region } = req.query;
        const aiList = await this.aiManager!.listAI(region as string);
        res.json({ aiList });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/ai/exec', async (req: Request, res: Response) => {
      try {
        const { ai, region, command } = req.body;
        if (!ai || !region || !command) {
          return res.status(400).json({ error: 'AI name, region, and command are required' });
        }

        const result = await this.aiManager!.execCommand(ai, region, command);
        res.json({ result });
      } catch (error: any) {
        logger.error({ error }, 'Failed to execute command');
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/oracle/send', async (req: Request, res: Response) => {
      try {
        const { to, region, message } = req.body;
        if (!to || !region || !message) {
          return res.status(400).json({ error: 'Target AI, region, and message are required' });
        }

        await this.memory!.logOracle({
          aiName: to,
          regionId: region,
          content: message,
        });

        const docker = new Docker();
        
        try {
          const container = docker.getContainer(region);
          
          const oracleData = {
            to,
            from: 'human',
            content: message,
            timestamp: Date.now(),
          };
          
          const inboxFile = `oracle-${Date.now()}.msg`;
          
          const exec = await container.exec({
            Cmd: ['sh', '-c', `echo '${JSON.stringify(oracleData)}' > /world/inbox/${inboxFile}`],
            AttachStdout: true,
            AttachStderr: true,
          });
          
          await exec.start({ Detach: false });
          
          // Wait for AI to process and respond (max 30 seconds)
          const responseFile = `response-${inboxFile.replace('oracle-', '').replace('.msg', '')}.msg`;
          const outboxPath = path.join(Config.DATA_DIR, 'regions', region, 'outbox', responseFile);
          const maxWait = 30000;
          const startTime = Date.now();
          
          while (Date.now() - startTime < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 500));
            
            if (fs.existsSync(outboxPath)) {
              const responseContent = fs.readFileSync(outboxPath, 'utf-8');
              const aiResponse = JSON.parse(responseContent);
              
              return res.json({ 
                status: 'ok',
                message: 'Oracle sent and AI responded',
                file: inboxFile,
                response: aiResponse,
              });
            }
          }
          
          // Timeout - return success but no response
          res.json({ 
            status: 'ok',
            message: 'Oracle sent successfully, waiting for AI response',
            file: inboxFile,
            response: null,
          });
        } catch (dockerError: any) {
          logger.error({ error: dockerError }, 'Failed to write oracle to container');
          res.status(500).json({ 
            error: 'Failed to write oracle to container',
            details: dockerError.message,
          });
        }
      } catch (error: any) {
        logger.error({ error }, 'Failed to send oracle');
        res.status(500).json({ error: error.message });
      }
    });

    if (this.proxyHandler) {
      this.app.use('/v1', this.proxyHandler.getMiddleware());
    }
  }

  start(port: number = 3344) {
    this.server = this.app.listen(port, () => {
      logger.info(`TheWorld Server started on port ${port}`);
      logger.info(`AI Proxy available at http://localhost:${port}/v1`);
    });

    return this.server;
  }

  stop() {
    if (this.server) {
      this.server.close();
      logger.info('TheWorld Server stopped');
    }
  }
}
