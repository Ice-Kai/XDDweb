const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

process.env.NODE_ENV ||= 'production';
process.env.HOST ||= '127.0.0.1';
process.env.PORT ||= '4321';
process.env.AI_WORKER_SECRET ||= process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

let workerBusy = false;
async function runAiTaskWorker() {
  if (workerBusy) return;
  workerBusy = true;
  try {
    const response = await fetch(`http://127.0.0.1:${process.env.PORT}/api/internal/ai-task-worker`, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.AI_WORKER_SECRET}` },
    });
    if (!response.ok) console.error('[ai-worker] sweep failed', response.status, await response.text());
  } catch (error) {
    console.error('[ai-worker] sweep request failed', error instanceof Error ? error.message : error);
  } finally {
    workerBusy = false;
  }
}

import('./dist/server/entry.mjs').then(() => {
  setTimeout(runAiTaskWorker, 5000);
  setInterval(runAiTaskWorker, 20_000);
});
