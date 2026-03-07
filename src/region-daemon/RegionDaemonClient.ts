import * as http from 'http';
import Docker from 'dockerode';

export interface ExecuteResult {
  success: boolean;
  stdout: string;
  stderr: string;
  error?: string;
  killed?: boolean;
  code?: string | number;
}

export interface ServeStatus {
  success: boolean;
  user: string;
  port?: number;
  error?: string;
}

export class RegionDaemonClient {
  private docker = new Docker();

  constructor(
    private containerName: string,
    private daemonPort: number = 4040,
    private timeout: number = 120000
  ) {}

  async execute(user: string, command: string, timeout?: number): Promise<ExecuteResult> {
    const body = JSON.stringify({ user, command, timeout });
    const response = await this.execCurl('/execute', 'POST', body, timeout);
    return JSON.parse(response);
  }

  async startServe(user: string, port?: number): Promise<ServeStatus> {
    const body = JSON.stringify({ user, port });
    const response = await this.execCurl('/serve/start', 'POST', body);
    return JSON.parse(response);
  }

  async stopServe(user: string): Promise<ServeStatus> {
    const body = JSON.stringify({ user });
    const response = await this.execCurl('/serve/stop', 'POST', body);
    return JSON.parse(response);
  }

  async observe(user: string): Promise<any> {
    const response = await this.execCurl(`/observe/${user}`, 'GET');
    return JSON.parse(response);
  }

  async health(): Promise<{ status: string }> {
    const response = await this.execCurl('/health', 'GET');
    return JSON.parse(response);
  }

  private async execCurl(pathname: string, method: string, body?: string, timeout?: number): Promise<string> {
    const container = this.docker.getContainer(this.containerName);
    const actualTimeout = timeout || this.timeout;
    
    const curlCmd = body
      ? `curl -s -X ${method} -H "Content-Type: application/json" -d '${body.replace(/'/g, "'\\''")}' http://localhost:${this.daemonPort}${pathname}`
      : `curl -s -X ${method} http://localhost:${this.daemonPort}${pathname}`;
    
    const exec = await container.exec({
      Cmd: ['sh', '-c', curlCmd],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Detach: false });
    
    return new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => {
        reject(new Error('Timeout'));
      }, actualTimeout);
      
      stream.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      stream.on('end', () => {
        clearTimeout(timer);
        resolve(output);
      });
      stream.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
