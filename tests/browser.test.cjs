const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  const elements = new Map();
  function element() {
    return {
      value: '', textContent: '', className: '', disabled: false, children: [], handlers: {},
      set innerHTML(value) { this.html = value; this.children = []; },
      get innerHTML() { return this.html ?? ''; },
      appendChild(child) { this.children.push(child); },
      addEventListener(name, fn) { this.handlers[name] = fn; },
    };
  }
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element,
  };
  document.getElementById('incidentId').value = 'first';
  const requests = [];
  vm.runInNewContext(readFileSync(path.join(__dirname, '../public/app.js'), 'utf8'), {
    document, crypto: { randomUUID: () => '12345678-example' },
    fetch(url, options) {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      requests.push({ url, options, reject, reply(data, ok = true) { resolve({ ok, json: async () => data }); } });
      return promise;
    },
  });
  const get = id => document.getElementById(id);
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return {
    get, requests, flush,
    switchPending(id) { get('incidentId').value = id; get('incidentId').handlers.input?.(); return get('incidentId').handlers.change(); },
    send(message) { get('messageInput').value = message; return get('chatForm').handlers.submit({ preventDefault() {} }); },
    transcript() { return get('messages').children.map(child => child.innerHTML).join('\n'); },
  };
}
const state = summary => ({ status: 'open', summary, hypotheses: [], messages: [] });
const answer = summary => ({ summary, possibleCauses: [], nextSteps: [], followUpQuestion: '' });

test('late state loads cannot replace a newer visit, even after returning to the same ID', async () => {
  const app = setup();
  const second = app.switchPending('second');
  const returned = app.switchPending('first');
  app.requests[2].reply(state('current visit'));
  await returned;
  app.requests[1].reply(state('other incident'));
  await second;
  app.requests[0].reply(state('obsolete visit'));
  await app.flush();
  assert.equal(app.get('incidentSummary').textContent, 'current visit');
  assert.doesNotMatch(app.transcript(), /obsolete|other incident/);
});

test('old chat success, API errors and network failures stay out of a new incident', async () => {
  for (const result of ['success', 'api-error', 'network-error']) {
    const app = setup();
    app.requests[0].reply(state('first'));
    await app.flush();
    const oldChat = app.send('old incident evidence');
    const changed = app.switchPending('second');
    app.requests[2].reply(state('second'));
    await changed;
    const newChat = app.send('current evidence');
    if (result === 'success') app.requests[1].reply(answer('obsolete response'));
    else if (result === 'api-error') app.requests[1].reply({ error: 'obsolete error' }, false);
    else app.requests[1].reject(new Error('obsolete network error'));
    await oldChat;
    assert.equal(app.get('sendBtn').disabled, true);
    assert.equal(app.get('incidentSummary').textContent, 'second');
    assert.doesNotMatch(app.transcript(), /obsolete|old incident/);
    app.requests[3].reply(answer('current response'));
    await newChat;
    assert.match(app.transcript(), /current evidence/);
    assert.match(app.transcript(), /current response/);
    assert.equal(app.get('sendBtn').disabled, false);
  }
});

test('new incident discards delayed status updates and resets badge styling', async () => {
  const app = setup();
  app.requests[0].reply({ ...state('first'), status: 'resolved' });
  await app.flush();
  const status = app.get('incidentStatus').handlers.click();
  app.get('newIncidentBtn').handlers.click();
  assert.equal(app.get('incidentStatus').className, 'status-badge open');
  app.requests[2].reply(state('new incident'));
  await app.flush();
  app.requests[1].reply({ ...state('old status response'), status: 'resolved' });
  await status;
  assert.equal(app.get('incidentSummary').textContent, 'new incident');
  assert.equal(app.get('incidentStatus').textContent, 'open');
});

test('editing an ID invalidates in-flight work before the change event', async () => {
  const app = setup();
  app.get('incidentId').value = 'edited';
  app.get('incidentId').handlers.input?.();
  app.requests[0].reply(state('old load result'));
  await app.flush();
  assert.doesNotMatch(app.transcript(), /old load result/);
  assert.equal(app.get('incidentSummary').textContent, 'No summary yet.');
});
