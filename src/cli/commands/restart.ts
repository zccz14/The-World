import { Command } from '@oclif/core';
import { APIClient } from '../utils/apiClient';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export default class Restart extends Command {
  static description = '快速重启 TheWorld 服务器';

  async run() {
    const client = new APIClient();
    const serverPath = path.join(__dirname, '../../server/index.js');
    const worldDir = path.join(process.env.HOME || '/tmp', '.the-world');
    const pidFile = path.join(worldDir, 'server.pid');
    const logFile = path.join(worldDir, 'server.log');

    if (await client.isServerRunning()) {
      this.log('🛑 停止 TheWorld 服务器...');

      if (!fs.existsSync(pidFile)) {
        this.error('找不到 PID 文件，无法执行重启');
      }

      const pid = parseInt(fs.readFileSync(pidFile, 'utf-8'), 10);

      try {
        process.kill(pid, 'SIGTERM');
      } catch (error) {
        this.error(`停止服务器失败: ${error}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      this.log('ℹ️ TheWorld 服务器未运行，直接启动');
    }

    this.log('🚀 启动 TheWorld 服务器...');

    if (!fs.existsSync(serverPath)) {
      this.error('服务器文件不存在，请先运行 npm run build');
    }

    if (!fs.existsSync(worldDir)) {
      fs.mkdirSync(worldDir, { recursive: true });
    }

    const logFd = fs.openSync(logFile, 'a');

    const server = spawn('node', [serverPath], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: process.env,
    });

    server.unref();

    await new Promise(resolve => setTimeout(resolve, 2000));

    if (fs.existsSync(pidFile)) {
      this.log('✅ TheWorld 服务器已重启');
      this.log(`   PID: ${fs.readFileSync(pidFile, 'utf-8')}`);
      this.log('   Server: http://localhost:3344');
      this.log('   AI Proxy: http://localhost:3344/v1');
      this.log(`   日志文件: ${logFile}`);
    } else {
      this.error(`❌ 启动失败，请检查日志: ${logFile}`);
    }
  }
}
