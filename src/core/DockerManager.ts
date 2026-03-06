import Docker from 'dockerode';
import { logger } from '../utils/logger';

export class DockerManager {
  private docker = new Docker();

  async isImageExists(imageName: string): Promise<boolean> {
    try {
      await this.docker.getImage(imageName).inspect();
      return true;
    } catch (error) {
      return false;
    }
  }

  async buildImage(imageName: string, context: string, dockerfile: string): Promise<void> {
    logger.info(`Building image: ${imageName}`);
    
    const stream = await this.docker.buildImage({
      context,
      src: [dockerfile],
    }, {
      t: imageName,
      dockerfile,
    });

    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (err) => (err ? reject(err) : resolve()),
        (event) => {
          if (event.stream) {
            logger.info(event.stream.trim());
          }
        }
      );
    });

    logger.info(`Image built: ${imageName}`);
  }

  async createContainer(options: {
    name: string;
    image: string;
    mounts?: Array<{ source: string; target: string }>;
    env?: Record<string, string>;
  }): Promise<Docker.Container> {
    logger.info(`Creating container: ${options.name}`);

    const container = await this.docker.createContainer({
      name: options.name,
      Image: options.image,
      HostConfig: {
        Mounts: options.mounts?.map(m => ({
          Type: 'bind',
          Source: m.source,
          Target: m.target,
        })),
        ExtraHosts: ['host.docker.internal:host-gateway'],
      },
      Env: Object.entries(options.env || {}).map(([k, v]) => `${k}=${v}`),
    });

    await container.start();
    logger.info(`Container started: ${options.name}`);
    
    return container;
  }

  async getContainer(name: string): Promise<Docker.Container | null> {
    try {
      const container = this.docker.getContainer(name);
      await container.inspect();
      return container;
    } catch (error) {
      return null;
    }
  }

  async listContainers(): Promise<Docker.ContainerInfo[]> {
    const containers = await this.docker.listContainers({ all: true });
    return containers;
  }

  async removeContainer(name: string): Promise<void> {
    logger.info(`Removing container: ${name}`);
    const container = this.docker.getContainer(name);
    await container.remove({ force: true });
  }
}
