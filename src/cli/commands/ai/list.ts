import { Command, Flags } from '@oclif/core';
import { APIClient } from '../../utils/apiClient';

export default class AIList extends Command {
  static description = '列出 Region 内的所有 AI';

  static flags = {
    region: Flags.string({ char: 'r', description: 'Region 名称', default: 'region-a' }),
  };

  async run() {
    const { flags } = await this.parse(AIList);
    const client = new APIClient();

    if (!(await client.isServerRunning())) {
      this.error('TheWorld 服务器未运行，请先执行 dio start');
    }

    try {
      const aiList = await client.listAI(flags.region);

      if (aiList.length === 0) {
        this.log(`Region ${flags.region} 暂无 AI`);
        return;
      }

      this.log(`Region ${flags.region} 的 AI 列表:`);
      aiList.forEach((ai: string) => {
        this.log(`  - ${ai}`);
      });
    } catch (error: any) {
      this.error(`列出 AI 失败: ${error.response?.data?.error || error.message}`);
    }
  }
}
