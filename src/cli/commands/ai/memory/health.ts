import { Command } from '@oclif/core';
import { APIClient } from '../../../utils/apiClient';

export default class AIMemoryHealth extends Command {
  static description = '查看记忆流水线健康状态';

  async run() {
    const client = new APIClient();

    if (!(await client.isServerRunning())) {
      this.error('TheWorld 服务器未运行，请先执行 dio start');
    }

    try {
      const result = await client.getMemoryHealth();
      this.log(JSON.stringify(result, null, 2));
    } catch (error: any) {
      this.error(`获取记忆健康状态失败: ${error.response?.data?.error || error.message}`);
    }
  }
}
