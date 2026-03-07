import Docker from 'dockerode';
import { DockerManager } from './DockerManager';
import { logger } from '../utils/logger';
import { WorldMemory } from '../memory/MemoryManager';
import { AIProxyHandler } from '../proxy/AIProxyHandler';
import path from 'path';
import fs from 'fs';

export class RegionManager {
  private dockerManager = new DockerManager();
  private memory: WorldMemory;
  private proxy: AIProxyHandler;
  private regionImageName = 'the-world-region:latest';
  private networkName = 'the-world';

  constructor(memory: WorldMemory, proxy: AIProxyHandler) {
    this.memory = memory;
    this.proxy = proxy;
  }

  async initialize() {
    await this.dockerManager.ensureNetwork(this.networkName);
  }

  async createRegion(regionName: string): Promise<void> {
    logger.info(`Creating region: ${regionName}`);

    const imageExists = await this.dockerManager.isImageExists(this.regionImageName);
    
    if (!imageExists) {
      await this.buildRegionImage();
    }

    const hostDir = path.join(process.env.WORLD_DATA_DIR || process.env.HOME || '/tmp', '.the-world', 'regions', regionName);
    await this.ensureDirectory(hostDir);

    await this.dockerManager.createContainer({
      name: regionName,
      image: this.regionImageName,
      network: this.networkName,
      mounts: [
        { source: path.join(hostDir, 'shared'), target: '/world/shared' },
        { source: path.join(hostDir, 'inbox'), target: '/world/inbox' },
        { source: path.join(hostDir, 'outbox'), target: '/world/outbox' },
      ],
      ports: {
        '4096': 0, // Let Docker assign a random host port for opencode serve
      },
    });

    await this.memory.logSystemEvent({
      type: 'region_created',
      regionId: regionName,
      timestamp: Date.now(),
    });

    logger.info(`Region created: ${regionName}`);
  }

  private async buildRegionImage(): Promise<void> {
    logger.info('Building region image');
    
    const context = path.resolve(__dirname, '../../');
    const dockerfile = 'docker/Dockerfile.region';
    await this.dockerManager.buildImage(this.regionImageName, context, dockerfile);
    
    logger.info('Region image built');
  }

  private async ensureDirectory(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.debug(`Created directory: ${dir}`);
    }

    ['shared', 'inbox', 'outbox'].forEach(subdir => {
      const fullPath = path.join(dir, subdir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath);
        logger.debug(`Created directory: ${fullPath}`);
      }
    });
  }

  async listRegions(): Promise<string[]> {
    const containers = await this.dockerManager.listContainers();
    return containers
      .filter(c => c.Image.includes('the-world-region'))
      .map(c => c.Names[0].replace(/^\//, ''));
  }

  async getRegion(regionName: string): Promise<Docker.Container | null> {
    return this.dockerManager.getContainer(regionName);
  }

  async getRegionOpencodePort(regionName: string): Promise<number | null> {
    const container = await this.dockerManager.getContainer(regionName);
    if (!container) return null;
    
    const inspect = await container.inspect();
    const portBinding = inspect.NetworkSettings.Ports?.['4096/tcp'];
    if (portBinding && portBinding[0]?.HostPort) {
      return parseInt(portBinding[0].HostPort, 10);
    }
    return null;
  }

  async removeRegion(regionName: string): Promise<void> {
    logger.info(`Removing region: ${regionName}`);
    
    await this.dockerManager.removeContainer(regionName);
    
    await this.memory.logSystemEvent({
      type: 'region_removed',
      regionId: regionName,
      timestamp: Date.now(),
    });
    
    logger.info(`Region removed: ${regionName}`);
  }
}
