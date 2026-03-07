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

  async createAI(aiName: string, regionName: string): Promise<string> {
    logger.info(`Creating AI: ${aiName} in region: ${regionName}`);

    const dummyKey = this.proxy.registerAI(aiName, regionName);

    const container = await this.regionManager.getRegion(regionName);
    if (!container) {
      throw new Error(`Region not found: ${regionName}`);
    }

    const proxyUrl = 'http://localhost:4041/v1';

    const exec = await container.exec({
      Cmd: [
        'sh', '-c',
        `useradd -m -s /bin/bash ${aiName} && ` +
        `echo 'export PATH="/usr/local/bin:$PATH"' >> /home/${aiName}/.bashrc && ` +
        `echo 'export PATH="/usr/local/bin:$PATH"' >> /home/${aiName}/.profile && ` +
        `mkdir -p /home/${aiName}/.opencode && ` +
        `echo '{"apiBaseUrl":"${proxyUrl}","apiKey":"${dummyKey}"}' > /home/${aiName}/.opencode/config.json && ` +
        `chown -R ${aiName}:${aiName} /home/${aiName}/.opencode && ` +
        `chmod 600 /home/${aiName}/.opencode/config.json`,
      ],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Detach: false });
    await this.streamToString(stream);

    logger.info(`AI created: ${aiName}, initializing opencode...`);
    
    const daemonClient = new RegionDaemonClient(regionName);
    await daemonClient.execute(aiName, 'opencode --version && opencode run "init" --format json', 120000);
    
    logger.info(`AI ${aiName} opencode initialized`);
    
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

    const daemonClient = new RegionDaemonClient(regionName);
    const result = await daemonClient.execute(aiName, command);
    
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
