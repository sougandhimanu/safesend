// Server + classifier tests with a stand-in Anthropic client (no network, no API key needed).
import assert from 'node:assert/strict';
import { createClaudeClassifier } from '../server/classifier.mjs';
import { createModerator, createServer } from '../server/server.mjs';

const calls = [];
const fakeClient = (reply) => ({ beta: { messages: { create: async (params) => { calls.push(params); return reply(params); } } } });
const textReply = (obj) => () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] });

// Request shape: structured output, low effort, refusal fallback, message wrapped as data.
const classify = createClaudeClassifier({ client: fakeClient(textReply({ score: 0.92, labels: ['colorism', 'made_up'], language: 'hi-Latn', reason: 'Calling someone too dark to marry puts them down.' })) });
const r = await classify('tu kitni kaali hai, koi shaadi nahi karega');
assert.deepEqual(r, { score: 0.92, labels: ['colorism'], language: 'hi-Latn', reason: 'Calling someone too dark to marry puts them down.' });
const p = calls.at(-1);
assert.equal(p.model, 'claude-opus-5-5');
assert.equal(p.output_config.effort, 'low');
assert.equal(p.output_config.format.type, 'json_schema');
assert.equal(p.fallbacks, 'default');
assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
assert.match(p.messages[0].content, /^<message>\ntu kitni/);

// Haiku gets no fallbacks parameter.
await createClaudeClassifier({ model: 'claude-haiku-5-5', client: fakeClient(textReply({ score: 0, labels: [], language: 'en' })) })('hi');
assert.equal(calls.at(-1).fallbacks, undefined);

// Refusal -> throws, so SafeSend's failMode decides.
const refusing = createClaudeClassifier({ client: fakeClient(() => ({ stop_reason: 'refusal', content: [] })) });
await assert.rejects(refusing('x'), /declined/);

// Moderator: word list short-circuits (no API call), then caches model results.
const before = calls.length;
const moderate = createModerator({ classify });
assert.deepEqual(await moderate('heil hitler'), { score: 1, labels: ['fascism'], source: 'lexicon', term: 'heil hitler', support: false });
assert.equal(calls.length, before);
await moderate('something subtle');
await moderate('something subtle');
assert.equal(calls.length, before + 1);

// HTTP end to end.
const server = createServer({ moderate }).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const post = (body) => fetch(`${base}/api/moderate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
assert.deepEqual(await (await post(JSON.stringify({ text: 'go back to your country' }))).json(), { score: 1, labels: ['racism'], source: 'lexicon', term: 'go back to your country', support: false });
assert.equal((await post('not json')).status, 400);
assert.equal((await post(JSON.stringify({ text: 'a'.repeat(5000) }))).status, 413);
assert.equal((await fetch(`${base}/api/health`)).status, 200);
assert.equal((await fetch(`${base}/demo/`)).status, 200);
assert.equal((await fetch(`${base}/.git/config`)).status, 404);
assert.equal((await fetch(`${base}/%2e%2e/%2e%2e/Windows/win.ini`)).status, 404);

// Gate: abusive messages are never delivered, even when sent straight to the API (bypassing the page).
server.close();
const send = (b, text) => fetch(`${b}/api/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
const gate = createServer({ moderate: createModerator({ classify: async () => ({ score: 0.05, labels: [] }) }), onBlocked() {} }).listen(0);
const gbase = `http://127.0.0.1:${gate.address().port}`;
let r1 = await send(gbase, 'see you at noon');
assert.equal(r1.status, 201);
assert.equal((await r1.json()).sent, true);
r1 = await send(gbase, 'shut up faggot');
assert.equal(r1.status, 422);
assert.deepEqual(await r1.json(), { sent: false, labels: ['homophobia'], source: 'lexicon', term: 'faggot', support: false });
assert.deepEqual((await (await fetch(`${gbase}/api/messages`)).json()).messages.map((m) => m.text), ['see you at noon']);
gate.close();

// AI judged it hateful (no word-list hit) -> refused.
const hateful = createServer({ moderate: createModerator({ classify: async () => ({ score: 0.9, labels: ['colorism'] }) }), onBlocked() {} }).listen(0);
assert.equal((await send(`http://127.0.0.1:${hateful.address().port}`, 'she would be pretty if she were fairer')).status, 422);
hateful.close();

// AI check failing: closed refuses delivery, open delivers. Word-list hits are refused either way.
const down = createModerator({ classify: async () => { throw new Error('down'); } });
const closed = createServer({ moderate: down, failMode: 'closed' }).listen(0);
const open = createServer({ moderate: down, failMode: 'open', onBlocked() {} }).listen(0);
assert.equal((await send(`http://127.0.0.1:${closed.address().port}`, 'hello')).status, 503);
assert.equal((await send(`http://127.0.0.1:${open.address().port}`, 'hello')).status, 201);
assert.equal((await send(`http://127.0.0.1:${open.address().port}`, 'heil hitler')).status, 422);
closed.close(); open.close();

// No API key: word list still blocks, everything else is checked by the word list only.
const keyless = createServer({ moderate: createModerator({ classify: null }), onBlocked() {} }).listen(0);
assert.equal((await send(`http://127.0.0.1:${keyless.address().port}`, 'hello')).status, 201);
assert.equal((await send(`http://127.0.0.1:${keyless.address().port}`, 'tu kitni kaali hai')).status, 422);
keyless.close();

// Appeals, reports and moderator review.
{
  const app = createServer({ moderate: createModerator({ classify: null }), moderatorToken: 'mod-secret', onBlocked() {} }).listen(0);
  const b = `http://127.0.0.1:${app.address().port}`;
  const call = (path, body, token) => fetch(`${b}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body && JSON.stringify(body),
  });
  const messageTexts = async () => (await (await call('/api/messages')).json()).messages.map((m) => m.text);

  // A wrongly blocked message is appealed; labels come from the server's check, not the client.
  assert.equal((await call('/api/messages', { text: 's c u n t h o r p e' })).status, 422);
  const appeal = await (await call('/api/appeals', { text: 's c u n t h o r p e', labels: ['made up'] })).json();
  assert.equal(appeal.appeal.status, 'pending');

  // A delivered message is reported.
  const sent = await (await call('/api/messages', { text: 'you are worthless' })).json();
  assert.equal((await call('/api/reports', { messageId: sent.message.id, reason: 'harassment' })).status, 201);
  assert.equal((await call('/api/reports', { messageId: 9999, reason: 'hate' })).status, 404);

  // Review needs the moderator password.
  assert.equal((await call('/api/review')).status, 401);
  assert.equal((await call('/api/review', null, 'wrong')).status, 401);
  const queue = await (await call('/api/review', null, 'mod-secret')).json();
  assert.equal(queue.appeals[0].text, 's c u n t h o r p e');
  assert.deepEqual(queue.appeals[0].labels, ['abuse']);
  assert.equal(queue.reports[0].reason, 'harassment');
  assert.equal((await call(`/api/review/appeals/${queue.appeals[0].id}`, { decision: 'approve' })).status, 401);

  // Approving the appeal delivers the message; removing the report takes the reported message down.
  assert.equal((await call(`/api/review/appeals/${queue.appeals[0].id}`, { decision: 'maybe' }, 'mod-secret')).status, 400);
  assert.equal((await (await call(`/api/review/appeals/${queue.appeals[0].id}`, { decision: 'approve' }, 'mod-secret')).json()).item.status, 'approved');
  assert.equal((await (await call(`/api/review/reports/${queue.reports[0].id}`, { decision: 'remove' }, 'mod-secret')).json()).item.status, 'removed');
  assert.deepEqual(await messageTexts(), ['s c u n t h o r p e']);
  app.close();

  // No MODERATOR_TOKEN configured: review is off rather than open to everyone.
  const noReview = createServer({ moderate: createModerator({ classify: null }), moderatorToken: '' }).listen(0);
  assert.equal((await fetch(`http://127.0.0.1:${noReview.address().port}/api/review`)).status, 503);
  assert.equal((await fetch(`http://127.0.0.1:${noReview.address().port}/data/safesend.json`)).status, 404);
  noReview.close();
}

// Sensitivity: moderators decide how strict the AI check is; users cannot change it.
{
  const borderline = createModerator({ classify: async () => ({ score: 0.4, labels: ['insult'], reason: 'This could come across as a put-down.' }) });
  const app = createServer({ moderate: borderline, moderatorToken: 'mod-secret', onBlocked() {} }).listen(0);
  const b = `http://127.0.0.1:${app.address().port}`;
  const say = (text) => fetch(`${b}/api/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  const setTo = (sensitivity, token = 'mod-secret') => fetch(`${b}/api/review/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ sensitivity }) });
  assert.deepEqual(await (await fetch(`${b}/api/health`)).json(), { ok: true, ai: false, sensitivity: 'balanced', threshold: 0.5 });
  assert.equal((await say('ok whatever genius')).status, 201);                 // 0.4 < balanced 0.5
  assert.equal((await setTo('strict', 'not-the-password')).status, 401);       // users can't loosen or tighten it
  assert.equal((await setTo('extreme')).status, 400);
  assert.equal((await setTo('strict')).status, 200);
  const refused = await say('ok whatever genius');                             // 0.4 >= strict 0.3
  assert.equal(refused.status, 422);
  assert.equal((await refused.json()).reason, 'This could come across as a put-down.');
  assert.equal((await (await fetch(`${b}/api/health`)).json()).sensitivity, 'strict');
  app.close();
}

// Self-harm: delivered (not blocked) with support: true. Always-allow list: moderators manage it, users can't.
{
  const app = createServer({ moderate: createModerator({ classify: null }), moderatorToken: 'mod-secret', onBlocked() {} }).listen(0);
  const b = `http://127.0.0.1:${app.address().port}`;
  const post = (path, body, token) => fetch(`${b}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

  const crisis = await post('/api/messages', { text: "i don't want to live anymore" });
  assert.equal(crisis.status, 201);
  assert.equal((await crisis.json()).support, true);
  assert.equal((await (await post('/api/messages', { text: 'see you at lunch' })).json()).support, false);

  assert.equal((await post('/api/messages', { text: 'Mr Bhangi will chair the meeting' })).status, 422);
  assert.equal((await post('/api/review/allowlist', { add: 'Bhangi' })).status, 401);            // users can't change it
  assert.deepEqual((await (await post('/api/review/allowlist', { add: '  Bhangi ' }, 'mod-secret')).json()).words, ['bhangi']);
  assert.deepEqual((await (await fetch(`${b}/api/allowlist`)).json()).words, ['bhangi']);
  assert.equal((await post('/api/messages', { text: 'Mr Bhangi will chair the meeting' })).status, 201);
  assert.equal((await post('/api/review/allowlist', { add: '' }, 'mod-secret')).status, 400);
  assert.deepEqual((await (await post('/api/review/allowlist', { remove: 'bhangi' }, 'mod-secret')).json()).words, []);
  assert.equal((await post('/api/messages', { text: 'Mr Bhangi will chair the meeting' })).status, 422);
  app.close();
}

// AI says "crisis": delivered with support even though nothing in the word list matched.
{
  const m = createModerator({ classify: async () => ({ score: 0.1, labels: ['crisis'], reason: '' }) });
  assert.equal((await m('everything feels pointless lately')).support, true);
}

console.log('server + classifier tests passed');
