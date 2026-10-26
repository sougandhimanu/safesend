# SafeSend

**No one should have to read hate. SafeSend stops it before it's sent.**

SafeSend keeps a chat app's **Send** button off (and blocks Enter and form submits) while a message is abusive or hateful: insults, swearing and threats, and hate speech (racism, colorism, caste abuse, religious hate, insults about someone's region or tribe, sexism, homophobia and transphobia, ableism and mental-health insults, body shaming, ageism, insults about being poor, and fascism or extremism). Every block says what was caught and why. There is no "send anyway": only a moderator can approve a blocked message.

- **Website and live demo:** https://sougandhimanu.github.io/safesend/

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

1. **Normaliser** (on device): undoes common disguises, such as spaced-out or repeated letters, numbers and symbols in place of letters, invisible characters, and look-alike letters from other alphabets.
2. **Word list** (on device, instant, free): swearing in about 40 languages plus hate terms tagged by category (`src/lexicon.js`). It matches whole words, so normal words that happen to contain a bad word aren't flagged.
   - Ordinary words that can also be used as insults are allowed when used normally. Slurs, insulting phrases and disguised versions are blocked.
3. **AI check** (optional, on your server): Claude judges messages the word list doesn't catch, in context and in any language, including transliterated and mixed text such as Hinglish. It catches coded hate, polite-sounding colorism or sexism, and sarcasm, treats dialects (African American English, Nigerian Pidgin, Singlish…) as normal speech, and writes a one-line reason in the sender's language.
4. **Server gate**: the server checks every message again before delivering it, so bypassing the app doesn't get abuse through.

## Server

`server/server.mjs` serves the website and the API:

| Endpoint | What it does |
|---|---|
| `POST /api/messages` `{text}` | Checks the message and delivers it (`201`) or refuses it (`422` with `labels`, `term`, `reason`) |
| `GET /api/messages` | Delivered messages |
| `POST /api/moderate` `{text}` | Check only: `{score, labels, source, term?, reason?, language?}`, for the live check while typing |
| `POST /api/appeals` `{text}` | A blocked user asks a moderator to review their message |
| `POST /api/reports` `{messageId, reason}` | A user reports a delivered message |
| `GET /api/review`, `POST /api/review/{appeals,reports}/:id`, `POST /api/review/settings`, `POST /api/review/allowlist` | Moderators only (`MODERATOR_TOKEN`) |
| `GET /api/allowlist` | Words moderators marked "always allow" |
| `GET /api/health` | Whether the AI check is on, and the current sensitivity |

The word list runs first (free, instant); only messages it doesn't catch go to Claude, and results are cached. AI labels: `insult, profanity, harassment, threat, self_harm, sexual, racism, colorism, fascism, sexism, ableism, homophobia, casteism, religious_hate, regionalism, appearance, ageism, classism, other_hate, crisis`.

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
- **Always allow:** moderators can add real names or words that look like bad words (for example a surname), so the word list never blocks them.
- **Support, not blocking:** if someone writes about hurting themselves, the message is not blocked. They see a kind note with a helpline for their country (India, US, Canada, UK, Ireland, Australia, New Zealand) and a link to find one anywhere. Telling someone else to hurt themselves is still blocked.
- **Privacy:** server logs record only the category of a blocked message, never its text. Messages, appeals and reports are saved in `data/safesend.json` (git-ignored, never served) because moderators need to read them.

## Test across dialects and languages

`eval/samples.json` has 41 real-world messages: African American English, Indian English, Hinglish, Tamil-English, Nigerian Pidgin, Singlish, Scots, Jamaican Patois, nine other languages, discussion of hate (which must be allowed), coded hate and emoji.

```
npm run eval                              # word list only (free)
npm run eval:ai                           # word list + Claude (about 40 API calls)
npm run eval:ai -- --sensitivity strict
```

It reports over-blocking (normal speech blocked) and misses (harmful messages allowed). With the word list alone, it over-blocks 1 of 24 normal messages and misses 16 of 17 harmful ones written without slurs. That's why the AI check matters. Add your own users' languages and slang before launch.

## Planned improvements

### Culture and language
- Use different word lists for different countries, because a word can be friendly in one country and rude in another.
- Let each community decide how to handle reclaimed words.
- Check emojis, because emojis can be used to insult people too.
- Have native speakers check the word lists for every language.

### Respect and fairness
- Show SafeSend's messages in the user's own language, not just English.
- Display Arabic, Urdu and Hebrew correctly, from right to left.

### Safety
- Notice when one person keeps sending hurtful messages to the same person.
- Protect children from sexual messages and from adults trying to groom them.
- Stop people from sharing someone's phone number or address to threaten them.
- Check images, voice notes, GIFs and stickers, not just text.
- Let moderators warn, mute or ban people who keep breaking the rules.

### Quality and launch
- Test SafeSend with many more real messages in every language.
- Learn from appeals, so the same mistake doesn't happen twice.
- Add a privacy policy and follow children's privacy laws.

## Honest limits

- **No filter catches everything in every language.** The word list is small and can't read context. The AI check is strong in widely used languages and weaker in rare ones and brand-new slang.
- **Mistakes happen** (quoted text, sarcasm, new slang, innocent words that look offensive when spelled out letter by letter). That's what appeal, report and moderator review are for.
- **A phone keyboard can't turn off another app's Send button.** Android and iOS don't allow it, so SafeSend has to be built into the chat app. A SafeSend keyboard is on the roadmap.