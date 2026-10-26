// Checks SafeSend against eval/samples.json: dialects, languages, discussion of hate, coded hate and emoji.
// Measures both directions: harmful messages that get through, and normal speech that gets blocked.
//   npm run eval                  word list only (free, instant)
//   npm run eval:ai               word list + Claude (uses your API key; about one call per sample)
//   ... -- --sensitivity strict   relaxed | balanced | strict
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModerator, SENSITIVITY } from '../server/server.mjs';
import { createClaudeClassifier } from '../server/classifier.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const useAI = args.includes('--ai');
const sensitivity = args[args.indexOf('--sensitivity') + 1] in SENSITIVITY ? args[args.indexOf('--sensitivity') + 1] : 'balanced';
const threshold = SENSITIVITY[sensitivity];

let classify = null;
if (useAI) {
  try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* use the shell's environment */ }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error('No ANTHROPIC_API_KEY in .env: run `npm run eval` for the word list only.');
    process.exit(1);
  }
  classify = createClaudeClassifier({ model: process.env.MODERATION_MODEL || 'claude-opus-5-5', effort: process.env.MODERATION_EFFORT || 'low' });
}
const moderate = createModerator({ classify });
const samples = JSON.parse(await readFile(path.join(ROOT, 'eval', 'samples.json'), 'utf8'));

// A few at a time to stay well inside rate limits.
const results = new Array(samples.length);
let next = 0;
await Promise.all(Array.from({ length: useAI ? 4 : 1 }, async () => {
  while (next < samples.length) {
    const i = next++;
    const s = samples[i];
    try {
      const v = await moderate(s.text);
      results[i] = { ...s, got: v.score >= threshold ? 'block' : 'allow', v };
    } catch (e) {
      results[i] = { ...s, got: 'error', v: { labels: [], source: String(e.message) } };
    }
  }
}));

const mark = (r) => (r.got === r.expect ? 'ok  ' : r.got === 'error' ? 'ERR ' : r.expect === 'allow' ? 'OVER' : 'MISS');
let group = '';
for (const r of results) {
  if (r.group !== group) { group = r.group; console.log(`\n${group}`); }
  const detail = r.got === 'block' ? `  [${r.v.labels.join(', ') || 'blocked'} via ${r.v.source}${r.v.term ? `: "${r.v.term}"` : ''}]` : r.got === 'error' ? `  [${r.v.source}]` : '';
  console.log(`  ${mark(r)} expected ${r.expect.padEnd(5)} got ${r.got.padEnd(5)} ${JSON.stringify(r.text)}${detail}`);
}

const over = results.filter((r) => r.expect === 'allow' && r.got === 'block');
const miss = results.filter((r) => r.expect === 'block' && r.got === 'allow');
const errors = results.filter((r) => r.got === 'error');
const correct = results.filter((r) => r.got === r.expect).length;
console.log(`\n${useAI ? 'Word list + AI' : 'Word list only'}, sensitivity ${sensitivity}: ${correct}/${results.length} correct`);
console.log(`  over-blocked (normal speech blocked): ${over.length} of ${results.filter((r) => r.expect === 'allow').length}`);
console.log(`  missed (harmful message allowed):     ${miss.length} of ${results.filter((r) => r.expect === 'block').length}`);
if (errors.length) console.log(`  errors: ${errors.length}`);
