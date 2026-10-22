const { test } = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const vm = require('node:vm');

async function preview() {
  const result = await build({ entryPoints: ['preview/api.ts'], bundle: true, platform: 'browser', format: 'cjs', write: false });
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, {
    module, exports: module.exports, URL, Request, Response, structuredClone,
    fetch() { throw new Error('Network is forbidden'); },
  });
  return module.exports.createPreview();
}
const json = async response => (await response).json();
const post = (request, path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });

test('browser preview uses shared validation, isolated memory and fixed responses without network', async () => {
  const request = await preview();
  assert.equal((await post(request, '/api/chat', { incidentId: 'one', message: '' })).status, 400);
  const result = await json(post(request, '/api/chat', { incidentId: 'one', message: 'synthetic timeout' }));
  assert.match(result.summary, /Fixture response/);
  await post(request, '/api/state', { incidentId: 'one', status: 'resolved' });
  const saved = await json(request('/api/state?incidentId=one'));
  assert.equal(saved.messages.length, 2);
  assert.equal(saved.status, 'resolved');
  assert.equal((await json(request('/api/state?incidentId=two'))).messages.length, 0);
  const failed = await post(request, '/api/chat', { incidentId: 'one', message: '[simulate-provider-error]' });
  assert.equal(failed.status, 502);
  assert.equal((await failed.json()).error, 'triage_unavailable');
  assert.deepEqual(await json(request('/api/state?incidentId=one')), saved);
  assert.equal((await request('https://example.com/api/state')).status, 404);
  assert.equal((await request('/outside')).status, 404);
  const fresh = await preview();
  assert.equal((await json(fresh('/api/state?incidentId=one'))).messages.length, 0);
});
