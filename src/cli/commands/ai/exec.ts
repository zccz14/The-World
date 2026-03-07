import { Command, Flags } from '@oclif/core';
import { APIClient } from '../../utils/apiClient';

export default class AIExec extends Command {
  static description = '在 AI 上执行命令';

  static flags = {
    ai: Flags.string({ char: 'a', description: 'AI 名称', required: true }),
    region: Flags.string({ char: 'r', description: 'Region 名称', default: 'region-a' }),
    cmd: Flags.string({ char: 'c', description: '要执行的命令', required: true }),
  };

  async run() {
    const { flags } = await this.parse(AIExec);
    const client = new APIClient();

    if (!(await client.isServerRunning())) {
      this.error('TheWorld 服务器未运行，请先执行 dio start');
    }

    try {
      const result = await client.execCommand(flags.ai, flags.region, flags.cmd);
      this.log(result);
    } catch (error: any) {
      this.error(`执行命令失败: ${error.response?.data?.error || error.message}`);
    }
  }
}
