// Pulse.jsx — the top of the floor: a greeting for the hour (your own time) and the office's pulse in
// one line - who is at a desk, who is heads down, who is waiting on you, who just talked - and a
// button that clears the idle seats off the floor.

import { useState } from 'react';

const TALK_MS = 15 * 60 * 1000;

/** Clear seats off the floor (server seats.js): hides idle ones until they next do something; stops nothing. */
export async function clearSeats(token, keys) {
  try {
    const res = await fetch('/api/seats/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Office-Token': token || '' },
      body: JSON.stringify({ keys }),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok && body.ok !== false, text: body.message || body.error || (res.ok ? 'Done.' : 'The office could not do that.') };
  } catch {
    return { ok: false, text: 'Could not reach the office.' };
  }
}

function hourHere(t) {
  return new Date(t).getHours();
}

export function greeting(t) {
  const h = hourHere(t);
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Night shift';
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default function Pulse({ sessions, flows, questions, asOf, onQuestions, brand, owner, token }) {
  const [said, setSaid] = useState(null);
  const [busy, setBusy] = useState(false);
  const here = sessions.length;
  const working = sessions.filter((s) => s.state === 'working').length;
  const waiting = sessions.filter((s) => s.state === 'waiting').length;
  const talked = (flows || []).filter((f) => f.at && asOf - f.at < TALK_MS).length;
  const asks = (questions || []).length;
  // A session with a question open for you keeps its seat, so it is not offered for clearing.
  const asking = new Set((questions || []).map((q) => `${q.machine}:${q.session_id}`));
  const idle = sessions.filter((s) => s.state === 'idle' && !asking.has(`${s.machine}:${s.id}`));
  const clearIdle = async () => {
    setBusy(true);
    const r = await clearSeats(token, idle.map((s) => `${s.machine}:${s.id}`));
    setBusy(false);
    setSaid(r.text);
    setTimeout(() => setSaid(null), 9000);
  };
  const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(asOf));
  return (
    <section className={`pulse ${working > 0 ? 'is-busy' : ''}`} aria-label="the office right now">
      <p className="pulse-eyebrow">{[brand, clock].filter(Boolean).join(' · ')}</p>
      <h1 className="pulse-hello">{greeting(asOf)}{owner ? `, ${owner}` : ''}<span className="pulse-dot" aria-hidden="true" /></h1>
      <ul className="pulse-stats">
        <li><strong>{here}</strong> at {here === 1 ? 'a desk' : 'their desks'}</li>
        <li className={working > 0 ? 'is-on' : ''}><strong>{working}</strong> heads down</li>
        {waiting > 0 && <li><strong>{waiting}</strong> waiting</li>}
        {talked > 0 && <li><strong>{talked}</strong> {talked === 1 ? 'conversation' : 'conversations'} lately</li>}
        {asks > 0 && (
          <li className="pulse-ask">
            <button type="button" onClick={onQuestions}>{plural(asks, 'question', 'questions')} for you</button>
          </li>
        )}
        {idle.length > 0 && token && (
          <li className="pulse-clear">
            <button type="button" disabled={busy} onClick={clearIdle} title="Takes quiet seats off the floor until they do something new. Stops nothing.">
              {busy ? 'Clearing…' : `Clear ${plural(idle.length, 'idle seat', 'idle seats')}`}
            </button>
          </li>
        )}
      </ul>
      <p className="pulse-said" role="status" aria-live="polite">{said || ''}</p>
    </section>
  );
}
