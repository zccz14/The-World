import { Command, Flags } from '@oclif/core';
import { APIClient } from '../../utils/apiClient';

export default class MaintenanceApprove extends Command {
  static description = '批准特权维护 ticket';

  static flags = {
    id: Flags.string({ char: 'i', description: 'ticket ID', required: true }),
  };

  async run() {
    const { flags } = await this.parse(MaintenanceApprove);
    const client = new APIClient();

    try {
      const ticket = await client.approveMaintenanceTicket(flags.id);
      this.log(`✅ 已批准: ${ticket.id}`);
      this.log(`   status: ${ticket.status}`);
    } catch (error: any) {
      this.error(`批准失败: ${error.response?.data?.error || error.message}`);
    }
  }
}
