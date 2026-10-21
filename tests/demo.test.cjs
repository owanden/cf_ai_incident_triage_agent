const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createInterface } = require('node:readline');
const path = require('node:path');

test('standalone fixture serves UI and shared API without a provider account', { timeout: 15000 }, async t => {
  const child = spawn(process.execPath, [path.resolve(__dirname, '../dist/demo/demo/server.js')], { env: { ...process.env, DEMO_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  const ready = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', () => reject(new Error('Demo exited before readiness')));
    lines.on('line', line => { try { const info = JSON.parse(line); if (info.type === 'demo_ready') resolve(info); } catch {} });
  });
  t.after(async () => { lines.close(); if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; } });
  const info = await ready;
  const base = `http://127.0.0.1:${info.port}`;
  const page = await (await fetch(base)).text();
  assert.match(page, /Fixture demo: predetermined responses/);
  for (const asset of ['/app.js', '/styles.css']) assert.equal((await fetch(base + asset)).status, 200);
  const chat = await fetch(base + '/api/chat', { method: 'POST', body: JSON.stringify({ incidentId: 'demo', message: 'synthetic timeout' }) });
  assert.equal(chat.status, 200);
  assert.match((await chat.json()).summary, /Fixture response/);
  const failed = await fetch(base + '/api/chat', { method: 'POST', body: JSON.stringify({ incidentId: 'demo', message: '[simulate-provider-error]' }) });
  assert.equal(failed.status, 502);
  const state = await (await fetch(base + '/api/state?incidentId=demo')).json();
  assert.equal(state.messages.length, 2);
  assert.equal((await fetch(base + '/missing')).status, 404);
});
