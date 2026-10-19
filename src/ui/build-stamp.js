// build-stamp.js — an open page picks up new code by itself. The office reads a stamp of the code it
// serves when it starts (GET /api/build, and `build` on every frame). The page keeps the first stamp it saw; when the
// office comes back on different code, the page reloads on the route it is on (the #route stays in the address).
// A missing stamp never reloads, so a page cannot loop. Plain JS, so a test can import it.

export const CHECK_MS = 60000;

/** see(stamp) -> true when the page should reload (and calls reload once). */
export function createBuildWatch(reload) {
  let first = null;
  let done = false;
  return function see(stamp) {
    if (done || typeof stamp !== 'string' || !stamp) return false;
    if (!first) { first = stamp; return false; }
    if (stamp === first) return false;
    done = true;
    reload();
    return true;
  };
}

/** Asks the office for its stamp now and every CHECK_MS, and when the page comes back into view. -> stop() */
export function startBuildCheck(see, fetchFn, win) {
  const ask = () => fetchFn('/api/build', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d) see(d.build); })
    .catch(() => { /* the office is restarting: the next check or frame tells */ });
  const id = setInterval(ask, CHECK_MS);
  const onVisible = () => { if (!win.document || win.document.visibilityState === 'visible') ask(); };
  if (win.document) win.document.addEventListener('visibilitychange', onVisible);
  ask();
  return () => { clearInterval(id); if (win.document) win.document.removeEventListener('visibilitychange', onVisible); };
}
