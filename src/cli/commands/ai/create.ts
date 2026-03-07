import { Command, Flags } from '@oclif/core';
import { APIClient } from '../../utils/apiClient';

export default class AICreate extends Command {
  static description = '创建 AI 用户';

  static flags = {
    name: Flags.string({ char: 'n', description: 'AI 名称', required: true }),
  };

  async run() {
    const { flags } = await this.parse(AICreate);
    const client = new APIClient();

    if (!(await client.isServerRunning())) {
      this.error('TheWorld 服务器未运行，请先执行 dio start');
    }

    this.log(`🤖 创建 AI: ${flags.name}`);

    try {
      const result = await client.createAI(flags.name);
      this.log(`✅ AI ${flags.name} 已创建`);
      this.log(`   Dummy Key: ${result.dummyKey}`);
    } catch (error: any) {
      this.error(`创建 AI 失败: ${error.response?.data?.error || error.message}`);
    }
  }
}
