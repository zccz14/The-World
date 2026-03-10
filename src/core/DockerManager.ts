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

  async execInContainer(
    containerName: string,
    command: string[],
    user: string = 'root',
    timeout: number = 120000
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const container = this.docker.getContainer(containerName);

    const exec = await container.exec({
      Cmd: command,
      User: user,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Detach: false });

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        reject(new Error(`Container exec timeout after ${timeout}ms`));
      }, timeout);

      this.docker.modem.demuxStream(
        stream,
        {
          write: (chunk: Buffer) => {
            stdout += chunk.toString();
          },
          end: () => {},
        } as any,
        {
          write: (chunk: Buffer) => {
            stderr += chunk.toString();
          },
          end: () => {},
        } as any
      );

      stream.on('end', async () => {
        clearTimeout(timer);
        try {
          const inspect = await exec.inspect();
          resolve({
            stdout,
            stderr,
            exitCode: inspect.ExitCode ?? 1,
          });
        } catch (error) {
          reject(error);
        }
      });

      stream.on('error', error => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }
}
