import { Command, Flags } from '@oclif/core';
import { APIClient } from '../../utils/apiClient';

export default class MaintenanceRun extends Command {
  static description = '执行已批准的特权维护 ticket';

  static flags = {
    id: Flags.string({ char: 'i', description: 'ticket ID', required: true }),
  };

  async run() {
    const { flags } = await this.parse(MaintenanceRun);
    const client = new APIClient();

    try {
      const ticket = await client.runMaintenanceTicket(flags.id);
      this.log(`✅ 已执行: ${ticket.id}`);
      this.log(`   status: ${ticket.status}`);
      if (ticket.result) {
        this.log(`   exitCode: ${ticket.result.exitCode}`);
      }
    } catch (error: any) {
      this.error(`执行失败: ${error.response?.data?.error || error.message}`);
    }
  }
}
