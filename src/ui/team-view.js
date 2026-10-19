// team-view.js — the Team page as your people: who is on your team, what each is doing now or when they last
// worked, and a status word. Plain JS, so a test can import it.

const RANK = { working: 0, waiting: 1, idle: 2 };

/**
 * One row per person on the people list (frame.people), in list order, then anyone else a session is named for.
 * -> [{ name, title, state: 'working'|'waiting'|'free', word, count, top (their busiest session, or null), last_at }]
 */
export function peopleRows(people, sessions) {
  const by = new Map();
  for (const s of sessions || []) {
    const p = s.display && s.display.person;
    if (!p) continue;
    if (!by.has(p)) by.set(p, []);
    by.get(p).push(s);
  }
  const names = (people || []).map((p) => p.name);
  for (const p of by.keys()) if (!names.includes(p)) names.push(p);
  const titles = new Map((people || []).map((p) => [p.name, p.title || null]));
  return names.map((name) => {
    const mine = (by.get(name) || []).slice()
      .sort((a, b) => (RANK[a.state] ?? 3) - (RANK[b.state] ?? 3) || (b.last_at || 0) - (a.last_at || 0));
    const top = mine[0] || null;
    const state = top && top.state === 'working' ? 'working' : top && top.state === 'waiting' ? 'waiting' : 'free';
    return {
      name,
      title: titles.get(name) || null,
      state,
      word: state === 'working' ? 'Working' : state === 'waiting' ? 'Waiting' : 'Free',
      count: mine.length,
      top,
      last_at: mine.reduce((t, s) => Math.max(t, s.last_at || 0), 0) || null,
    };
  });
}
