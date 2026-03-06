import { Command } from '@oclif/core';
import { Config } from '../../utils/config';

export default class Status extends Command {
  static description = '查看系统状态';

  async run() {
    this.log('📊 TheWorld 系统状态\n');

    this.log(`EverMemOS URL: ${Config.EVERMEMOS_URL}`);
    this.log(`AI Proxy Port: ${Config.AI_PROXY_PORT}`);
    this.log(`Target API: ${Config.AI_TARGET_BASE_URL}`);

    try {
      const EverMemOSClient = require('../../memory/EverMemOSClient').EverMemOSClient;
      const client = new EverMemOSClient(Config.EVERMEMOS_URL);
      const healthy = await client.healthCheck();
      
      this.log(`EverMemOS 状态: ${healthy ? '✅ 健康' : '❌ 未连接'}`);
    } catch (error) {
      this.log('EverMemOS 状态: ❌ 未连接');
    }
  }
}
