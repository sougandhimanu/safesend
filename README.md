# SafeSend

Drop-in guard that disables a chat app's **Send** button (and blocks Enter / form submit) while the typed text is abusive or hateful: insults and profanity, threats, and hate speech (racism, colorism, fascism/extremism, sexism/misogyny, ableism). The hint tells the user which kind it caught.

## How detection works (layered)

1. **Normaliser**: strips zero-width characters, folds full-width forms, collapses `f u c k` / `ff uu cc kk` / `fuuuck`, handles leetspeak (`sh1t`, `b!tch`) and Cyrillic/Greek look-alike swaps.
2. **Multilingual lexicon** (instant, offline, runs on every keystroke): profanity seed terms for ~40 languages plus hate terms tagged by category (`HATE_TERMS` in `src/lexicon.js`). Space-less scripts (Chinese, Japanese, Thai…) use substring matching; others use Unicode-aware word boundaries so "class" or "Scunthorpe" aren't flagged.
3. **AI provider** (optional, async, debounced): catches context, sarcasm, coded hate, polite-sounding colorism or sexism, and languages the lexicon doesn't cover. The included server (`server/`) uses Claude; or plug in `transformersProvider` (on-device model), or any `async (text) => ({score, labels})`.

Settings: `threshold`, `failMode` (`'open'` allows on provider error, `'closed'` blocks), `timeoutMs`, `debounceMs`, `disableWhilePending`.

## Integrate

```js
import { SafeSend, httpProvider } from './src/safesend.js';

const guard = new SafeSend({
  provider: httpProvider('/api/moderate'),   // optional
  failMode: 'closed',
  disableWhilePending: true,
});
const detach = guard.attach({ input, sendButton, hint });  // hint = element for the message
```

Works with `<input>`, `<textarea>`, `contenteditable`; React/Vue/RN-web: call `attach` in an effect/mounted hook and use the returned `detach` as cleanup. Server-side: call `guard.check(text)` (or your own moderation) before accepting a message, since client checks can be bypassed.

## AI moderation server (Claude)

`server/server.mjs` serves the demo and `POST /api/moderate` (`{"text": "..."}` -> `{"score", "labels", "source"}`). It checks the word list first (free, instant) and only asks Claude about messages the list doesn't catch, caching results. Claude reads any language, script, transliteration (Hinglish, Arabizi…) and mixed-language text, and labels: `insult, profanity, harassment, threat, self_harm, sexual, racism, colorism, fascism, sexism, ableism, other_hate`.

```
npm start      # put ANTHROPIC_API_KEY in .env first; open http://localhost:8787/
```

Env: `MODERATION_MODEL` (default `claude-opus-5-5`; `claude-haiku-5-5` is much cheaper and faster per check), `MODERATION_EFFORT` (default `low`), `PORT` (8787). Keep the key on the server, never in the app.

## Report, appeal and moderator review

- **Appeal**: when a message is blocked, the chat shows "Not offensive? Ask for a review". The message goes to the review queue (`POST /api/appeals`).
- **Report**: every delivered message has a Report button with a reason (hate speech, harassment, threat, sexual, spam, other) (`POST /api/reports`).
- **Review**: moderators sign in at `/review.html` with `MODERATOR_TOKEN` from `.env`. Approving an appeal delivers the message; removing a report deletes the message from the chat. Review is off until `MODERATOR_TOKEN` is set.
- Messages, appeals and reports are saved to `data/safesend.json` (git-ignored, never served). These need the Node server, so they are hidden on GitHub Pages.

## No override, but it explains itself

- There is no "send anyway": a blocked message can only be delivered by a moderator approving an appeal.
- Every block says what was flagged and why ("Flagged: “…”. It puts someone down for the colour of their skin." or the AI's one-sentence reason in the sender's language), so it teaches rather than just refuses.
- **Sensitivity** (relaxed 0.7 / balanced 0.5 / strict 0.3 AI score) is set by moderators on `/review.html`, never by users. Start value: `MODERATION_SENSITIVITY` in `.env`. Word-list matches are always blocked.
- Server logs record only the category of a blocked message, never its text. Messages, appeals and reports (needed for review) are stored in `data/safesend.json`.

## Test across dialects and languages

`eval/samples.json` holds 41 real-world messages: African American English, Indian English, Hinglish, Tamil-English, Nigerian Pidgin, Singlish, Scots, Patois, 9 other languages, discussion of hate (which must be allowed), coded hate and emoji.

```
npm run eval        # word list only (free)
npm run eval:ai     # word list + Claude (about 40 API calls)
npm run eval:ai -- --sensitivity strict
```

It reports over-blocking (normal speech blocked) and misses (harmful messages allowed). Add your users' own languages and slang before launch.

## Run

```
npm test                # word-list + server tests (no API key needed)
npm start               # site + server at http://localhost:8787/; AI check needs ANTHROPIC_API_KEY in .env
```

## Host the site on GitHub Pages

`index.html` at the repo root is the product page with the live demo. GitHub Pages serves static files only, so there it runs on the word list alone (on device, free, instant) and labels itself "Word-list mode". The AI check and server gate need the Node server (`npm start`) on a host that runs Node.

1. Push the repo to GitHub (`.env` and `node_modules/` are git-ignored, so your key is never uploaded).
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, pick your branch and **/ (root)**, then **Save**.
3. After a minute the site is live at `https://<your-username>.github.io/<repo-name>/`.

## Honest limits

- **No detector catches everything in every language.** The seed lexicon is small and the lexicon layer does not understand context. The AI layer is strong in widely used languages and weaker in low-resource languages and new slang; test it on the languages your users actually write. For real coverage, add a multilingual ML provider, extend the lexicon (`createLexicon(myTerms, { merge: true })`), and tune the threshold on your own data.
- **False positives and negatives are inevitable** (reclaimed words, quoted text, sarcasm, new slang). Provide a way for users to appeal or report, and log verdicts via `onVerdict` for review.
- **A third-party keyboard (Android IME / iOS keyboard extension) cannot disable another app's Send button.** The OS doesn't allow it. This SDK must be integrated in the host app. The same logic can be ported to Kotlin/Swift for a native version.
- Client-side checks are bypassable. Enforce on the server too.
