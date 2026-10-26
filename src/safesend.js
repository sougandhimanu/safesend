import { variants } from './normalize.js';
import { createLexicon, stripAllowed, SUPPORT_TERMS } from './lexicon.js';

const LABEL_TEXT = {
  racism: 'racist', colorism: 'colorist', fascism: 'fascist or extremist', sexism: 'sexist',
  ableism: 'demeaning toward disabled people or people with mental illness', homophobia: 'homophobic or transphobic',
  casteism: 'casteist', religious_hate: 'hateful toward a religion', regionalism: 'insulting toward people from a region or tribe',
  appearance: 'like body shaming', ageism: 'ageist', classism: 'insulting toward people for being poor',
  other_hate: 'hateful', threat: 'threatening', self_harm: 'harmful',
};

/** Default blocked hint: names the category when it is a hate category. */
export function blockedMessage({ labels = [] } = {}) {
  const what = labels.map((l) => LABEL_TEXT[l]).find(Boolean) ?? 'abusive or offensive';
  return `This message looks ${what} and can't be sent.`;
}

const WHY = {
  abuse: 'Swearing at someone or insulting them hurts, even as a joke.',
  insult: 'Insults hurt, even as a joke.',
  profanity: 'Swearing at someone hurts, even as a joke.',
  harassment: 'This could make the other person feel attacked or unwelcome.',
  threat: 'Threatening someone can make them feel unsafe.',
  self_harm: 'Telling someone to hurt themselves can do real harm.',
  sexual: 'Unwanted sexual messages make people feel unsafe.',
  racism: 'It attacks people for their race, ethnicity or where they come from.',
  colorism: 'It puts someone down for the colour of their skin.',
  fascism: 'It praises hate movements or calls for violence against a group.',
  sexism: 'It puts people down because of their gender.',
  ableism: 'It mocks disability or mental illness.',
  homophobia: 'It attacks people for who they love or who they are.',
  casteism: 'It puts people down because of their caste.',
  religious_hate: 'It attacks people because of their religion.',
  regionalism: 'It puts people down for where they or their family come from.',
  appearance: "It mocks how someone's body looks.",
  ageism: 'It puts people down because of their age.',
  classism: 'It looks down on people for being poor or for the work they do.',
  other_hate: 'It attacks people for who they are.',
};

/** Support matcher: someone writing about hurting themselves. Never blocks; the app should offer help. */
export const createSupportMatcher = () => createLexicon(SUPPORT_TERMS, { hate: null, disguised: null });

/** Why a verdict blocked: the AI's own explanation, or the category's explanation plus the flagged word. */
export function explainVerdict({ labels = [], term = null, explanation = '' } = {}) {
  if (explanation) return explanation;
  const why = WHY[labels.find((l) => WHY[l]) ?? 'abuse'];
  return term ? `Flagged: “${term}”. ${why}` : why;
}

/**
 * SafeSend: keeps a send button disabled while the text in an input is abusive/offensive.
 *
 * const guard = new SafeSend({ provider, threshold: 0.8 });
 * const detach = guard.attach({ input, sendButton, hint });
 */
export class SafeSend {
  constructor({
    provider = null,          // async (text, {signal}) => {score, labels}
    lexicon = createLexicon(),// (variants) => matchedTerm | null
    threshold = 0.8,          // provider score at/above this blocks sending
    failMode = 'open',        // provider error/timeout: 'open' = allow, 'closed' = block
    timeoutMs = 1500,
    debounceMs = 150,
    disableWhilePending = false, // keep send disabled until the ML check returns
    messages = {},            // { blocked: string | (verdict) => string, pending: string }; merged over defaults
    onVerdict = null,         // ({blocked, reason, term, score, support, text}) => void
    allow = [],               // words moderators marked "always allow", e.g. real names
    support = createSupportMatcher(), // (variants) => match | null; sets verdict.support, never blocks
  } = {}) {
    messages = { blocked: blockedMessage, pending: 'Checking…', ...messages };
    Object.assign(this, { provider, lexicon, threshold, failMode, timeoutMs, debounceMs, disableWhilePending, messages, onVerdict, allow, support });
    this.cache = new Map();
  }

  /** Replace the "always allow" list (e.g. after moderators change it). */
  setAllow(words = []) { this.allow = words; this.cache.clear(); }

  _match(text) { return this.lexicon(variants(stripAllowed(text, this.allow))); }
  _needsSupport(text) { return Boolean(this.support?.(variants(text))); }

  /**
   * Check text. Resolves { blocked, reason: 'lexicon'|'model'|'error'|null, term?, score?, labels?, explanation?, support }.
   * `support` is true when the sender seems to be writing about hurting themselves: show help, don't block.
   */
  async check(text, { signal } = {}) {
    const clean = String(text ?? '');
    if (!clean.trim()) return { blocked: false, reason: null, support: false };
    if (this.cache.has(clean)) return this.cache.get(clean);
    const support = this._needsSupport(clean);

    const term = this._match(clean);
    if (term) return this._remember(clean, { ...this._lexiconVerdict(term), support });

    if (this.provider) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      const onAbort = () => ctrl.abort();
      signal?.addEventListener('abort', onAbort);
      try {
        const r = await Promise.race([
          this.provider(clean, { signal: ctrl.signal }),
          new Promise((_, rej) => ctrl.signal.addEventListener('abort', () => rej(new Error('timeout')))),
        ]);
        const blocked = (r?.score ?? 0) >= this.threshold;
        const labels = r?.labels ?? [];
        const verdict = { blocked, reason: blocked ? 'model' : null, score: r?.score ?? 0, labels, explanation: blocked ? r?.explanation ?? '' : '', support: support || labels.includes('crisis') };
        return this._remember(clean, verdict);
      } catch (e) {
        if (signal?.aborted) throw e; // superseded by newer keystroke; caller ignores
        return { blocked: this.failMode === 'closed', reason: 'error', error: String(e?.message ?? e), support }; // not cached
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
    }
    return this._remember(clean, { blocked: false, reason: null, support });
  }

  _lexiconVerdict(term) {
    return { blocked: true, reason: 'lexicon', term, labels: [this.lexicon.labelOf?.(term) ?? 'abuse'] };
  }

  _remember(text, verdict) {
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(text, verdict);
    return verdict;
  }

  /**
   * Attach to DOM elements. Disables the send button, blocks Enter/form-submit, and re-disables
   * the button if the host app tries to re-enable it while text is blocked.
   * Returns a detach() function.
   */
  attach({ input, sendButton, hint = null, form = null }) {
    const getText = () => ('value' in input ? input.value : input.innerText);
    let blocked = false, pending = false, timer = null, ctrl = null, seq = 0, applying = false, verdict = null;
    const blockedText = () => (typeof this.messages.blocked === 'function' ? this.messages.blocked(verdict ?? {}) : this.messages.blocked);

    const apply = () => {
      const shouldDisable = blocked || (pending && this.disableWhilePending);
      applying = true;
      sendButton.disabled = shouldDisable;
      sendButton.setAttribute('aria-disabled', String(shouldDisable));
      sendButton.dataset.safesend = blocked ? 'blocked' : pending ? 'pending' : 'ok';
      applying = false;
      if (hint) {
        hint.textContent = blocked ? blockedText() : pending && this.disableWhilePending ? this.messages.pending : '';
        hint.setAttribute('role', 'status');
      }
    };

    const run = async () => {
      const mine = ++seq;
      ctrl?.abort();
      ctrl = new AbortController();
      const text = getText();
      pending = true; apply();
      try {
        const v = await this.check(text, { signal: ctrl.signal });
        if (mine !== seq) return; // stale
        verdict = v; blocked = v.blocked; pending = false; apply();
        this.onVerdict?.({ ...v, text });
      } catch { /* superseded */ }
    };

    const schedule = () => {
      clearTimeout(timer);
      // Lexicon is instant: evaluate synchronously so the button never lags behind typing.
      const text = getText();
      const quick = text.trim() ? this._match(text) : null;
      const support = text.trim() ? this._needsSupport(text) : false;
      if (quick) { seq++; ctrl?.abort(); verdict = { ...this._lexiconVerdict(quick), support }; blocked = true; pending = false; apply(); this.onVerdict?.({ ...verdict, text }); return; }
      if (!text.trim()) { seq++; ctrl?.abort(); blocked = false; pending = false; apply(); this.onVerdict?.({ blocked: false, reason: null, support: false, text }); return; }
      if (!this.provider) { blocked = false; pending = false; apply(); this.onVerdict?.({ blocked: false, reason: null, support, text }); return; }
      blocked = false; pending = true; apply();
      timer = setTimeout(run, this.debounceMs);
    };

    const stopIfBlocked = (e) => {
      if (blocked || (pending && this.disableWhilePending)) { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) stopIfBlocked(e); };

    const mo = new MutationObserver(() => {
      if (applying) return;
      if ((blocked || (pending && this.disableWhilePending)) && !sendButton.disabled) apply();
    });
    mo.observe(sendButton, { attributes: true, attributeFilter: ['disabled'] });

    const f = form ?? input.form ?? sendButton.form;
    input.addEventListener('input', schedule);
    input.addEventListener('compositionend', schedule);
    input.addEventListener('keydown', onKey, true);
    sendButton.addEventListener('click', stopIfBlocked, true);
    f?.addEventListener('submit', stopIfBlocked, true);
    schedule();

    return () => {
      clearTimeout(timer); ctrl?.abort(); mo.disconnect();
      input.removeEventListener('input', schedule);
      input.removeEventListener('compositionend', schedule);
      input.removeEventListener('keydown', onKey, true);
      sendButton.removeEventListener('click', stopIfBlocked, true);
      f?.removeEventListener('submit', stopIfBlocked, true);
      sendButton.disabled = false; sendButton.removeAttribute('aria-disabled'); delete sendButton.dataset.safesend;
      if (hint) hint.textContent = '';
    };
  }
}

export { createLexicon, stripAllowed, SEED_TERMS, HATE_TERMS, SUPPORT_TERMS } from './lexicon.js';
export { variants } from './normalize.js';
export * from './providers.js';
