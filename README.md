# SafeSend

**No one should have to read hate. SafeSend stops it before it's sent.**

SafeSend keeps a chat app's **Send** button off (and blocks Enter and form submits) while a message is abusive or hateful: insults, swearing and threats, and hate speech (racism, colorism, sexism, homophobia and transphobia, ableism, and fascism or extremism). Every block says what was caught and why. There is no "send anyway": only a moderator can approve a blocked message.

- **Website and live demo:** https://sougandhimanu.github.io/safesend/ (once GitHub Pages is turned on, see below)

## Quick start

```
git clone https://github.com/sougandhimanu/safesend.git
cd safesend
npm install
cp .env.example .env     # then add your keys (see below); optional
npm start                # open http://localhost:8787/
```

`npm test` runs the word-list and server tests (no API key needed).

## How detection works

1. **Normaliser** (on device): undoes disguises such as zero-width characters, full-width letters, `f u c k`, `ff uu cc kk`, `fuuuck`, spaced-out words inside sentences, leetspeak (`sh1t`, `b!tch`), curly apostrophes, and Cyrillic/Greek look-alike letters.
2. **Word list** (on device, instant, free): swearing in about 40 languages plus hate terms tagged by category (`SEED_TERMS` and `HATE_TERMS` in `src/lexicon.js`). Scripts without spaces (Chinese, Japanese, Thai…) match inside text; others match whole words, so "class" or "Scunthorpe" written normally aren't flagged.
   - Identity words are not blocked when used plainly ("I'm gay", "Kali Puja", "mental health"). Only slurs, insulting phrases, or a disguised identity word ("g a y") are blocked.
3. **AI check** (optional, on your server): Claude judges messages the word list doesn't catch, in context and in any language, including transliterated and mixed text such as Hinglish. It catches coded hate, polite-sounding colorism or sexism, and sarcasm, treats dialects (African American English, Nigerian Pidgin, Singlish…) as normal speech, and writes a one-line reason in the sender's language.
4. **Server gate**: the server checks every message again before delivering it, so bypassing the app doesn't get abuse through.

## Add it to a chat app

```js
import { SafeSend, httpProvider, explainVerdict } from './src/safesend.js';

const guard = new SafeSend({
  provider: httpProvider('/api/moderate'),   // optional AI check; omit for word list only
  failMode: 'closed',                        // if the AI check fails: 'closed' blocks, 'open' allows
  disableWhilePending: true,
  onVerdict: (v) => { why.textContent = v.blocked ? explainVerdict(v) : ''; },
});
const detach = guard.attach({ input, sendButton, hint });   // hint: element that shows "can't be sent"
```

Works with `<input>`, `<textarea>` and `contenteditable`. In React or Vue, call `attach` in an effect or mounted hook and use `detach` as cleanup. Other options: `threshold`, `timeoutMs`, `debounceMs`, `messages`.

Then send messages through the server (`POST /api/messages`) so they're checked again before delivery: browser checks alone can be bypassed.

## Server

`server/server.mjs` serves the website and the API:

| Endpoint | What it does |
|---|---|
| `POST /api/messages` `{text}` | Checks the message and delivers it (`201`) or refuses it (`422` with `labels`, `term`, `reason`) |
| `GET /api/messages` | Delivered messages |
| `POST /api/moderate` `{text}` | Check only: `{score, labels, source, term?, reason?, language?}`, for the live check while typing |
| `POST /api/appeals` `{text}` | A blocked user asks a moderator to review their message |
| `POST /api/reports` `{messageId, reason}` | A user reports a delivered message |
| `GET /api/review`, `POST /api/review/{appeals,reports}/:id`, `POST /api/review/settings` | Moderators only (`MODERATOR_TOKEN`) |
| `GET /api/health` | Whether the AI check is on, and the current sensitivity |

The word list runs first (free, instant); only messages it doesn't catch go to Claude, and results are cached. AI labels: `insult, profanity, harassment, threat, self_harm, sexual, racism, colorism, fascism, sexism, ableism, homophobia, other_hate`.

Settings go in `.env` (copy `.env.example`; `.env` is git-ignored and never sent to browsers):

| Setting | Meaning |
|---|---|
| `ANTHROPIC_API_KEY` | Turns on the AI check. Get one at https://platform.claude.com. Without it, the server uses the word list only. |
| `MODERATOR_TOKEN` | Password for the moderator page. Moderator review is off while it's empty. |
| `MODERATION_MODEL` | Default `claude-opus-5-5`. `claude-haiku-5-5` is much cheaper and faster per check. |
| `MODERATION_SENSITIVITY` | Starting sensitivity: `relaxed`, `balanced` (default) or `strict`. Moderators can change it later. |
| `MODERATION_FAIL` | If the AI check fails: `closed` (default) refuses delivery, `open` delivers. |
| `MODERATION_EFFORT`, `PORT` | AI effort (default `low`) and port (default `8787`). |

## Report, appeal and moderator review

- **Appeal:** after someone tries to send a blocked message, the chat offers "Not offensive? Ask for a review".
- **Report:** hover over a delivered message to report it (hate speech, harassment, threat, sexual, spam, other).
- **Review:** moderators sign in at `/review.html` with `MODERATOR_TOKEN`. Approving an appeal delivers the message; removing a report deletes the message from the chat.
- **Sensitivity:** moderators choose how sure the AI must be before blocking (Relaxed 0.7, Balanced 0.5, Strict 0.3). Users can't change it. Word-list matches are always blocked.
- **Privacy:** server logs record only the category of a blocked message, never its text. Messages, appeals and reports are saved in `data/safesend.json` (git-ignored, never served) because moderators need to read them.

## Test across dialects and languages

`eval/samples.json` has 41 real-world messages: African American English, Indian English, Hinglish, Tamil-English, Nigerian Pidgin, Singlish, Scots, Jamaican Patois, nine other languages, discussion of hate (which must be allowed), coded hate and emoji.

```
npm run eval                              # word list only (free)
npm run eval:ai                           # word list + Claude (about 40 API calls)
npm run eval:ai -- --sensitivity strict
```

It reports over-blocking (normal speech blocked) and misses (harmful messages allowed). With the word list alone, it over-blocks 1 of 24 normal messages and misses 16 of 17 harmful ones written without slurs. That's why the AI check matters. Add your own users' languages and slang before launch.

## Host the website on GitHub Pages

`index.html` is the product page, with a self-playing example and a live demo. GitHub Pages only serves files, so there the demo uses the word list alone and shows "Word-list mode"; the AI check, server gate, report and appeal need the Node server.

1. Open **Settings → Pages** in this repo.
2. Under **Source**, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
3. After about a minute the site is at https://sougandhimanu.github.io/safesend/.

## Honest limits

- **No filter catches everything in every language.** The word list is small and can't read context. The AI check is strong in widely used languages and weaker in rare ones and brand-new slang.
- **Mistakes happen** (quoted text, sarcasm, new slang, words like "Scunthorpe" spelled out letter by letter). That's what appeal, report and moderator review are for.
- **A phone keyboard can't turn off another app's Send button.** Android and iOS don't allow it, so SafeSend has to be built into the chat app. A SafeSend keyboard is on the roadmap.
- **Browser checks can be bypassed.** Always deliver messages through the server gate.
