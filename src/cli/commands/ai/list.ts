import { Command, Flags } from '@oclif/core';
import { APIClient } from '../../utils/apiClient';

export default class AIList extends Command {
  static description = '列出所有 AI';

  async run() {
    const client = new APIClient();

    if (!(await client.isServerRunning())) {
      this.error('TheWorld 服务器未运行，请先执行 dio start');
    }

    try {
      const aiList = await client.listAI();

      if (aiList.length === 0) {
        this.log('暂无 AI');
        return;
      }

      this.log('AI 列表:');
      aiList.forEach((ai: string) => {
        this.log(`  - ${ai}`);
      });
    } catch (error: any) {
      this.error(`列出 AI 失败: ${error.response?.data?.error || error.message}`);
    }
  }
}
