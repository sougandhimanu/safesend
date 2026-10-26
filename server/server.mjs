// Serves the repo (so the site at / works) plus the moderation API:
//   POST /api/messages  {text}  -> checks the message and only delivers it if it is not abusive (the real gate;
//                                  the browser check can be bypassed, this one cannot)
//   GET  /api/messages          -> delivered messages
//   POST /api/moderate  {text}  -> {score, labels, source}, for the live check while typing
//   POST /api/appeals   {text}  -> a blocked user asks a person to review their message
//   POST /api/reports   {messageId, reason} -> a user reports a delivered message
//   GET  /api/review, POST /api/review/{appeals|reports}/:id {decision}  -> moderators (MODERATOR_TOKEN)
//   POST /api/review/settings {sensitivity}  -> moderators set how strict the AI check is
//   ANTHROPIC_API_KEY=... node server/server.mjs      -> http://localhost:8787/
// Env (or .env): PORT (8787), MODERATION_MODEL (claude-opus-5-5), MODERATION_EFFORT (low),
//      MODERATION_FAIL ('closed' = refuse to deliver when the AI check fails, 'open' = deliver),
//      MODERATOR_TOKEN (password for review.html; review is off without it),
//      MODERATION_SENSITIVITY (relaxed | balanced | strict; starting value, moderators can change it).
import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { createClaudeClassifier } from './classifier.mjs';
import { createStore, loadStore } from './store.mjs';
import { createLexicon, variants } from '../src/safesend.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_CHARS = 4000;
export const REPORT_REASONS = ['hate', 'harassment', 'threat', 'sexual', 'spam', 'other'];
// AI score at or above which a message is blocked. Word-list hits are always blocked (score 1).
export const SENSITIVITY = { relaxed: 0.7, balanced: 0.5, strict: 0.3 };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };

/** (text) => { score, labels, source, term?, reason? }. Word list first (free, instant), Claude for everything else. */
export function createModerator({ classify, lexicon = createLexicon(), cacheSize = 1000 } = {}) {
  const cache = new Map();
  return async function moderate(text) {
    const term = lexicon(variants(text));
    if (term) return { score: 1, labels: [lexicon.labelOf(term)], source: 'lexicon', term };
    if (!classify) return { score: 0, labels: [], source: 'lexicon' };
    if (cache.has(text)) return cache.get(text);
    const r = { ...(await classify(text)), source: 'model' };
    if (cache.size >= cacheSize) cache.delete(cache.keys().next().value);
    cache.set(text, r);
    return r;
  };
}

const apiError = (e) => {
  if (e instanceof Anthropic.AuthenticationError) return [500, 'server has no valid ANTHROPIC_API_KEY'];
  if (e instanceof Anthropic.RateLimitError) return [429, 'rate limited'];
  if (e instanceof Anthropic.APIError) return [502, `moderation API error ${e.status}`];
  return [502, String(e?.message ?? e)];
};

export function createServer({
  moderate,
  aiConfigured = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  sensitivity = process.env.MODERATION_SENSITIVITY || 'balanced',
  failMode = process.env.MODERATION_FAIL || 'closed',
  onBlocked = (v) => console.log(`blocked message: ${v.labels.join(', ') || 'unknown'} (${v.source})`),
  store = createStore(),
  moderatorToken = process.env.MODERATOR_TOKEN || '',
}) {
  const { data } = store;
  data.settings ??= {};
  if (!SENSITIVITY[data.settings.sensitivity]) data.settings.sensitivity = SENSITIVITY[sensitivity] ? sensitivity : 'balanced';
  const threshold = () => SENSITIVITY[data.settings.sensitivity];
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

  // Returns the parsed JSON object, or undefined after sending an error response.
  async function readJson(req, res) {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > MAX_CHARS * 4 + 100) return json(res, 413, { error: 'too large' }); }
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch { /* fall through */ }
    return json(res, 400, { error: 'expected JSON {"text": "..."}' });
  }
  async function readText(req, res) {
    const body = await readJson(req, res);
    if (!body) return;
    const text = String(body.text ?? '');
    if (text.length > MAX_CHARS) return json(res, 413, { error: `message longer than ${MAX_CHARS} characters` });
    return text;
  }
  const digest = (s) => createHash('sha256').update(s).digest();
  const isModerator = (req) => Boolean(moderatorToken) &&
    timingSafeEqual(digest(String(req.headers.authorization ?? '')), digest(`Bearer ${moderatorToken}`));

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, ai: aiConfigured, sensitivity: data.settings.sensitivity, threshold: threshold() });

    if (url.pathname === '/api/moderate' && req.method === 'POST') {
      const text = await readText(req, res);
      if (typeof text !== 'string') return;
      if (!text.trim()) return json(res, 200, { score: 0, labels: [] });
      try {
        return json(res, 200, await moderate(text));
      } catch (e) {
        const [status, error] = apiError(e);
        return json(res, status, { error });
      }
    }

    if (url.pathname === '/api/messages' && req.method === 'GET') return json(res, 200, { messages: data.messages });

    if (url.pathname === '/api/messages' && req.method === 'POST') {
      const text = await readText(req, res);
      if (typeof text !== 'string') return;
      if (!text.trim()) return json(res, 400, { sent: false, error: 'empty message' });
      let v;
      try {
        v = await moderate(text);
      } catch (e) {
        if (failMode === 'closed') return json(res, 503, { sent: false, error: `could not check the message: ${apiError(e)[1]}` });
        v = { score: 0, labels: [], source: 'unchecked' };
      }
      if (v.score >= threshold()) {
        onBlocked(v);
        return json(res, 422, { sent: false, labels: v.labels, source: v.source, term: v.term, reason: v.reason });
      }
      return json(res, 201, { sent: true, message: store.addMessage(text) });
    }

    // A blocked user thinks the block was a mistake. Labels come from the server's own check, not the client.
    if (url.pathname === '/api/appeals' && req.method === 'POST') {
      const text = await readText(req, res);
      if (typeof text !== 'string') return;
      if (!text.trim()) return json(res, 400, { error: 'empty message' });
      let labels = [];
      try { labels = (await moderate(text)).labels; } catch { /* a person reviews it anyway */ }
      const appeal = store.addAppeal(text, labels);
      return json(res, 201, { appeal: { id: appeal.id, status: appeal.status } });
    }

    // Something abusive got through: a user reports a delivered message.
    if (url.pathname === '/api/reports' && req.method === 'POST') {
      const body = await readJson(req, res);
      if (!body) return;
      const message = data.messages.find((m) => m.id === Number(body.messageId));
      if (!message) return json(res, 404, { error: 'message not found' });
      const reason = REPORT_REASONS.includes(body.reason) ? body.reason : 'other';
      const report = store.addReport(message, reason);
      return json(res, 201, { report: { id: report.id, status: report.status } });
    }

    // Moderator review.
    if (url.pathname.startsWith('/api/review')) {
      if (!moderatorToken) return json(res, 503, { error: 'review is off: set MODERATOR_TOKEN on the server' });
      if (!isModerator(req)) return json(res, 401, { error: 'wrong moderator password' });
      if (url.pathname === '/api/review' && req.method === 'GET') {
        return json(res, 200, { appeals: data.appeals.toReversed(), reports: data.reports.toReversed(), settings: data.settings });
      }
      if (url.pathname === '/api/review/settings' && req.method === 'POST') {
        const body = await readJson(req, res);
        if (!body) return;
        if (!SENSITIVITY[body.sensitivity]) return json(res, 400, { error: `sensitivity must be one of: ${Object.keys(SENSITIVITY).join(', ')}` });
        data.settings.sensitivity = body.sensitivity;
        store.save();
        return json(res, 200, { settings: data.settings });
      }
      const m = url.pathname.match(/^\/api\/review\/(appeals|reports)\/(\d+)$/);
      if (m && req.method === 'POST') {
        const body = await readJson(req, res);
        if (!body) return;
        const item = data[m[1]].find((x) => x.id === Number(m[2]));
        if (!item) return json(res, 404, { error: 'not found' });
        const decisions = m[1] === 'appeals' ? { approve: 'approved', reject: 'rejected' } : { remove: 'removed', dismiss: 'dismissed' };
        const status = decisions[body.decision];
        if (!status) return json(res, 400, { error: `decision must be one of: ${Object.keys(decisions).join(', ')}` });
        if (item.status === status) return json(res, 200, { item });
        item.status = status;
        item.reviewedAt = new Date().toISOString();
        // Approving an appeal delivers the message the filter wrongly blocked; removing a report takes the message down.
        if (status === 'approved') item.messageId = store.addMessage(item.text).id;
        if (status === 'removed') store.removeMessage(item.messageId);
        store.save();
        return json(res, 200, { item });
      }
      return json(res, 404, { error: 'not found' });
    }

    // Static files, confined to the repo root.
    const file = path.resolve(ROOT, '.' + decodeURIComponent(url.pathname) + (url.pathname.endsWith('/') ? 'index.html' : ''));
    const rel = path.relative(ROOT, file).split(path.sep);
    if (rel[0] === '..' || path.isAbsolute(rel.join(path.sep)) || rel.some((p) => p.startsWith('.') || p === 'node_modules' || p === 'data')) return json(res, 404, { error: 'not found' });
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
      res.end(data);
    } catch { json(res, 404, { error: 'not found' }); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Put ANTHROPIC_API_KEY in .env next to package.json (git-ignored, never served to browsers).
  try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* no .env: use the shell's environment */ }
  const aiConfigured = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  // Without a key the server still blocks via the word list instead of failing every check.
  const classify = aiConfigured
    ? createClaudeClassifier({ model: process.env.MODERATION_MODEL || 'claude-opus-5-5', effort: process.env.MODERATION_EFFORT || 'low' })
    : null;
  const port = Number(process.env.PORT) || 8787;
  const store = await loadStore(path.join(ROOT, 'data', 'safesend.json'));
  createServer({ moderate: createModerator({ classify }), aiConfigured, store }).listen(port, () => {
    console.log(`SafeSend server: http://localhost:${port}/  (AI check ${aiConfigured ? 'on' : 'off: set ANTHROPIC_API_KEY'})`);
    console.log(process.env.MODERATOR_TOKEN ? `Moderator review: http://localhost:${port}/review.html` : 'Moderator review off: set MODERATOR_TOKEN in .env');
  });
}
