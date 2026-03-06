import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const logger = {
  info: (...args: any[]) => console.log('[daemon]', ...args),
  error: (...args: any[]) => console.error('[daemon]', ...args),
};

export class SocketDaemon {
  private socketDir = '/var/run/agent';

  async start(users: string[]) {
    logger.info(`Starting socket daemon for users: ${users.join(', ')}`);

    if (!fs.existsSync(this.socketDir)) {
      fs.mkdirSync(this.socketDir, { recursive: true });
    }

    for (const user of users) {
      await this.createUserSocket(user);
    }

    logger.info('Socket daemon started');
  }

  private async createUserSocket(username: string) {
    const socketPath = path.join(this.socketDir, `${username}.sock`);
    
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }

    const server = net.createServer((conn) => {
      this.handleConnection(conn, username);
    });

    return new Promise<void>((resolve) => {
      server.listen(socketPath, () => {
        fs.chmodSync(socketPath, 0o600);
        logger.info(`Socket created: ${socketPath}`);
        resolve();
      });
    });
  }

  private async handleConnection(conn: net.Socket, username: string) {
    let data = '';
    
    conn.on('data', async (chunk) => {
      data += chunk.toString();
    });

    conn.on('end', async () => {
      const cmd = data.trim();
      if (!cmd) {
        conn.end();
        return;
      }

      try {
        const { stdout, stderr } = await execAsync(`su - ${username} -c "${cmd}"`, {
          timeout: 30000,
        });
        conn.write(stdout + stderr);
      } catch (error: any) {
        conn.write(`Error: ${error.message}`);
      }
      
      conn.end();
    });

    conn.on('error', (err) => {
      logger.error(`Connection error for ${username}:`, err.message);
    });
  }
}

if (require.main === module) {
  const users = process.env.AI_USERS ? process.env.AI_USERS.split(',') : ['alpha', 'beta', 'gamma'];
  const daemon = new SocketDaemon();
  daemon.start(users).catch(console.error);
}
