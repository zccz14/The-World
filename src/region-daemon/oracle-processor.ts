#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const INBOX_DIR = '/world/inbox';
const OUTBOX_DIR = '/world/outbox';
const PROCESSED_DIR = '/world/inbox/processed';

async function ensureDirectories() {
  [INBOX_DIR, OUTBOX_DIR, PROCESSED_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

async function processOracleMessage(messageFile: string) {
  const filePath = path.join(INBOX_DIR, messageFile);
  const content = fs.readFileSync(filePath, 'utf-8');
  const oracle = JSON.parse(content);

  console.log(`[oracle-processor] Processing message for ${oracle.to}`);
  console.log(`[oracle-processor] From: ${oracle.from}`);
  console.log(`[oracle-processor] Content: ${oracle.content}`);

  const timestamp = oracle.timestamp || Date.now();
  
  const response = {
    to: oracle.from,
    from: oracle.to,
    originalContent: oracle.content,
    response: `你好！我是 ${oracle.to}。我收到了你的消息："${oracle.content}"。`,
    timestamp,
  };

  const responseFile = `response-${timestamp}.msg`;
  const responsePath = path.join(OUTBOX_DIR, responseFile);
  
  fs.writeFileSync(responsePath, JSON.stringify(response, null, 2));
  console.log(`[oracle-processor] Response written to ${responseFile}`);

  const processedPath = path.join(PROCESSED_DIR, messageFile);
  fs.renameSync(filePath, processedPath);
  console.log(`[oracle-processor] Message moved to processed`);
}

async function watchInbox() {
  await ensureDirectories();
  
  console.log('[oracle-processor] Watching inbox for messages...');

  const processedFiles = new Set<string>();

  setInterval(() => {
    try {
      const files = fs.readdirSync(INBOX_DIR)
        .filter(f => f.startsWith('oracle-') && f.endsWith('.msg'));

      files.forEach(file => {
        if (!processedFiles.has(file)) {
          processedFiles.add(file);
          processOracleMessage(file).catch(err => {
            console.error(`[oracle-processor] Error processing ${file}:`, err);
          });
        }
      });
    } catch (error) {
      console.error('[oracle-processor] Error scanning inbox:', error);
    }
  }, 2000);
}

if (require.main === module) {
  watchInbox();
}
