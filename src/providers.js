// Pluggable ML/API classifiers. A provider is: async (text, {signal}) => { score: 0..1, labels?: string[], explanation?: string }
// Use one of these (or your own) for coverage the lexicon can't give: context, sarcasm,
// slurs, and languages outside the seed lexicon.

/** Wrap any async function. */
export const functionProvider = (fn) => fn;

/**
 * POST { text } to your own moderation endpoint (recommended: keeps API keys off the device).
 * Your endpoint should return JSON; `map` converts it to { score, labels, explanation }.
 */
export function httpProvider(url, { headers = {}, map = (j) => ({ score: j.score ?? 0, labels: j.labels ?? [], explanation: j.reason ?? '' }) } = {}) {
  return async (text, { signal } = {}) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ text }),
      signal,
    });
    if (!res.ok) throw new Error(`moderation endpoint ${res.status}`);
    return map(await res.json());
  };
}

/**
 * On-device inference with transformers.js. Pass a *multilingual* toxicity model that has ONNX
 * weights (verify the model id/labels yourself; many popular toxicity models are English-only).
 *   transformersProvider({ model: 'your-org/multilingual-toxicity-onnx', toxicLabels: ['toxic','LABEL_1'] })
 */
export function transformersProvider({ model, toxicLabels = ['toxic', 'toxicity', 'LABEL_1'], cdn = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers' } = {}) {
  let pipePromise;
  return async (text) => {
    pipePromise ??= import(/* @vite-ignore */ cdn).then((m) => m.pipeline('text-classification', model, { topk: null }));
    const out = await (await pipePromise)(text, { top_k: null });
    const rows = Array.isArray(out[0]) ? out[0] : out;
    const hit = rows.filter((r) => toxicLabels.includes(r.label)).sort((a, b) => b.score - a.score)[0];
    return { score: hit?.score ?? 0, labels: hit ? [hit.label] : [] };
  };
}
