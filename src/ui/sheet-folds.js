// sheet-folds.js — which parts of a session's sheet you keep open: what it is doing (its feed), its job, its helpers
// and the conversation. Remembered in this browser, per part (not per session), so a part you closed stays closed on
// every sheet. The message box is never a part: it is always on screen. Plain JS, so a test can import it.

const STORE = 'workspace.sheet.folds.v1';
export const PARTS = ['working', 'job', 'helpers', 'conversation'];

/** { part: open } this browser kept; a part never touched is open. Storage can be missing or throw. */
export function loadFolds(storage) {
  try {
    const raw = storage && storage.getItem(STORE);
    const v = raw ? JSON.parse(raw) : {};
    const out = {};
    for (const k of PARTS) if (typeof v[k] === 'boolean') out[k] = v[k];
    return out;
  } catch {
    return {};
  }
}

export const isOpen = (folds, part) => folds[part] !== false;

/** The map with one part set, over what the store holds now (two folds on one sheet never undo each other); saved
 * when the store lets it. */
export function setFold(storage, folds, part, open) {
  const next = Object.assign({}, folds, loadFolds(storage), { [part]: !!open });
  try { if (storage) storage.setItem(STORE, JSON.stringify(next)); } catch { /* private window: kept for this page only */ }
  return next;
}
