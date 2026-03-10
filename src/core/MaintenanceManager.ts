import fs from 'fs';
import path from 'path';
import { DockerManager } from './DockerManager';
import { logger } from '../utils/logger';

export type MaintenanceAction = 'apt_update' | 'install_packages';
export type MaintenanceStatus = 'requested' | 'approved' | 'rejected' | 'done' | 'failed';

export interface MaintenanceTicket {
  id: string;
  region: string;
  action: MaintenanceAction;
  params: Record<string, unknown>;
  reason: string;
  status: MaintenanceStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  result?: {
    command: string[];
    stdout: string;
    stderr: string;
    exitCode: number;
    executedAt: number;
  };
  rejectionReason?: string;
}

interface TicketDb {
  tickets: MaintenanceTicket[];
}

export interface MaintenanceExecutor {
  execute(
    region: string,
    action: MaintenanceAction,
    params: Record<string, unknown>
  ): Promise<{ command: string[]; stdout: string; stderr: string; exitCode: number }>;
}

export class DockerMaintenanceExecutor implements MaintenanceExecutor {
  constructor(private dockerManager = new DockerManager()) {}

  async execute(region: string, action: MaintenanceAction, params: Record<string, unknown>) {
    let command: string[];

    if (action === 'apt_update') {
      command = ['/usr/local/bin/tw-maint', 'apt_update'];
    } else {
      const packages = params.packages as string[];
      command = ['/usr/local/bin/tw-maint', 'install_packages', ...packages];
    }

    const result = await this.dockerManager.execInContainer(
      region,
      command,
      'root',
      10 * 60 * 1000
    );
    return {
      command,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }
}

export class MaintenanceManager {
  private dbFile: string;

  constructor(
    dataDir: string,
    private executor: MaintenanceExecutor = new DockerMaintenanceExecutor()
  ) {
    const maintenanceDir = path.join(dataDir, 'maintenance');
    fs.mkdirSync(maintenanceDir, { recursive: true });
    this.dbFile = path.join(maintenanceDir, 'tickets.json');
    if (!fs.existsSync(this.dbFile)) {
      this.writeDb({ tickets: [] });
    }
  }

  createTicket(input: {
    region: string;
    action: MaintenanceAction;
    params?: Record<string, unknown>;
    reason: string;
    expiresInSeconds?: number;
  }): MaintenanceTicket {
    const now = Date.now();
    const expiresInMs = Math.max(60, input.expiresInSeconds || 3600) * 1000;
    const params = this.validateAndNormalizeParams(input.action, input.params || {});

    const ticket: MaintenanceTicket = {
      id: `mt-${now}-${Math.random().toString(36).slice(2, 8)}`,
      region: input.region,
      action: input.action,
      params,
      reason: input.reason,
      status: 'requested',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + expiresInMs,
    };

    const db = this.readDb();
    db.tickets.push(ticket);
    this.writeDb(db);

    logger.info({ ticketId: ticket.id, action: ticket.action }, 'Maintenance ticket requested');
    return ticket;
  }

  listTickets(status?: MaintenanceStatus): MaintenanceTicket[] {
    const db = this.readDb();
    const tickets = status ? db.tickets.filter(ticket => ticket.status === status) : db.tickets;
    return [...tickets].sort((a, b) => b.createdAt - a.createdAt);
  }

  getTicket(ticketId: string): MaintenanceTicket {
    const db = this.readDb();
    const ticket = db.tickets.find(item => item.id === ticketId);
    if (!ticket) {
      throw new Error(`Ticket not found: ${ticketId}`);
    }

    return ticket;
  }

  approveTicket(ticketId: string): MaintenanceTicket {
    return this.updateTicket(ticketId, ticket => {
      this.assertNotExpired(ticket);
      if (ticket.status !== 'requested') {
        throw new Error(`Only requested tickets can be approved, current status: ${ticket.status}`);
      }
      ticket.status = 'approved';
      ticket.updatedAt = Date.now();
      return ticket;
    });
  }

  rejectTicket(ticketId: string, rejectionReason?: string): MaintenanceTicket {
    return this.updateTicket(ticketId, ticket => {
      if (ticket.status !== 'requested' && ticket.status !== 'approved') {
        throw new Error(
          `Only requested/approved tickets can be rejected, current status: ${ticket.status}`
        );
      }
      ticket.status = 'rejected';
      ticket.rejectionReason = rejectionReason;
      ticket.updatedAt = Date.now();
      return ticket;
    });
  }

  async runTicket(ticketId: string): Promise<MaintenanceTicket> {
    const ticket = this.getTicket(ticketId);
    this.assertNotExpired(ticket);
    if (ticket.status !== 'approved') {
      throw new Error(`Only approved tickets can run, current status: ${ticket.status}`);
    }

    try {
      const result = await this.executor.execute(ticket.region, ticket.action, ticket.params);
      if (result.exitCode !== 0) {
        return this.updateTicket(ticketId, current => {
          current.status = 'failed';
          current.updatedAt = Date.now();
          current.result = {
            command: result.command,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            executedAt: Date.now(),
          };
          return current;
        });
      }

      return this.updateTicket(ticketId, current => {
        current.status = 'done';
        current.updatedAt = Date.now();
        current.result = {
          command: result.command,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          executedAt: Date.now(),
        };
        return current;
      });
    } catch (error: any) {
      return this.updateTicket(ticketId, current => {
        current.status = 'failed';
        current.updatedAt = Date.now();
        current.result = {
          command: ['/usr/local/bin/tw-maint', current.action],
          stdout: '',
          stderr: error.message || String(error),
          exitCode: 1,
          executedAt: Date.now(),
        };
        return current;
      });
    }
  }

  private validateAndNormalizeParams(
    action: MaintenanceAction,
    params: Record<string, unknown>
  ): Record<string, unknown> {
    if (action === 'apt_update') {
      return {};
    }

    const rawPackages = params.packages;
    if (!Array.isArray(rawPackages) || rawPackages.length === 0) {
      throw new Error('install_packages requires non-empty params.packages array');
    }

    const packages = rawPackages.map(item => String(item).trim()).filter(Boolean);
    if (packages.length === 0) {
      throw new Error('install_packages requires at least one valid package name');
    }

    for (const pkg of packages) {
      if (!/^[a-z0-9][a-z0-9+.-]*$/i.test(pkg)) {
        throw new Error(`Invalid package name: ${pkg}`);
      }
    }

    return { packages };
  }

  private assertNotExpired(ticket: MaintenanceTicket) {
    if (Date.now() > ticket.expiresAt) {
      throw new Error(`Ticket expired: ${ticket.id}`);
    }
  }

  private updateTicket(
    ticketId: string,
    updater: (ticket: MaintenanceTicket) => MaintenanceTicket
  ): MaintenanceTicket {
    const db = this.readDb();
    const index = db.tickets.findIndex(ticket => ticket.id === ticketId);
    if (index < 0) {
      throw new Error(`Ticket not found: ${ticketId}`);
    }
    const updated = updater(db.tickets[index]);
    db.tickets[index] = updated;
    this.writeDb(db);
    return updated;
  }

  private readDb(): TicketDb {
    const raw = fs.readFileSync(this.dbFile, 'utf-8');
    const parsed = JSON.parse(raw) as TicketDb;
    if (!Array.isArray(parsed.tickets)) {
      throw new Error('Maintenance ticket DB is corrupted');
    }
    return parsed;
  }

  private writeDb(data: TicketDb) {
    fs.writeFileSync(this.dbFile, JSON.stringify(data, null, 2), 'utf-8');
  }
}
