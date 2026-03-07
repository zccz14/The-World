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

    const stream = await this.docker.buildImage(
      {
        context,
        src: ['docker', 'dist'],
      },
      {
        t: imageName,
        dockerfile,
      }
    );

    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        err => (err ? reject(err) : resolve()),
        event => {
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
    network?: string;
    ports?: Record<string, number>;
  }): Promise<Docker.Container> {
    logger.info(`Creating container: ${options.name}`);

    let hostIp = '172.19.0.1';
    if (options.network) {
      try {
        const network = await this.docker.getNetwork(options.network).inspect();
        if (network.IPAM?.Config?.[0]?.Gateway) {
          hostIp = network.IPAM.Config[0].Gateway;
        }
      } catch (error) {
        logger.warn('Failed to get network gateway, using default');
      }
    }

    const portBindings: any = {};
    const exposedPorts: any = {};

    if (options.ports) {
      for (const [containerPort, hostPort] of Object.entries(options.ports)) {
        const portKey = `${containerPort}/tcp`;
        exposedPorts[portKey] = {};
        portBindings[portKey] = [{ HostPort: String(hostPort) }];
      }
    }

    const container = await this.docker.createContainer({
      name: options.name,
      Image: options.image,
      ExposedPorts: exposedPorts,
      HostConfig: {
        Mounts: options.mounts?.map(m => ({
          Type: 'bind',
          Source: m.source,
          Target: m.target,
        })),
        NetworkMode: options.network,
        PortBindings: portBindings,
      },
      Env: [
        ...Object.entries(options.env || {}).map(([k, v]) => `${k}=${v}`),
        `HOST_GATEWAY_IP=${hostIp}`,
      ],
    });

    await container.start();
    logger.info(`Container started: ${options.name}`);

    return container;
  }

  async ensureNetwork(networkName: string): Promise<void> {
    try {
      await this.docker.getNetwork(networkName).inspect();
      logger.info(`Network ${networkName} already exists`);
    } catch (error) {
      await this.docker.createNetwork({
        Name: networkName,
        CheckDuplicate: true,
      });
      logger.info(`Network ${networkName} created`);
    }
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
