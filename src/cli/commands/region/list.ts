import { Command } from '@oclif/core';
import { APIClient } from '../../utils/apiClient';

export default class RegionList extends Command {
  static description = '列出所有 Region';

  async run() {
    const client = new APIClient();

    if (!(await client.isServerRunning())) {
      this.error('TheWorld 服务器未运行，请先执行 dio start');
    }

    try {
      const regions = await client.listRegions();

      if (regions.length === 0) {
        this.log('暂无 Region');
        return;
      }

      this.log('Region 列表:');
      regions.forEach((region: string) => {
        this.log(`  - ${region}`);
      });
    } catch (error: any) {
      this.error(`列出 Region 失败: ${error.response?.data?.error || error.message}`);
    }
  }
}
