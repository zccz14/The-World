import { Command } from '@oclif/core';
import { APIClient } from '../utils/apiClient';

export default class Status extends Command {
  static description = '查看系统状态';

  async run() {
    const client = new APIClient();

    if (!(await client.isServerRunning())) {
      this.log('❌ TheWorld 服务器未运行');
      return;
    }

    try {
      const status = await client.getStatus();
      this.log('✅ TheWorld 服务器运行中');
      this.log(`   运行时间: ${Math.floor(status.uptime)}秒`);
      this.log(`   Region 数量: ${status.regions}`);
      this.log(`   AI 用户数量: ${status.aiIdentities}`);
    } catch (error) {
      this.error(`获取状态失败: ${error}`);
    }
  }
}
