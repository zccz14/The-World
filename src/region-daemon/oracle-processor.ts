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

async function callOpenCode(aiName: string, message: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(
      `su - ${aiName} -c 'cd && PATH=/usr/local/bin:$PATH opencode run "${message.replace(/"/g, '\\"')}" --format json'`,
      {
        timeout: 120000,
        maxBuffer: 1024 * 1024,
        cwd: `/home/${aiName}`,
        env: { ...process.env, HOME: `/home/${aiName}`, PATH: '/usr/local/bin:/usr/bin:/bin' },
      }
    );

    const fullOutput = stdout + stderr;
    const lines = fullOutput.split('\n').filter((line: string) => line.trim());

    let responseText = '';
    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.type === 'text' && json.part?.text) {
          responseText += json.part.text;
        }
      } catch (e) {
        // Not JSON, skip
      }
    }

    if (responseText) {
      console.log(`[oracle-processor] AI response: ${responseText.substring(0, 100)}...`);
      return responseText;
    }

    // Fallback to raw output if no text found
    console.log(`[oracle-processor] No text in JSON, returning raw output`);
    return fullOutput.substring(0, 500);
  } catch (error: any) {
    console.error(`[oracle-processor] opencode error:`, error.message);
    console.error(`[oracle-processor] error code:`, error.code);
    console.error(`[oracle-processor] error.killed:`, error.killed);
    console.error(`[oracle-processor] stdout length:`, error.stdout?.length);
    console.error(`[oracle-processor] stderr length:`, error.stderr?.length);

    if (error.stdout) {
      console.error(`[oracle-processor] stdout preview:`, error.stdout.substring(0, 200));
    }
    if (error.stderr) {
      console.error(`[oracle-processor] stderr preview:`, error.stderr.substring(0, 200));
    }

    // Try to parse stdout/stderr even if command failed
    const fullOutput = (error.stdout || '') + (error.stderr || '');
    const lines = fullOutput.split('\n').filter((line: string) => line.trim());

    let responseText = '';
    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.type === 'text' && json.part?.text) {
          responseText += json.part.text;
        }
      } catch (e) {
        // Not JSON, skip
      }
    }

    if (responseText) {
      console.log(
        `[oracle-processor] AI response (from error): ${responseText.substring(0, 100)}...`
      );
      return responseText;
    }

    return error.message;
  }
}

async function processOracleMessage(messageFile: string) {
  const filePath = path.join(INBOX_DIR, messageFile);
  const content = fs.readFileSync(filePath, 'utf-8');
  const oracle = JSON.parse(content);

  console.log(`[oracle-processor] Processing message for ${oracle.to}`);
  console.log(`[oracle-processor] From: ${oracle.from}`);
  console.log(`[oracle-processor] Content: ${oracle.content}`);

  console.log(`[oracle-processor] Calling opencode for ${oracle.to}...`);
  const aiResponse = await callOpenCode(oracle.to, oracle.content);
  console.log(`[oracle-processor] AI response: ${aiResponse.substring(0, 100)}...`);

  const timestamp = oracle.timestamp || Date.now();

  const response = {
    to: oracle.from,
    from: oracle.to,
    originalContent: oracle.content,
    response: aiResponse,
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
      const files = fs
        .readdirSync(INBOX_DIR)
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
