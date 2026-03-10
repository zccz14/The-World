import { Command, Flags } from '@oclif/core';
import { APIClient } from '../../utils/apiClient';

export default class MaintenanceReject extends Command {
  static description = '拒绝特权维护 ticket';

  static flags = {
    id: Flags.string({ char: 'i', description: 'ticket ID', required: true }),
    reason: Flags.string({ char: 'm', description: '拒绝原因' }),
  };

  async run() {
    const { flags } = await this.parse(MaintenanceReject);
    const client = new APIClient();

    try {
      const ticket = await client.rejectMaintenanceTicket(flags.id, flags.reason);
      this.log(`✅ 已拒绝: ${ticket.id}`);
      this.log(`   status: ${ticket.status}`);
    } catch (error: any) {
      this.error(`拒绝失败: ${error.response?.data?.error || error.message}`);
    }
  }
}
