import { Command, Flags } from '@oclif/core';
import { APIClient } from '../../utils/apiClient';

export default class RegionCreate extends Command {
  static description = '创建 Region';

  static flags = {
    name: Flags.string({ char: 'n', description: 'Region 名称', required: true }),
  };

  async run() {
    const { flags } = await this.parse(RegionCreate);
    const client = new APIClient();

    if (!(await client.isServerRunning())) {
      this.error('TheWorld 服务器未运行，请先执行 dio start');
    }

    this.log(`🔨 创建 Region: ${flags.name}`);

    try {
      await client.createRegion(flags.name);
      this.log(`✅ Region ${flags.name} 已创建`);
    } catch (error: any) {
      this.error(`创建 Region 失败: ${error.response?.data?.error || error.message}`);
    }
  }
}
