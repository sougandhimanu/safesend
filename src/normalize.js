// Text normalisation so evasion tricks (zero-width chars, leetspeak, spaced letters,
// look-alike Unicode, stretched letters) don't bypass detection. Works for any script.

const ZERO_WIDTH = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g;

// Applied ONLY to the "folded" variant, so genuine Cyrillic/Greek text still matches in the raw variant.
const FOLD_MAP = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b',
  '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't',
  // Cyrillic / Greek look-alikes of Latin letters
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i',
  'ο': 'o', 'α': 'a', 'ε': 'e', 'ι': 'i', 'ν': 'v', 'κ': 'k',
};

const LATIN_TO_CYR = { a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у', k: 'к', m: 'м', t: 'т', h: 'н', b: 'в' };

// Runs of 3+ one-letter chunks ("f u c k") or same-letter chunks ("ff uu cc kk").
const SPACED_LETTERS = /(?<![\p{L}\p{N}])(?:(\p{L})\1*[\s.\-_*,]+){2,}(\p{L})\2*(?![\p{L}\p{N}])/gu;

/** Collapse every doubled letter: "ffuucckk" -> "fuck", "asshole" -> "ashole". */
export const dedupe = (s) => s.replace(/(\p{L})\1+/gu, '$1');

/**
 * Returns the set of text variants to scan. `.runs` holds each spaced-out run joined up ("you are a f u c k" ->
 * "afuck"): the run itself is a disguise, so the lexicon searches inside it instead of needing whole-word matches.
 */
export function variants(input) {
  const raw = String(input ?? '')
    .normalize('NFKC')
    .replace(ZERO_WIDTH, '')
    .replace(/[‘’ʼ`´]/g, "'") // phone keyboards type ’ for '
    .toLowerCase();

  // Collapse "f u c k" / "f.u.c.k" into "fuck"
  const runs = [];
  const despaced = raw.replace(SPACED_LETTERS, (m) => { const joined = m.replace(/[\s.\-_*,]+/g, ''); runs.push(joined); return joined; });
  // Collapse 3+ repeated chars to 1 and also to 2 ("fuuuuck" -> "fuck", "fuuck")
  const squash1 = despaced.replace(/(.)\1{2,}/gu, '$1');
  const squash2 = despaced.replace(/(.)\1{2,}/gu, '$1$1');
  // Collapse every doubled letter ("ffuucckk" -> "fuck"); the lexicon also dedupes its terms to compare like with like.
  const dedup = dedupe(despaced);

  const folded = [...squash1].map((c) => FOLD_MAP[c] ?? c).join('');
  const foldedKeep2 = [...squash2].map((c) => FOLD_MAP[c] ?? c).join('');
  const foldedDedup = [...dedup].map((c) => FOLD_MAP[c] ?? c).join('');

  // Latin diacritics stripped ("sCHeiße" style variants, "cabrón" -> "cabron")
  const stripped = squash1.normalize('NFD').replace(/\p{M}/gu, '');

  // Mixed-script evasion of Cyrillic words: map Latin look-alikes back to Cyrillic
  const toCyr = [...squash1].map((c) => LATIN_TO_CYR[c] ?? c).join('');

  const out = [...new Set([raw, despaced, squash1, squash2, dedup, folded, foldedKeep2, foldedDedup, stripped, toCyr])];
  out.runs = runs;
  return out;
}
