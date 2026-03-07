import { Command, Flags } from '@oclif/core';
import { APIClient } from '../../utils/apiClient';

export default class OracleSend extends Command {
  static description = '向 AI 发送神谕消息';

  static flags = {
    to: Flags.string({ char: 't', description: '目标 AI 名称', required: true }),
    message: Flags.string({ char: 'm', description: '神谕内容', required: true }),
    region: Flags.string({ char: 'r', description: 'Region 名称', default: 'region-a' }),
  };

  async run() {
    const { flags } = await this.parse(OracleSend);
    const client = new APIClient();

    if (!(await client.isServerRunning())) {
      this.error('TheWorld 服务器未运行，请先执行 dio start');
    }

    this.log(`📨 发送神谕给 ${flags.to}...`);

    try {
      await client.sendOracle(flags.to, flags.region, flags.message);
      this.log(`✅ 神谕已发送给 ${flags.to}`);
    } catch (error: any) {
      this.error(`发送神谕失败: ${error.response?.data?.error || error.message}`);
    }
  }
}
