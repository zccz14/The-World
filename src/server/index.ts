#!/usr/bin/env node

import { TheWorldServer } from './TheWorldServer';
import { Config } from '../utils/config';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

async function main() {
  const validation = Config.validate();
  if (!validation.valid) {
    logger.error(`Missing environment variables: ${validation.missing.join(', ')}`);
    process.exit(1);
  }

  const server = new TheWorldServer();
  await server.initialize();

  const port = Config.SERVER_PORT || 3344;
  server.start(port);

  const pidFile = path.join(process.env.HOME || '/tmp', '.the-world', 'server.pid');
  fs.mkdirSync(path.dirname(pidFile), { recursive: true });
  fs.writeFileSync(pidFile, process.pid.toString());

  logger.info(`Server PID: ${process.pid}`);
  logger.info(`PID file: ${pidFile}`);

  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down...');
    server.stop();
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down...');
    server.stop();
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error({ error }, 'Failed to start server');
  process.exit(1);
});
