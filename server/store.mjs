// Messages, appeals and reports. Kept in memory, and saved to a JSON file when one is given
// (data/safesend.json from server.mjs, git-ignored) so reviews survive a restart.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const LIMIT = 1000;

/** Load a store from `file` (missing file = empty store). */
export async function loadStore(file) {
  let saved = {};
  try { saved = JSON.parse(await readFile(file, 'utf8')); } catch { /* first run */ }
  return createStore({ file, saved });
}

/** In-memory store; pass `file` to save every change there. */
export function createStore({ file = null, saved = {} } = {}) {
  const data = { nextId: 1, messages: [], appeals: [], reports: [], ...saved };

  let writing = Promise.resolve();
  const save = () => {
    if (!file) return writing;
    const snapshot = JSON.stringify(data, null, 2);
    writing = writing.then(async () => {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, snapshot);
    }).catch((e) => console.error('could not save moderation data:', e.message));
    return writing;
  };
  const push = (list, item) => {
    item = { id: data.nextId++, ...item, at: new Date().toISOString() };
    data[list].push(item);
    if (data[list].length > LIMIT) data[list].shift();
    save();
    return item;
  };

  return {
    data,
    save,
    addMessage: (text) => push('messages', { text }),
    addAppeal: (text, labels) => push('appeals', { text, labels, status: 'pending' }),
    addReport: (message, reason) => push('reports', { messageId: message.id, text: message.text, reason, status: 'open' }),
    removeMessage(id) {
      const i = data.messages.findIndex((m) => m.id === id);
      if (i >= 0) data.messages.splice(i, 1);
    },
  };
}
