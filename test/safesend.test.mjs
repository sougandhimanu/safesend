import { SafeSend, SEED_TERMS, HATE_TERMS, explainVerdict } from '../src/safesend.js';
import assert from 'node:assert/strict';

const g = new SafeSend();
const blocked = [
  'you are a piece of shit',
  'sh1t',
  'b!tch',
  'f​uck',                // zero-width char
  'ｆｕｃｋ',                    // full-width
  'You are an a$$hole'.replace('a$$hole', 'a$shole'), // leet-ish
  'eres un pendejo',
  'hijo de puta',
  'espèce de connard',
  'du bist ein Arschloch',
  'ты сука',
  'ты cука',                   // Cyrillic/Latin mix evasion in a Russian slur
  'तू चूतिया है',
  '你这个傻逼',
  'お前なんか死ね',
  '씨발 진짜',
  'kill yourself',
  // hate categories
  'go back to your country',
  'heil hitler',
  'sieg heil brothers',
  'she is too dark to be pretty',
  'kaali kalooti',
  'tu kitni kaali hai',
  'Tu kali hai',
  'kali ladki se shaadi nahi',
  'तू काली है',
  'get back in the kitchen',
  'you stupid slut',
  'what a retard',
  'du Spast',
  'mental pilla',
  'Mental Pilla nuvvu',
  'ff  mental gaadu',
  "you're mental",
  'tu mental hai kya',
  // mental health used as an insult
  'shut up you psycho',
  "you're a lunatic",
  'what a nutjob',
  'go take your meds',
  'you belong in an asylum',
  'depression is fake, just get over it',
  'stop being so bipolar',
  'he is such a schizo',
  'tu pichodu ra',
  'nee oru paithiyakaaran',
  'isko pagalkhane bhejo',
  'eres un retrasado mental',
  'quel débile mental',
  // caste
  'ye neech jaat ke log',
  'tu quota se aaya hai',
  'vaadu takkuva kulam vaadu',
  'avan oru paraiyan',
  'നീ ഒരു പുലയാടി',
  'dirty untouchable',
  // religion
  'all muslims are terrorists',
  'katue log',
  'pakistan chale jao tum',
  'ori turaka',
  'avan thulukkan',
  'nasty pajeet',
  // region and tribe
  'madrasi log aise hi hote hain',
  'ee golti bandidane',
  'dirty polack',
  // body, age, poverty
  'shut up fatso',
  'lavu gedhe la unnav',
  'moti bhains',
  'what an old hag',
  'buddha khoosat',
  'trailer trash family',
  'bhikhari ki aulad',
  'bichagadi kodaka',
  'shut up faggot',
  "lol that's so gay",
  'that’s so gay',
  'eres un maricón',
  'ты пидор',
  'gg aa yy',                          // "gay" disguised -> blocked; written plainly -> allowed
  'g a y',
  'g4y',
  'you are so gaaaay',
  'G.A.Y',
  // more languages
  'kurwa mać',
  'vittu',
  'putangina mo',
  'μαλακα',
  'jebac to',
  'địt mẹ mày',
  'তুই খানকি',
];
const allowed = [
  'Hello, how are you?',
  'Can you pass the assassin novel? Scunthorpe is lovely.',
  'The class assessment is tomorrow',   // "ass" inside words
  'Let us meet at the Dickens museum',
  'Bonjour, comment ça va ?',
  'Ich liebe dich',
  'こんにちは、元気ですか',
  '你好，今天天气不错',
  'Привет, как дела?',
  'मैं ठीक हूँ',
  'A cool little apple tree',          // doubled letters must not create matches
  'I see a bee',
  'Il est trop tard',                  // French "late"
  '¿Qué hora es?',
  'Kali Puja is next week',
  'kali',
  'Saya sudah dua kali ke sana',       // Malay/Indonesian: "twice"
  'Jai Maa Kaali',
  'In 1488 Dias rounded the Cape',
  'We studied fascism and Nazi Germany in history class',
  'I like my coffee dark',
  'Anjing saya lucu',                  // Indonesian: my dog is cute
  'Mongolia is beautiful',
  'Mental health matters',
  'That was a mental workout',
  'Take a mental note',
  "I've been dealing with depression and anxiety this year",   // people talking about mental health
  'My sister has schizophrenia and she is doing really well',
  'I was diagnosed with bipolar disorder and therapy helps',
  'Psycho is a classic Hitchcock film',
  'The old lunatic asylum is now a museum',
  'This traffic is insane',
  "That's crazy good news!",
  'Remember to take your medication with food',
  'My son is autistic and he loves trains',
  'Chamar Regiment was an infantry regiment',             // caste names, religions, places and bodies used normally
  'Happy Eid to all my Muslim friends!',
  'We visited the gurudwara and the church on the same day',
  'He moved from Bihar to Mumbai for work',
  'The Madras High Court gave its verdict',
  'Scarpe nere, per favore',
  'I ate rice and dal for lunch',
  'She is a proud plus-size model',
  'My grandmother is 90 and still sharp',
  'They grew up poor and built a business',
  'Vadakkan Veeragatha is a classic film',
  'Polar bears live in the Arctic',
  'a s s e s s m e n t',               // spaced-out innocent words with "ass" inside
  'b a s s  g u i t a r',
  'Llevo el cazo a la cocina',         // Spanish "cazo" (ladle) only blocked when typed "ccaazzoo"
  'I am gay, sooo happy',              // doubled letters elsewhere don't make "gay" a disguise
  "I'm gay and proud",                 // identity words are not abuse
  'My sister is a lesbian',
  'Trans rights are human rights',
  'Happy Pride month!',
  'gay',
  'Gay Pride parade on Sunday',
  'My cousins are gay',
  '',
];

let fail = 0;
for (const t of blocked) { const v = await g.check(t); if (!v.blocked) { console.log('MISSED  :', JSON.stringify(t)); fail++; } }
for (const t of allowed) { const v = await g.check(t); if (v.blocked) { console.log('FALSE+  :', JSON.stringify(t), v.term); fail++; } }

// Every single-word term in the lists, disguised the ways people type to dodge filters, must still be blocked.
const ALPHABETIC = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]{3,}$/u;
const allTerms = [...Object.values(SEED_TERMS), ...Object.values(HATE_TERMS).flatMap(Object.values)].flat();
const disguises = {
  spaced: (w) => [...w].join(' '),                                   // f u c k
  doubled: (w) => [...w].map((c) => c + c).join(''),                 // ffuucckk
  doubledSpaced: (w) => [...w].map((c) => c + c).join(' '),          // ff uu cc kk
  wideSpaced: (w) => [...w].map((c) => c + c).join('   '),           // ff   uu   cc   kk
  dotted: (w) => [...w].join('.'),                                   // f.u.c.k
  stretched: (w) => w.slice(0, 1) + w[1].repeat(5) + w.slice(2),     // fuuuuuck
  shouted: (w) => w.toUpperCase(),                                   // FUCK
  inSentence: (w) => `you are such a ${[...w].join(' ')} honestly`,  // ...a f u c k honestly
};
let generated = 0;
for (const term of allTerms.filter((t) => ALPHABETIC.test(t))) {
  for (const [how, disguise] of Object.entries(disguises)) {
    const text = disguise(term);
    generated++;
    if (!(await g.check(text)).blocked) { console.log(`MISSED  : ${how.padEnd(13)} ${JSON.stringify(text)}  (term: ${term})`); fail++; }
  }
}

// Category labels and hint text
const v = await g.check('go back to your country');
assert.deepEqual(v.labels, ['racism']);
assert.match(g.messages.blocked(v), /racist/);
assert.deepEqual((await g.check('what a retard')).labels, ['ableism']);
assert.deepEqual((await g.check('shit')).labels, ['abuse']);
assert.deepEqual((await g.check('shut up faggot')).labels, ['homophobia']);

// Explanations: what was flagged and why, so the block teaches instead of just refusing.
assert.equal(explainVerdict(await g.check('ff uu cc kk')), 'Flagged: “fuck”. Swearing at someone or insulting them hurts, even as a joke.');
assert.equal(explainVerdict(await g.check('tu kitni kaali hai')), 'Flagged: “kitni kaali”. It puts someone down for the colour of their skin.');
const ai = new SafeSend({ provider: async () => ({ score: 0.9, labels: ['sexism'], explanation: "Saying women can't drive puts people down for their gender." }) });
assert.equal(explainVerdict(await ai.check('women cant drive lol')), "Saying women can't drive puts people down for their gender.");

// Self-harm: never blocked, but flagged so the app can offer support.
for (const t of ['i want to kill myself', 'I just want to die', 'sometimes i think about suicide', 'jeena nahi chahta', 'chachipovalani undi', 'quiero morir', '死にたい']) {
  const v = await g.check(t);
  if (v.blocked || !v.support) { console.log('SUPPORT :', JSON.stringify(t), v); fail++; }
}
for (const t of ['go kill yourself']) {                 // telling SOMEONE ELSE to do it is still abuse
  const v = await g.check(t);
  if (!v.blocked) { console.log('MISSED  :', JSON.stringify(t)); fail++; }
}
assert.equal((await g.check('see you tomorrow')).support, false);

// "Always allow": moderators approve a real name that looks like a bad word; the word list then ignores it.
const named = new SafeSend({ allow: ['dick'] });
assert.equal((await g.check('Dick Smith is joining the call')).blocked, false);   // "dick" isn't in the list anyway
const homonym = new SafeSend({ allow: ['bhangi'] });
assert.equal((await g.check('Mr Bhangi will chair the meeting')).blocked, true);   // without the allow list: blocked
assert.equal((await homonym.check('Mr Bhangi will chair the meeting')).blocked, false);
assert.equal((await homonym.check('Mr Bhangi said fuck off')).blocked, true);       // only the allowed word is ignored
homonym.setAllow([]);
assert.equal((await homonym.check('Mr Bhangi will chair the meeting')).blocked, true);

// Provider behaviour
const slow = new SafeSend({ provider: async () => ({ score: 0.95, labels: ['toxic'] }) });
assert.equal((await slow.check('you are worthless garbage')).blocked, true);
const errOpen = new SafeSend({ provider: async () => { throw new Error('down'); } });
assert.equal((await errOpen.check('hello there')).blocked, false);
const errClosed = new SafeSend({ provider: async () => { throw new Error('down'); }, failMode: 'closed' });
assert.equal((await errClosed.check('hello there')).blocked, true);
const hang = new SafeSend({ provider: () => new Promise(() => {}), timeoutMs: 50, failMode: 'closed' });
assert.equal((await hang.check('hello there')).blocked, true);

console.log(fail ? `${fail} FAILURES` : `all ${blocked.length + allowed.length} lexicon cases, ${generated} generated disguises + provider cases passed`);
process.exit(fail ? 1 : 0);
