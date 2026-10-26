import { dedupe } from './normalize.js';

// Seed lexicon: a fast, offline FIRST layer. It is deliberately small: common profanity,
// self-harm/threat phrases, and unambiguous racist / fascist / colorist terms. It cannot cover
// every language or understand context (sarcasm, coded hate, colorism phrased politely); use an
// AI provider for that. Extend with `createLexicon(extraTerms, { merge: true })`.

export const SEED_TERMS = {
  en: ['fuck', 'fucker', 'fucking', 'motherfucker', 'shit', 'bullshit', 'bitch', 'asshole', 'bastard', 'cunt',
       'dumbass', 'jackass', 'kill yourself', 'kys', 'go die', 'i will kill you', 'i hope you die', 'piece of shit'],
  es: ['puta', 'mierda', 'cabron', 'pendejo', 'hijo de puta', 'hijueputa', 'verga', 'matate'],
  fr: ['merde', 'connard', 'connasse', 'salope', 'putain', 'encule', 'nique ta mere', 'ta gueule'],
  de: ['scheisse', 'scheiße', 'arschloch', 'hurensohn', 'wichser', 'fotze', 'verpiss dich'],
  pt: ['caralho', 'filho da puta', 'porra', 'puta que pariu', 'vai se foder', 'merda'],
  it: ['cazzo', 'vaffanculo', 'stronzo', 'puttana', 'figlio di puttana'],
  nl: ['klootzak', 'kutwijf', 'hoerenzoon', 'godverdomme', 'kankerlijer'],
  pl: ['kurwa', 'chuj', 'pierdole', 'spierdalaj', 'skurwysyn', 'jebać', 'pizda'],
  cs: ['píča', 'zmrd', 'kokot', 'jdi do prdele'],
  hu: ['bazdmeg', 'baszd meg', 'geci', 'kibaszott', 'faszfej'],
  ro: ['muie', 'futu-ți', 'du-te dracu', 'muist'],
  el: ['μαλάκα', 'μαλάκας', 'πουτάνα', 'γαμιέσαι'],
  sv: ['fitta', 'jävla', 'kuksugare'],
  no: ['faen', 'fitte', 'kukhue'],
  fi: ['vittu', 'perkele', 'huora', 'vitun'],
  tr: ['orospu', 'siktir', 'amk', 'piç', 'gerizekali'],
  ru: ['сука', 'блядь', 'хуй', 'пизда', 'ебать', 'мудак', 'убей себя'],
  uk: ['курва', 'хуйло', 'їбати'],
  ar: ['شرموطة', 'ابن الكلب', 'ابن الشرموطة', 'كس امك', 'اقتل نفسك', 'منيوك', 'عرص'],
  he: ['בן זונה', 'כוס אמק', 'לך תזדיין'],
  fa: ['کسکش', 'جنده', 'مادرجنده', 'کونی'],
  hi: ['madarchod', 'bhenchod', 'chutiya', 'harami', 'randi', 'गांडू', 'मादरचोद', 'भेनचोद', 'चूतिया', 'हरामी'],
  ur: ['حرامی', 'بہن چود', 'ماں چود'],
  bn: ['খানকি', 'মাগী', 'বোকাচোদা', 'শুয়োরের বাচ্চা', 'khanki', 'bokachoda'],
  pa: ['ਭੈਣਚੋਦ', 'ਮਾਦਰਚੋਦ', 'ਹਰਾਮੀ'],
  mr: ['भडवा', 'bhadwa', 'zavadya'],
  ta: ['தேவடியா', 'புண்டை', 'thevidiya', 'thevdiya', 'pundai'],
  te: ['లంజ', 'lanja', 'lanja kodaka'],
  ml: ['പൂറി', 'മൈര്', 'thayoli', 'poorimone'],
  id: ['bangsat', 'kontol', 'memek', 'bajingan', 'ngentot', 'goblok'],
  ms: ['pukimak', 'sial lah'],
  tl: ['putang ina', 'putangina', 'tangina', 'tarantado', 'ulol', 'pakyu'],
  vi: ['địt mẹ', 'đụ má', 'vãi lồn', 'vcl', 'đồ chó'],
  sw: ['kumamako', 'mshenzi'],
  yo: ['ashawo', 'oloshi'],
  zh: ['操你妈', '傻逼', '去死', '你妈的', '妈的', '贱人', '滚蛋'],
  ja: ['死ね', 'くそ', 'クソ', 'ばか野郎', 'きもい'],
  ko: ['씨발', '개새끼', '병신', '꺼져', '죽어'],
  th: ['เหี้ย', 'ไอ้สัส', 'ควาย', 'ไปตาย'],
};

// Hate speech, keyed by category, then language. Only terms that are hateful on their own;
// anything that depends on context (e.g. "monkey", "dark") is left to the AI provider.
export const HATE_TERMS = {
  racism: {
    en: ['nigger', 'niggers', 'nigga', 'niggas', 'sand nigger', 'chink', 'chinks', 'gook', 'gooks', 'spic', 'spics',
         'wetback', 'wetbacks', 'kike', 'kikes', 'raghead', 'towelhead', 'paki', 'pakis', 'jungle bunny', 'porch monkey',
         'beaner', 'beaners', 'go back to your country', 'go back to africa', 'inferior race'],
    es: ['sudaca', 'negrata', 'negro de mierda', 'indio de mierda'],
    fr: ['bougnoule', 'bamboula', 'sale noir', 'sale arabe', 'sale juif', 'youpin'],
    de: ['kanake', 'kanacke', 'neger'],
    it: ['sporco negro', 'negro di merda'],
    ru: ['хач', 'хачик', 'черножопый', 'жид'],
    hi: ['chinki', 'habshi'],
    zh: ['黑鬼', '支那', '阿三'],
    ko: ['깜둥이', '짱깨'],
  },
  fascism: {
    en: ['heil hitler', 'sieg heil', '14/88', 'white power', 'gas the jews', 'hitler was right', 'hitler did nothing wrong',
         'jews will not replace us', 'race war now', 'kill all jews', 'white genocide'],
    de: ['juden raus', 'ausländer raus'],
    fr: ['mort aux juifs'],
    it: ['viva il duce'],
    ru: ['хайль гитлер', 'зиг хайль'],
  },
  colorism: {
    en: ['too dark to be pretty', 'pretty for a dark girl', 'pretty for a dark skinned girl', 'pretty for a dark-skinned girl',
         'darkie', 'darkies', 'tar baby'],
    // Bare "kali"/"kaali" is the goddess, a name, and Malay/Indonesian for "times"; only insulting phrases are listed.
    hi: ['kaali kalooti', 'kali kaluti', 'kalooti', 'kaluti', 'काली कलूटी', 'कलूटी',
         'tu kali hai', 'tu kaali hai', 'kali hai tu', 'kaali hai tu', 'tum kali ho', 'tum kaali ho',
         'kitni kali', 'kitni kaali', 'kali ladki', 'kaali ladki', 'kali kaun', 'kaali kaun', 'kali bandariya', 'kaali bandariya',
         'तू काली है', 'काली है तू', 'तुम काली हो', 'कितनी काली', 'काली लड़की'],
  },
  sexism: {
    en: ['whore', 'whores', 'slut', 'sluts', 'skank', 'thot', 'feminazi', 'make me a sandwich', 'women belong in the kitchen',
         'get back in the kitchen', 'women are inferior', 'women are property'],
    es: ['las mujeres a la cocina', 'vete a la cocina'],
    fr: ['pute', 'les femmes à la cuisine'],
    de: ['schlampe', 'frauen gehören in die küche'],
    hi: ['aurat ki aukaat', 'aurton ki jagah rasoi'],
  },
  // Slurs and "gay" used as an insult. Identity words themselves ("gay", "lesbian", "trans", "hijra", "bakla")
  // are NOT listed: blocking them would stop people from talking about themselves.
  homophobia: {
    en: ['faggot', 'faggots', 'fag', 'fags', 'tranny', 'trannies', 'shemale', "that's so gay", 'thats so gay', 'that is so gay',
         'stop being gay', 'kill all gays', 'gays should die', 'gays are disgusting', 'being gay is a disease'],
    es: ['maricón', 'maricon', 'marica', 'joto'],
    pt: ['viado'],
    fr: ['pédé', 'tapette', 'gouine'],
    de: ['schwuchtel'],
    it: ['frocio'],
    ru: ['пидор', 'пидорас', 'педик'],
    tr: ['ibne'],
    id: ['bencong'],
    zh: ['死基佬', '人妖'],
  },
  // Disability and mental illness. Everyday words ("mental health", "crazy traffic", "I've been depressed",
  // the film "Psycho", "lunatic asylum") are NOT listed: only slurs and insults aimed at a person.
  ableism: {
    en: ['retard', 'retards', 'retarded', 'spaz', 'spastic', 'mongoloid', 'window licker',
         'you are mental', "you're mental", 'youre mental', 'ur mental', 'u r mental', 'mental case', 'mental fellow', 'mental guy', 'mental girl',
         'schizo', 'schizos', 'nutjob', 'nutjobs', 'nut job', 'nutcase', 'nutcases', 'headcase', 'loony', 'looney', 'loony bin',
         'you psycho', 'such a psycho', 'ur a psycho', "you're a psycho", 'you are a psycho', 'psycho bitch',
         'you lunatic', 'such a lunatic', "you're a lunatic", 'you are a lunatic', 'ur a lunatic',
         'go take your meds', 'take your meds', 'off your meds', 'forgot your meds', 'skipped your meds',
         'you belong in an asylum', 'belong in a mental hospital', 'escaped from the asylum', 'escaped from a mental hospital',
         'you should be locked up in a mental hospital', 'go back to the mental hospital',
         'mental illness is fake', 'depression is fake', 'depression is not real', 'anxiety is fake', 'adhd is fake',
         "you're so bipolar", 'you are so bipolar', 'ur so bipolar', 'stop being so bipolar', 'stop being autistic',
         'you autistic freak', 'autistic freak', 'retarded autistic'],
    te: ['mental pilla', 'mental pillа', 'mental gaadu', 'mental gadu', 'mental na kodaka', 'మెంటల్ పిల్ల', 'మెంటల్ గాడు',
         'pichodu', 'picchodu', 'pichi munda', 'పిచ్చోడు', 'పిచ్చి ముండ'],
    ta: ['mental payale', 'mental ponnu', 'மெண்டல்', 'paithiyakaaran', 'paithiyakkaaran', 'paithiyakari', 'பைத்தியக்காரன்', 'பைத்தியக்காரி'],
    hi: ['mental hai kya', 'mental ho kya', 'tu mental hai', 'tum mental ho', 'mental ladki', 'mental aadmi', 'मेंटल है क्या',
         'pagalkhane bhejo', 'pagalkhane jao', 'pagalkhane ja', 'pagalkhane wala', 'pagalkhane wali', 'pagal khane bhejo',
         'पागलखाने भेजो', 'पागलखाने जा'],
    es: ['mongolo', 'retrasado mental', 'retrasada mental', 'vete al manicomio', 'loco de manicomio', 'loca de manicomio'],
    fr: ['débile mental', 'attardé mental', 'attardée mentale', "retourne à l'asile", 'va à l\'asile'],
    de: ['spast', 'spasti', 'ab in die klapse', 'reif für die klapse', 'geisteskranker idiot'],
    pt: ['retardado mental', 'retardada mental', 'vai pro hospício', 'volta pro hospício'],
  },
};

// Ordinary words that are only blocked when disguised ("gg aa yy", "g4y", "g.a.y"): hiding the word signals an
// insult, while writing it plainly ("I'm gay") is someone talking about themselves.
export const DISGUISED_TERMS = {
  homophobia: ['gay', 'gays'],
};

// Scripts written without spaces between words -> must use substring matching.
const NO_SPACE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Khmer}\p{Script=Lao}\p{Script=Myanmar}]/u;
// Scripts where dropping accents keeps the word readable ("jebać" -> "jebac"); not true for e.g. Devanagari.
const ACCENT_SCRIPTS = /^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\P{L}]*$/u;

// One word in an alphabet where doubling letters is a disguise (not Han, Thai, Devanagari…).
const ONE_WORD = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]+$/u;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole-word (Unicode-aware) alternation. Longest first so "motherfucker" wins over "fuck" in reports.
function wordRegex(words) {
  if (!words.length) return null;
  const sorted = [...words].sort((a, b) => b.length - a.length);
  return new RegExp(`(?<![\\p{L}\\p{N}\\p{M}])(?:${sorted.map((w) => escapeRe(w).replace(/\s+/g, '\\s+')).join('|')})(?![\\p{L}\\p{N}\\p{M}])`, 'u');
}

/**
 * Build a matcher from { lang: [terms] } (or a flat array). Returns (variantTexts) => matchedTerm | null.
 * `hate` ({ category: { lang: [terms] } }) is always included unless set to null.
 * `disguised` ({ category: [terms] }) only match when absent from the plain text (variantTexts[0]).
 * `match.labelOf(term)` gives the term's category: 'abuse' or a HATE_TERMS key ('racism', 'sexism', …).
 */
export function createLexicon(terms = SEED_TERMS, { merge = false, hate = HATE_TERMS, disguised = DISGUISED_TERMS } = {}) {
  const labels = new Map();
  const add = (t, label) => {
    const n = String(t).normalize('NFKC').toLowerCase();
    if (!n.trim()) return;
    labels.set(n, label);
    if (ACCENT_SCRIPTS.test(n)) labels.set(n.normalize('NFD').replace(/\p{M}/gu, ''), label);
  };
  const addAll = (src, label) => {
    const lists = Array.isArray(src) ? [src] : Object.values(src);
    for (const list of lists) for (const t of list) add(t, label);
  };
  for (const src of merge ? [SEED_TERMS, terms] : [terms]) addAll(src, 'abuse');
  for (const [label, src] of Object.entries(hate ?? {})) addAll(src, label);
  const disguisedTerms = [];
  for (const [label, list] of Object.entries(disguised ?? {})) {
    for (const t of list) { const n = String(t).normalize('NFKC').toLowerCase(); labels.set(n, label); disguisedTerms.push(n); }
  }

  const substr = [];
  const words = [];
  for (const t of labels.keys()) if (!disguisedTerms.includes(t)) (NO_SPACE_SCRIPT.test(t) ? substr : words).push(t);
  const wordRe = wordRegex(words);
  const disguisedRe = wordRegex(disguisedTerms);

  // Alphabetic one-word terms keyed by their doubled-letter-free form ("ashole" -> "asshole"), so disguises
  // like "aa ss ss hh oo ll ee" or "you are a f u c k" match any term without listing each spelling.
  const singles = new Map();
  for (const t of labels.keys()) {
    if (!ONE_WORD.test(t)) continue;
    const d = dedupe(t);
    if (d.length >= 3 && !singles.has(d)) singles.set(d, t);
  }
  const insideRe = singles.size ? new RegExp([...singles.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join('|'), 'u') : null;
  // A disguised-only term ("gay") written plainly elsewhere in the message means someone is talking about themselves.
  const allowed = (term, raw) => !(disguisedTerms.includes(term) && disguisedRe.test(raw));

  function matchDisguises(variantTexts) {
    const raw = variantTexts[0];
    // Doubled letters, word by word: "ccaazzoo" matches "cazzo", but a plain "cazo" (Spanish: ladle) does not.
    for (const text of variantTexts) {
      for (const tok of text.split(/[^\p{L}]+/u)) {
        const d = dedupe(tok);
        if (d !== tok && singles.has(d) && allowed(singles.get(d), raw)) return singles.get(d);
      }
    }
    // Spaced-out runs are disguises in themselves, so search inside them: "afuck" (from "a f u c k") contains "fuck".
    for (const run of variantTexts.runs ?? []) {
      const m = insideRe?.exec(dedupe(run));
      if (m && allowed(singles.get(m[0]), raw)) return singles.get(m[0]);
    }
    return null;
  }

  function match(variantTexts) {
    for (const text of variantTexts) {
      const m = wordRe?.exec(text);
      if (m) return m[0];
      for (const s of substr) if (text.includes(s)) return s;
    }
    if (disguisedRe && !disguisedRe.test(variantTexts[0])) {
      for (const text of variantTexts.slice(1)) { const m = disguisedRe.exec(text); if (m) return m[0]; }
    }
    return matchDisguises(variantTexts);
  }
  match.labelOf = (term) => labels.get(String(term).toLowerCase().replace(/\s+/g, ' ')) ?? 'abuse';
  return match;
}
