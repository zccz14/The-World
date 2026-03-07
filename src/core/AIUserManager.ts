import Docker from 'dockerode';
import { logger } from '../utils/logger';
import { AIProxyHandler } from '../proxy/AIProxyHandler';
import { WorldMemory } from '../memory/MemoryManager';
import { RegionManager } from './RegionManager';
import { RegionDaemonClient } from '../region-daemon/RegionDaemonClient';

export class AIUserManager {
  private regionManager: RegionManager;
  private memory: WorldMemory;
  private proxy: AIProxyHandler;

  constructor(memory: WorldMemory, proxy: AIProxyHandler) {
    this.memory = memory;
    this.proxy = proxy;
    this.regionManager = new RegionManager(memory, proxy);
  }

  async createAI(aiName: string): Promise<string> {
    logger.info(`Creating AI: ${aiName}`);
    const dummyKey = this.proxy.registerAI(aiName);
    logger.info(`AI created: ${aiName} with dummy key: ${dummyKey}`);
    return dummyKey;
  }

  listAllAI(): string[] {
    return this.proxy.listAI();
  }

  async execCommand(aiName: string, regionName: string, command: string): Promise<string> {
    logger.debug(`Executing command for AI ${aiName} in region ${regionName}: ${command}`);

    const daemonClient = new RegionDaemonClient(regionName);
    const result = await daemonClient.execute('agent', command);
    
    if (result.success) {
      return result.stdout + result.stderr;
    } else {
      throw new Error(result.error || 'Command execution failed');
    }
  }

  private streamToString(stream: any): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';
      stream.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      stream.on('end', () => resolve(output));
      stream.on('error', reject);
    });
  }
}
