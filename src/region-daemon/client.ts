import * as net from 'net';

export class DaemonClient {
  constructor(
    private socketPath: string,
    private timeout: number = 30000
  ) {}

  async execute(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = net.createConnection(this.socketPath, () => {
        client.write(command);
      });

      let data = '';
      client.on('data', chunk => {
        data += chunk;
      });

      client.on('end', () => {
        resolve(data);
      });

      client.on('error', reject);

      client.setTimeout(this.timeout, () => {
        client.destroy();
        reject(new Error('Timeout'));
      });
    });
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: client.js <username> <command>');
    process.exit(1);
  }

  const [username, command] = args;
  const socketPath = `/var/run/agent/${username}.sock`;
  const client = new DaemonClient(socketPath);

  client.execute(command).then(console.log).catch(console.error);
}
