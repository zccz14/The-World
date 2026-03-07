import { Command } from '@oclif/core';
import { APIClient } from '../utils/apiClient';
import fs from 'fs';
import path from 'path';

export default class Stop extends Command {
  static description = '停止 TheWorld 服务器';

  async run() {
    const client = new APIClient();

    if (!(await client.isServerRunning())) {
      this.log('TheWorld 服务器未运行');
      return;
    }

    const pidFile = path.join(process.env.HOME || '/tmp', '.the-world', 'server.pid');

    if (!fs.existsSync(pidFile)) {
      this.error('找不到 PID 文件');
    }

    const pid = parseInt(fs.readFileSync(pidFile, 'utf-8'), 10);

    try {
      process.kill(pid, 'SIGTERM');
      this.log('✅ TheWorld 服务器已停止');
    } catch (error) {
      this.error(`停止服务器失败: ${error}`);
    }
  }
}
