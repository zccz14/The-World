import Docker from 'dockerode';
import { logger } from '../utils/logger';
import { AIProxyServer } from '../proxy/AIProxyServer';
import { WorldMemory } from '../memory/MemoryManager';
import { RegionManager } from './RegionManager';

export class AIUserManager {
  private regionManager: RegionManager;
  private memory: WorldMemory;
  private proxy: AIProxyServer;

  constructor(memory: WorldMemory, proxy: AIProxyServer) {
    this.memory = memory;
    this.proxy = proxy;
    this.regionManager = new RegionManager(memory, proxy);
  }

  async createAI(aiName: string, regionName: string): Promise<string> {
    logger.info(`Creating AI: ${aiName} in region: ${regionName}`);

    const dummyKey = this.proxy.registerAI(aiName, regionName);

    const container = await this.regionManager.getRegion(regionName);
    if (!container) {
      throw new Error(`Region not found: ${regionName}`);
    }

    const proxyUrl = process.env.AI_PROXY_URL || 'http://host.docker.internal:3456/v1';

    const exec = await container.exec({
      Cmd: [
        'sh', '-c',
        `useradd -m -s /bin/bash ${aiName} && mkdir -p /home/${aiName}/.opencode && echo '{"apiBaseUrl":"${proxyUrl}","apiKey":"${dummyKey}","model":"gpt-4"}' > /home/${aiName}/.opencode/config.json && chown -R ${aiName}:${aiName} /home/${aiName}/.opencode && chmod 600 /home/${aiName}/.opencode/config.json`,
      ],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Detach: false });
    await this.streamToString(stream);

    await this.memory.logSystemEvent({
      type: 'ai_created',
      aiName,
      regionId: regionName,
      timestamp: Date.now(),
    });

    logger.info(`AI created: ${aiName} with dummy key: ${dummyKey}`);
    
    return dummyKey;
  }

  async listAI(regionName: string): Promise<string[]> {
    const container = await this.regionManager.getRegion(regionName);
    if (!container) {
      return [];
    }

    const exec = await container.exec({
      Cmd: ['sh', '-c', 'ls /home'],
      AttachStdout: true,
    });

    const stream = await exec.start({ Detach: false });
    const output = await this.streamToString(stream);

    return output
      .split('\n')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('.'));
  }

  async execCommand(aiName: string, regionName: string, command: string): Promise<string> {
    logger.debug(`Executing command for ${aiName}: ${command}`);

    const container = await this.regionManager.getRegion(regionName);
    if (!container) {
      throw new Error(`Region not found: ${regionName}`);
    }

    const exec = await container.exec({
      Cmd: ['node', '/daemon/client.js', aiName, command],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Detach: false });
    return this.streamToString(stream);
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
