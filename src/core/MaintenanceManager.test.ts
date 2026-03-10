/// <reference types="jest" />

import fs from 'fs';
import os from 'os';
import path from 'path';
import { MaintenanceExecutor, MaintenanceManager } from './MaintenanceManager';

class FakeExecutor implements MaintenanceExecutor {
  async execute() {
    return {
      command: ['/usr/local/bin/tw-maint', 'apt_update'],
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    };
  }
}

describe('MaintenanceManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-maint-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects invalid package names', () => {
    const manager = new MaintenanceManager(tmpDir, new FakeExecutor());

    expect(() =>
      manager.createTicket({
        region: 'region-a',
        action: 'install_packages',
        params: { packages: ['curl', 'bad/pkg'] },
        reason: 'test',
      })
    ).toThrow('Invalid package name');
  });

  it('runs approved ticket successfully', async () => {
    const manager = new MaintenanceManager(tmpDir, new FakeExecutor());

    const ticket = manager.createTicket({
      region: 'region-a',
      action: 'apt_update',
      reason: 'refresh apt index',
    });
    manager.approveTicket(ticket.id);
    const finished = await manager.runTicket(ticket.id);

    expect(finished.status).toBe('done');
    expect(finished.result?.exitCode).toBe(0);
  });

  it('blocks running requested ticket', async () => {
    const manager = new MaintenanceManager(tmpDir, new FakeExecutor());

    const ticket = manager.createTicket({
      region: 'region-a',
      action: 'apt_update',
      reason: 'refresh apt index',
    });

    await expect(manager.runTicket(ticket.id)).rejects.toThrow('Only approved tickets can run');
  });

  it('blocks expired ticket approval', () => {
    const manager = new MaintenanceManager(tmpDir, new FakeExecutor());

    const ticket = manager.createTicket({
      region: 'region-a',
      action: 'apt_update',
      reason: 'refresh apt index',
      expiresInSeconds: 1,
    });

    const dbPath = path.join(tmpDir, 'maintenance', 'tickets.json');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    db.tickets[0].expiresAt = Date.now() - 10;
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');

    expect(() => manager.approveTicket(ticket.id)).toThrow('Ticket expired');
  });
});
