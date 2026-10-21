const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createInterface } = require('node:readline');
const { randomUUID } = require('node:crypto');
const path = require('node:path');

test('local Durable Object transactions preserve overlapping initialization, turns and status', { timeout: 45000 }, async t => {
  const child = spawn(process.execPath, [
    path.resolve(__dirname, '../node_modules/wrangler/bin/wrangler.js'), 'dev',
    '--config', 'tests/wrangler.jsonc', '--local', '--ip', '127.0.0.1', '--port', '0', '--inspector-port', '0',
  ], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  let errors = '';
  child.stderr.on('data', data => { errors = (errors + data).slice(-4000); });
  const ready = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', () => reject(new Error('Local Worker exited before readiness: ' + errors)));
    lines.on('line', line => {
      const match = line.match(/Ready on (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) resolve(match[1]);
    });
  });
  t.after(async () => {
    lines.close();
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill(); await exited;
    }
  });
  const base = await ready;
  const id = randomUUID();
  const url = base + '/?id=' + id;
  const changes = Array.from({ length: 12 }, (_, i) => fetch(url, i % 3 === 0 ? undefined : {
    method: 'POST', body: JSON.stringify({ message: 'evidence-' + i }),
  }));
  changes.push(fetch(url, { method: 'POST', body: JSON.stringify({ status: 'resolved' }) }));
  for (const response of await Promise.all(changes)) assert.equal(response.status, 200);
  const state = await (await fetch(url)).json();
  assert.equal(state.status, 'resolved');
  assert.equal(state.messages.length, 16);
  assert.deepEqual(state.messages.filter(m => m.role === 'user').map(m => m.content).sort(),
    Array.from({ length: 12 }, (_, i) => i).filter(i => i % 3 !== 0).map(i => 'evidence-' + i).sort());
  assert.equal(state.latestEvidence.length, 5);
  const other = await (await fetch(base + '/?id=' + randomUUID())).json();
  assert.equal(other.messages.length, 0);
  assert.equal(other.status, 'open');
});
