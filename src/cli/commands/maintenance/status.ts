import { Command, Flags } from '@oclif/core';
import { APIClient } from '../../utils/apiClient';

export default class MaintenanceStatus extends Command {
  static description = '查看特权维护 ticket';

  static flags = {
    id: Flags.string({ char: 'i', description: 'ticket ID（不传则列出最近 ticket）' }),
    status: Flags.string({
      char: 's',
      description: '过滤状态',
      options: ['requested', 'approved', 'rejected', 'done', 'failed'],
    }),
    limit: Flags.integer({ char: 'n', description: '列表条数', default: 20 }),
  };

  async run() {
    const { flags } = await this.parse(MaintenanceStatus);
    const client = new APIClient();

    try {
      if (flags.id) {
        const ticket = await client.getMaintenanceTicket(flags.id);
        this.log(JSON.stringify(ticket, null, 2));
        return;
      }

      const tickets = await client.listMaintenanceTickets(flags.status);
      for (const ticket of tickets.slice(0, flags.limit)) {
        this.log(`${ticket.id}  ${ticket.status}  ${ticket.region}  ${ticket.action}`);
      }
    } catch (error: any) {
      this.error(`查询失败: ${error.response?.data?.error || error.message}`);
    }
  }
}
