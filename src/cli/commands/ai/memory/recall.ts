import { Command, Flags } from '@oclif/core';
import { APIClient } from '../../../utils/apiClient';

export default class AIMemoryRecall extends Command {
  static description = '召回 AI 的跨 Region 记忆并输出到 stdout';

  static flags = {
    to: Flags.string({ char: 't', description: '目标 AI 名称', required: true }),
    query: Flags.string({ char: 'q', description: '记忆查询', required: true }),
  };

  async run() {
    const { flags } = await this.parse(AIMemoryRecall);
    const client = new APIClient();

    if (!(await client.isServerRunning())) {
      this.error('TheWorld 服务器未运行，请先执行 dio start');
    }

    try {
      const result = await client.recallMemory({
        to: flags.to,
        query: flags.query,
        fromType: 'human',
        fromId: 'dio-ai-memory-recall',
      });

      this.log(result.memory || '');
    } catch (error: any) {
      this.error(`召回记忆失败: ${error.response?.data?.error || error.message}`);
    }
  }
}
