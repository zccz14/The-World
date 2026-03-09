import express, { Express, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { AIProxyHandler } from '../proxy/AIProxyHandler';
import { WorldMemory } from '../memory/MemoryManager';
import { RegionManager } from '../core/RegionManager';
import { AIUserManager } from '../core/AIUserManager';
import { Config } from '../utils/config';
import { logger } from '../utils/logger';
import { RegionDaemonClient } from '../region-daemon/RegionDaemonClient';
import { WorldScheduler } from '../scheduler/WorldScheduler';

export class TheWorldServer {
  private app: Express;
  private proxyHandler?: AIProxyHandler;
  private memory?: WorldMemory;
  private regionManager?: RegionManager;
  private aiManager?: AIUserManager;
  private scheduler?: WorldScheduler;
  private server?: any;

  constructor() {
    this.app = express();
    this.app.use(express.json());
  }

  async initialize() {
    logger.info('Initializing TheWorld Server...');

    const auditLogPath = path.join(Config.DATA_DIR, 'audit', 'world-memory-audit.jsonl');
    this.memory = new WorldMemory(Config.EVERMEMOS_URL, auditLogPath);

    this.proxyHandler = new AIProxyHandler({
      realApiKey: Config.REAL_AI_API_KEY,
      targetBaseUrl: Config.AI_TARGET_BASE_URL,
      realModel: Config.REAL_AI_MODEL,
      memory: this.memory,
    });

    this.regionManager = new RegionManager(this.memory, this.proxyHandler);
    await this.regionManager.initialize();

    this.aiManager = new AIUserManager(this.memory, this.proxyHandler);

    this.scheduler = new WorldScheduler(this.aiManager, this.regionManager, this.memory, {
      enabled: Config.SCHEDULER_ENABLED,
      strategyName: Config.SCHEDULER_STRATEGY,
      tickInterval: Config.SCHEDULER_TICK_INTERVAL,
      persistencePath: Config.SCHEDULER_PERSISTENCE_PATH,
      heartbeatPrompt: Config.SCHEDULER_HEARTBEAT_PROMPT,
    });

    await this.scheduler.start();

    this.setupRoutes();

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
          scheduler: this.scheduler?.getStatus(),
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/scheduler/status', (req: Request, res: Response) => {
      if (!this.scheduler) {
        return res.status(404).json({ error: 'Scheduler is not initialized' });
      }

      res.json({ status: this.scheduler.getStatus() });
    });

    this.app.get('/api/scheduler/tasks', (req: Request, res: Response) => {
      if (!this.scheduler) {
        return res.status(404).json({ error: 'Scheduler is not initialized' });
      }

      res.json({ tasks: this.scheduler.getPendingTasks() });
    });

    this.app.post('/api/scheduler/tasks', async (req: Request, res: Response) => {
      if (!this.scheduler) {
        return res.status(404).json({ error: 'Scheduler is not initialized' });
      }

      const { type, priority, aiName, regionName, payload, timeout } = req.body;
      if (!type || priority === undefined || !aiName || !regionName) {
        return res.status(400).json({
          error: 'type, priority, aiName, and regionName are required',
        });
      }

      const taskId = await this.scheduler.scheduleTask({
        type,
        priority,
        aiName,
        regionName,
        payload: payload || {},
        timeout,
      });

      res.json({ status: 'scheduled', taskId });
    });

    this.app.delete('/api/scheduler/tasks/:taskId', async (req: Request, res: Response) => {
      if (!this.scheduler) {
        return res.status(404).json({ error: 'Scheduler is not initialized' });
      }

      const { taskId } = req.params;
      const cancelled = await this.scheduler.cancelTask(taskId);

      if (!cancelled) {
        return res.status(404).json({ error: `Task ${taskId} not found` });
      }

      res.json({ status: 'cancelled', taskId });
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
        const { name } = req.body;
        if (!name) {
          return res.status(400).json({ error: 'AI name is required' });
        }

        const dummyKey = await this.aiManager!.createAI(name);
        res.json({ status: 'ok', ai: name, dummyKey });
      } catch (error: any) {
        logger.error({ error }, 'Failed to create AI');
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/ai', async (req: Request, res: Response) => {
      try {
        const aiList = this.aiManager!.listAllAI();
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

        await this.memory!.logCommandExecution({
          aiName: ai,
          regionId: region,
          command,
          output: result,
          success: true,
        });

        res.json({ result });
      } catch (error: any) {
        logger.error({ error }, 'Failed to execute command');
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/agent/:region/:user/status', async (req: Request, res: Response) => {
      try {
        const { region, user } = req.params;

        const daemonClient = new RegionDaemonClient(region);

        try {
          const status = await daemonClient.observe(user);
          res.json({ status });
        } catch (error: any) {
          if (error.message?.includes('No serve process')) {
            res.json({
              status: 'stopped',
              message: 'Agent serve not running',
            });
          } else {
            throw error;
          }
        }
      } catch (error: any) {
        logger.error({ error }, 'Failed to get agent status');
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/agent/:region/:user/serve/start', async (req: Request, res: Response) => {
      try {
        const { region, user } = req.params;
        const { port } = req.body;

        const daemonClient = new RegionDaemonClient(region);
        const result = await daemonClient.startServe(user, port);
        res.json(result);
      } catch (error: any) {
        logger.error({ error }, 'Failed to start serve');
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/agent/:region/:user/serve/stop', async (req: Request, res: Response) => {
      try {
        const { region, user } = req.params;

        const daemonClient = new RegionDaemonClient(region);
        const result = await daemonClient.stopServe(user);
        res.json(result);
      } catch (error: any) {
        logger.error({ error }, 'Failed to stop serve');
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

        const daemonClient = new RegionDaemonClient(region);

        const command = `opencode run "${message.replace(/"/g, '\\"')}" --format json`;

        const result = await daemonClient.execute('agent', command, 60000);

        if (result.success) {
          const lines = (result.stdout + result.stderr).split('\n').filter(line => line.trim());
          let responseText = '';

          for (const line of lines) {
            try {
              const json = JSON.parse(line);
              if (json.type === 'text' && json.part?.text) {
                responseText += json.part.text;
              }
            } catch (e) {
              // Not JSON, skip
            }
          }

          await this.memory!.logOracleResponse({
            aiName: to,
            regionId: region,
            content: responseText || result.stdout,
          });

          res.json({
            status: 'ok',
            message: 'Oracle sent and AI responded',
            response: {
              to: 'human',
              from: to,
              response: responseText || result.stdout,
            },
          });
        } else {
          res.status(500).json({
            error: 'Failed to execute oracle',
            details: result.error,
            killed: result.killed,
          });
        }
      } catch (error: any) {
        logger.error({ error }, 'Failed to send oracle');
        res.status(500).json({ error: error.message });
      }
    });

    this.app.use('/opencode/:region', async (req: Request, res: Response, next) => {
      const region = req.params.region;

      try {
        const port = await this.regionManager!.getRegionOpencodePort(region);
        if (!port) {
          return res.status(404).json({
            error: `Region ${region} not found or OpenCode not available`,
          });
        }

        const proxy = createProxyMiddleware({
          target: `http://localhost:${port}`,
          changeOrigin: true,
          pathRewrite: {
            [`^/opencode/${region}`]: '',
          },
          on: {
            error: (err: any, req: Request, res: any) => {
              logger.error({ error: err, region, port }, 'OpenCode proxy error');
              if (!res.headersSent) {
                res.status(502).json({ error: 'Failed to connect to OpenCode instance' });
              }
            },
          },
        });
        proxy(req, res, next);
      } catch (error: any) {
        logger.error({ error, region }, 'Failed to get OpenCode port');
        res.status(500).json({ error: 'Internal server error' });
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
    if (this.scheduler) {
      void this.scheduler.stop();
    }

    if (this.server) {
      this.server.close();
      logger.info('TheWorld Server stopped');
    }
  }
}
