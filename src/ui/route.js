// route.js — where the office is, kept in the address after the #.
//
// Hash routes, so the server needs no change:
//   #/floor/<machine>                 the floor, one machine or all
//   #/floor/<machine>/<session-key>   a session's panel over that floor
//   #/work   #/work/<project>   #/step/<project>/<id>
//   #/agents   #/questions   #/chat
// Opening a session, project or step pushes history, so the phone's Back
// closes it instead of leaving the office.

const TABS = new Set(['floor', 'work', 'step', 'agents', 'questions', 'chat']);

export function parseRoute(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map((p) => {
    try { return decodeURIComponent(p); } catch { return p; }
  });
  const head = parts[0];
  if (!TABS.has(head)) return null;
  if (head === 'floor') return { tab: 'floor', machine: parts[1] || null, session: parts[2] || null };
  if (head === 'work') return { tab: 'work', project: parts[1] || null };
  if (head === 'step') {
    if (!parts[1]) return { tab: 'work' };
    return parts[2] ? { tab: 'work', project: parts[1], step: parts[2] } : { tab: 'work', project: parts[1] };
  }
  return { tab: head };
}

export function formatRoute(r) {
  const e = encodeURIComponent;
  if (r.tab === 'floor') {
    return `#/floor/${e(r.machine || 'all')}${r.session ? `/${e(r.session)}` : ''}`;
  }
  if (r.tab === 'work') {
    if (r.project && r.step) return `#/step/${e(r.project)}/${e(r.step)}`;
    return r.project ? `#/work/${e(r.project)}` : '#/work';
  }
  return `#/${r.tab}`;
}

// The view one step up: what a Back arrow shows when there is no history to
// walk (a deep link opened in a fresh tab).
export function parentRoute(r, machine) {
  if (r.tab === 'floor') return { tab: 'floor', machine: r.machine || machine };
  if (r.step) return { tab: 'work', project: r.project };
  if (r.project) return { tab: 'work' };
  return { tab: 'floor', machine };
}

// The old links: /?questions (a tapped notification) and /?work (a bookmark).
// Returns the route they mean and tidies the query away, or null.
export function legacyRoute(href) {
  const url = new URL(href);
  let r = null;
  if (url.searchParams.has('questions')) r = { tab: 'questions' };
  else if (url.searchParams.has('work')) r = { tab: 'work' };
  if (!r) return null;
  url.searchParams.delete('questions');
  url.searchParams.delete('work');
  return { route: r, path: url.pathname + url.search };
}
