import { Command } from '@oclif/core';
import { APIClient } from '../utils/apiClient';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export default class Start extends Command {
  static description = '启动 TheWorld 服务器';

  async run() {
    const client = new APIClient();

    if (await client.isServerRunning()) {
      this.log('✅ TheWorld 服务器已经在运行');
      return;
    }

    this.log('🚀 启动 TheWorld 服务器...');

    const serverPath = path.join(__dirname, '../../server/index.js');
    const pidFile = path.join(process.env.HOME || '/tmp', '.the-world', 'server.pid');
    
    if (!fs.existsSync(serverPath)) {
      this.error('服务器文件不存在，请先运行 npm run build');
    }

    const server = spawn('node', [serverPath], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });

    server.unref();

    await new Promise(resolve => setTimeout(resolve, 2000));

    if (fs.existsSync(pidFile)) {
      this.log('✅ TheWorld 服务器已启动');
      this.log(`   PID: ${fs.readFileSync(pidFile, 'utf-8')}`);
      this.log('   Server: http://localhost:3344');
      this.log('   AI Proxy: http://localhost:3344/v1');
    } else {
      this.error('❌ 启动失败，请检查日志');
    }
  }
}
