import { Command, Flags } from '@oclif/core';
import { APIClient } from '../../utils/apiClient';

export default class AISpeak extends Command {
  static description = '向 AI 发送消息（统一 speak 接口）';

  static flags = {
    to: Flags.string({ char: 't', description: '目标 AI 名称', required: true }),
    message: Flags.string({ char: 'm', description: '消息内容', required: true }),
    region: Flags.string({ char: 'r', description: 'Region 名称', default: 'region-a' }),
  };

  async run() {
    const { flags } = await this.parse(AISpeak);
    const client = new APIClient();

    if (!(await client.isServerRunning())) {
      this.error('TheWorld 服务器未运行，请先执行 dio start');
    }

    try {
      const result = await client.speakToAI({
        to: flags.to,
        region: flags.region,
        message: flags.message,
        fromType: 'human',
        fromId: 'dio-ai-speak',
      });

      this.log(`✅ 已向 ${flags.to} 发送消息`);
      if (result.response?.response) {
        this.log('\n🤖 AI 回复:');
        this.log(result.response.response);
      }
    } catch (error: any) {
      this.error(`发送消息失败: ${error.response?.data?.error || error.message}`);
    }
  }
}
