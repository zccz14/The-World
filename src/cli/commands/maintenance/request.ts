import { Command, Flags } from '@oclif/core';
import { APIClient } from '../../utils/apiClient';

export default class MaintenanceRequest extends Command {
  static description = '申请特权维护 ticket';

  static flags = {
    region: Flags.string({ char: 'r', description: 'Region 名称', required: true }),
    action: Flags.string({
      char: 'a',
      description: '维护动作 (apt_update | install_packages)',
      required: true,
      options: ['apt_update', 'install_packages'],
    }),
    packages: Flags.string({
      char: 'p',
      description: '包列表（仅 install_packages，逗号分隔）',
    }),
    reason: Flags.string({ char: 'm', description: '申请原因', required: true }),
    expires: Flags.integer({ char: 'e', description: '过期秒数', default: 3600 }),
  };

  async run() {
    const { flags } = await this.parse(MaintenanceRequest);
    const client = new APIClient();

    const params: Record<string, unknown> = {};
    if (flags.action === 'install_packages') {
      const packages = (flags.packages || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
      if (packages.length === 0) {
        this.error('install_packages 需要 --packages 参数');
      }
      params.packages = packages;
    }

    try {
      const ticket = await client.requestMaintenanceTicket({
        region: flags.region,
        action: flags.action as 'apt_update' | 'install_packages',
        params,
        reason: flags.reason,
        expiresInSeconds: flags.expires,
      });

      this.log(`✅ ticket 已创建: ${ticket.id}`);
      this.log(`   status: ${ticket.status}`);
      this.log(`   action: ${ticket.action}`);
      this.log(`   region: ${ticket.region}`);
    } catch (error: any) {
      this.error(`创建 ticket 失败: ${error.response?.data?.error || error.message}`);
    }
  }
}
