import * as http from 'http';
import { spawn, ChildProcess } from 'child_process';

// World (3344) 和 Region (62191) 互补: 3344 | 62191 = 0xFFFF
const WORLD_SERVER_PORT = 3344;
const DAEMON_PORT = 0xffff ^ WORLD_SERVER_PORT; // 62191

interface ServeProcess {
  user: string;
  port: number;
  process: ChildProcess;
}

const AGENT_USER = 'agent';

export class RegionDaemon {
  private controlServer: http.Server;
  private serveProcesses: Map<string, ServeProcess> = new Map();

  constructor() {
    this.controlServer = http.createServer((req, res) => this.handleControlRequest(req, res));
  }

  async start() {
    await new Promise<void>(resolve => {
      this.controlServer.listen(DAEMON_PORT, '0.0.0.0', () => {
        console.log(`[RegionDaemon] Control server listening on 0.0.0.0:${DAEMON_PORT}`);
        resolve();
      });
    });
  }

  private async handleControlRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url!, `http://localhost:${DAEMON_PORT}`);
    const pathname = url.pathname;

    res.setHeader('Content-Type', 'application/json');

    try {
      if (req.method === 'POST' && pathname === '/execute') {
        await this.handleExecute(req, res);
      } else if (req.method === 'GET' && pathname.startsWith('/observe/')) {
        await this.handleObserve(req, res, pathname);
      } else if (req.method === 'POST' && pathname === '/serve/start') {
        await this.handleServeStart(req, res);
      } else if (req.method === 'POST' && pathname === '/serve/stop') {
        await this.handleServeStop(req, res);
      } else if (req.method === 'GET' && pathname === '/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ok' }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (error: any) {
      console.error('[RegionDaemon] Error:', error);
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  private async handleExecute(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = await this.readBody(req);
    console.log(`[RegionDaemon] handleExecute received body: ${body.substring(0, 200)}`);

    const { command, timeout = 120000 } = JSON.parse(body);

    if (!command) {
      console.log('[RegionDaemon] Missing command');
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Missing command' }));
      return;
    }

    console.log(`[RegionDaemon] Execute as ${AGENT_USER}: ${command.substring(0, 100)}...`);
    console.log(`[RegionDaemon] Timeout: ${timeout}ms`);

    try {
      console.log('[RegionDaemon] Calling executeAsAgent...');
      const result = await this.executeAsAgent(command, timeout);
      console.log('[RegionDaemon] executeAsAgent completed');
      console.log(
        `[RegionDaemon] stdout length: ${result.stdout.length}, stderr length: ${result.stderr.length}`
      );

      const response = JSON.stringify({
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
      });
      console.log(`[RegionDaemon] Response length: ${response.length}`);

      res.writeHead(200);
      res.end(response);
      console.log('[RegionDaemon] Response sent');
    } catch (error: any) {
      console.error(`[RegionDaemon] Execute error:`, error.message);

      const response = JSON.stringify({
        success: false,
        error: error.message,
        killed: error.killed,
        code: error.code,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
      });

      res.writeHead(200);
      res.end(response);
      console.log('[RegionDaemon] Error response sent');
    }
  }

  private executeAsAgent(
    command: string,
    timeout: number
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawn('sh', ['-lc', command], {
        cwd: '/home/agent',
        env: { ...process.env, HOME: '/home/agent', PATH: '/usr/local/bin:/usr/bin:/bin' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let killed = false;
      let hasFinished = false;
      let resolved = false;

      console.log(`[RegionDaemon] Setting timeout for ${timeout}ms`);
      const timer = setTimeout(() => {
        console.log(
          `[RegionDaemon] TIMEOUT reached! killed=${killed}, hasFinished=${hasFinished}, resolved=${resolved}`
        );
        killed = true;
        proc.kill();
        const error: any = new Error('Timeout');
        error.killed = true;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }, timeout);

      proc.stdout.on('data', data => {
        const chunk = data.toString();
        stdout += chunk;
        console.log(
          `[RegionDaemon] ${AGENT_USER} stdout chunk (${chunk.length}b):`,
          chunk.substring(0, 100)
        );

        if (stdout.includes('"type":"step_finish"') && !hasFinished) {
          console.log(`[RegionDaemon] ${AGENT_USER} step_finish detected!`);
          hasFinished = true;
          clearTimeout(timer);
          if (!killed && !resolved) {
            resolved = true;
            console.log(
              `[RegionDaemon] Resolving with stdout=${stdout.length}b, stderr=${stderr.length}b`
            );
            resolve({ stdout, stderr });
            killed = true;
            console.log(`[RegionDaemon] Killing process after resolve...`);
            proc.kill();
          }
        }
      });

      proc.stderr.on('data', data => {
        stderr += data.toString();
        console.log(
          `[RegionDaemon] ${AGENT_USER} stderr (${data.length}b):`,
          data.toString().substring(0, 200)
        );
      });

      proc.on('close', code => {
        console.log(
          `[RegionDaemon] ${AGENT_USER} process closed with code ${code}, killed=${killed}, resolved=${resolved}`
        );
        clearTimeout(timer);
        if (killed || resolved) {
          console.log(`[RegionDaemon] Already handled, returning`);
          return;
        }

        resolved = true;
        console.log(`[RegionDaemon] Resolving from close event`);
        resolve({ stdout, stderr });
      });

      proc.on('error', err => {
        console.log(`[RegionDaemon] ${AGENT_USER} process error:`, err);
        clearTimeout(timer);
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });
    });
  }

  private async handleObserve(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string
  ) {
    const user = pathname.split('/')[2];

    if (!user) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Missing user' }));
      return;
    }

    const serveProcess = this.serveProcesses.get(user);
    if (!serveProcess) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: `No serve process for user ${user}` }));
      return;
    }

    const targetUrl = `http://localhost:${serveProcess.port}`;

    this.proxyRequest(targetUrl, req, res);
  }

  private async handleServeStart(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = await this.readBody(req);
    const { user, port = 3000 } = JSON.parse(body);
    if (user && user !== AGENT_USER) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: `Only ${AGENT_USER} is supported` }));
      return;
    }

    if (this.serveProcesses.has(AGENT_USER)) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: `Serve process already running for ${AGENT_USER}` }));
      return;
    }

    console.log(`[RegionDaemon] Starting opencode serve for ${AGENT_USER} on port ${port}`);

    const proc = spawn('sh', ['-lc', `opencode serve --port ${port}`], {
      cwd: '/home/agent',
      env: { ...process.env, HOME: '/home/agent', PATH: '/usr/local/bin:/usr/bin:/bin' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', data => {
      console.log(`[RegionDaemon] ${AGENT_USER} stdout:`, data.toString());
    });

    proc.stderr?.on('data', data => {
      console.log(`[RegionDaemon] ${AGENT_USER} stderr:`, data.toString());
    });

    proc.on('exit', code => {
      console.log(`[RegionDaemon] ${AGENT_USER} serve process exited with code ${code}`);
      this.serveProcesses.delete(AGENT_USER);
    });

    this.serveProcesses.set(AGENT_USER, {
      user: AGENT_USER,
      port,
      process: proc,
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    res.writeHead(200);
    res.end(
      JSON.stringify({
        success: true,
        user: AGENT_USER,
        port,
      })
    );
  }

  private async handleServeStop(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = await this.readBody(req);
    const { user } = JSON.parse(body);
    if (user && user !== AGENT_USER) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: `Only ${AGENT_USER} is supported` }));
      return;
    }

    const serveProcess = this.serveProcesses.get(AGENT_USER);
    if (!serveProcess) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: `No serve process for user ${AGENT_USER}` }));
      return;
    }

    console.log(`[RegionDaemon] Stopping opencode serve for ${AGENT_USER}`);

    serveProcess.process.kill();
    this.serveProcesses.delete(AGENT_USER);

    res.writeHead(200);
    res.end(
      JSON.stringify({
        success: true,
        user: AGENT_USER,
      })
    );
  }

  private async readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  private proxyRequest(targetUrl: string, req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url!, `http://localhost:${DAEMON_PORT}`);
    const proxyReq = http.request(
      targetUrl + url.pathname + url.search,
      {
        method: req.method,
        headers: req.headers,
      },
      proxyRes => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', error => {
      console.error('[RegionDaemon] Proxy error:', error);
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'Proxy error' }));
    });

    req.pipe(proxyReq);
  }
}

if (require.main === module) {
  const daemon = new RegionDaemon();
  daemon.start().catch(console.error);
}
