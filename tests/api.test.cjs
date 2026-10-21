const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../dist/demo/src/api');
const { createInitialState } = require('../dist/demo/src/contracts');
const fixture = require('../demo/fixture.json');

function setup(generate = async () => fixture) {
  const states = new Map();
  let writes = 0, reads = 0, modelCalls = 0;
  const handler = createHandler(id => ({
    async getState() {
      reads++;
      if (!states.has(id)) states.set(id, createInitialState(id));
      return structuredClone(states.get(id));
    },
    async updateState(state) { writes++; states.set(id, structuredClone(state)); },
  }), async prompt => { modelCalls++; return generate(prompt); });
  const request = (route, body) => handler(new Request('http://local' + route, { method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) }));
  return { handler, request, states, counts: () => ({ reads, writes, modelCalls }) };
}

test('chat persists structured messages, summary and evidence under its incident', async () => {
  const app = setup();
  const response = await app.request('/api/chat', { incidentId: 'inc-1', message: 'synthetic timeout evidence' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), fixture);
  const state = await (await app.request('/api/state?incidentId=inc-1')).json();
  assert.equal(state.summary, fixture.summary);
  assert.deepEqual(state.hypotheses, fixture.possibleCauses);
  assert.deepEqual(state.messages.map(message => message.role), ['user', 'assistant']);
  assert.deepEqual(JSON.parse(state.messages[1].content), fixture);
  assert.deepEqual(state.latestEvidence, ['synthetic timeout evidence']);
  assert.equal(app.counts().writes, 1);
});

test('status changes preserve server-owned incident contents and reject extra fields', async () => {
  const app = setup();
  await app.request('/api/chat', { incidentId: 'inc-1', message: 'synthetic' });
  const before = structuredClone(app.states.get('inc-1'));
  const changed = await app.request('/api/state', { incidentId: 'inc-1', status: 'resolved' });
  assert.equal(changed.status, 200);
  const state = await changed.json();
  assert.equal(state.status, 'resolved');
  for (const field of ['incidentId', 'createdAt', 'messages', 'summary', 'hypotheses', 'latestEvidence']) assert.deepEqual(state[field], before[field]);
  for (const body of [{ incidentId: 'inc-1', status: 'bad' }, { incidentId: 'inc-1', status: 'open', messages: [] }, { incidentId: 'inc-1', status: 'open', summary: 'replacement' }]) {
    assert.equal((await app.request('/api/state', body)).status, 400);
  }
  assert.equal(app.states.get('inc-1').status, 'resolved');
});

test('invalid JSON, identities and chat bodies fail before storage/model calls', async () => {
  const app = setup();
  for (const body of [null, {}, { incidentId: {}, message: 'x' }, { incidentId: '../x', message: 'x' }, { incidentId: 'x', message: ' ' }, { incidentId: 'x', message: 'a'.repeat(8001) }, { incidentId: 'x', message: 'valid', status: 'resolved' }]) {
    assert.equal((await app.request('/api/chat', body)).status, 400);
  }
  assert.equal((await app.handler(new Request('http://local/api/chat', { method: 'POST', body: '{' }))).status, 400);
  assert.equal((await app.request('/api/state?incidentId=bad%20id')).status, 400);
  assert.deepEqual(app.counts(), { reads: 0, writes: 0, modelCalls: 0 });
});

test('provider errors and invalid model output are sanitized without saving failed chat', async () => {
  for (const generate of [async () => { throw new Error('private-provider-detail'); }, async () => ({ summary: 'invalid' })]) {
    const app = setup(generate);
    const before = await (await app.request('/api/state?incidentId=x')).json();
    const response = await app.request('/api/chat', { incidentId: 'x', message: 'synthetic' });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'triage_unavailable' });
    assert.deepEqual(app.states.get('x'), before);
    assert.equal(app.counts().writes, 0);
  }
});

test('storage failures return JSON and do not report a successful chat', async () => {
  for (const failure of ['read', 'write']) {
    const handler = createHandler(() => ({
      async getState(id) { if (failure === 'read') throw new Error('private'); return createInitialState(id); },
      async updateState() { throw new Error('private'); },
    }), async () => fixture);
    const response = await handler(new Request('http://local/api/chat', { method: 'POST', body: JSON.stringify({ incidentId: 'x', message: 'synthetic' }) }));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'state_unavailable' });
  }
});

test('sessions stay distinct and recent evidence remains bounded', async () => {
  const app = setup();
  for (let i = 0; i < 6; i++) assert.equal((await app.request('/api/chat', { incidentId: 'one', message: `evidence-${i}` })).status, 200);
  const one = await (await app.request('/api/state?incidentId=one')).json();
  const two = await (await app.request('/api/state?incidentId=two')).json();
  assert.deepEqual(one.latestEvidence, ['evidence-1', 'evidence-2', 'evidence-3', 'evidence-4', 'evidence-5']);
  assert.equal(one.messages.length, 12);
  assert.equal(two.messages.length, 0);
});
