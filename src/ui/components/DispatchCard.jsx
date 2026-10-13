// DispatchCard.jsx — a session the office started, up close (dispatch.js): who handed it the work, its model, effort,
// hands and cap, where its turn stands, Stop / Close / Reopen, and what it was asked. Also the team a session has
// handed work down to, and useTalk: its own conversation (the brief, your notes, its helpers' reports, each turn's
// final reply), read from its transcript by the office on request.

import { useEffect, useState } from 'react';
import Avatar from './Avatar.jsx';
import { Status } from './Desk.jsx';
import { dispatchAct } from './Dispatch.jsx';
import { formatClock } from '../useOfficeStream.js';

const EFFORT = { low: 'low', medium: 'medium', high: 'high', xhigh: 'extra high', max: 'max' };

/** One line on where its turn stands. */
export function turnLine(j, asOf, ago) {
  const t = j.turn || {};
  // A start sent to another computer, not started yet (mesh-dispatch.js): on its way, or that computer's reason why not.
  if (j.start) return j.status === 'failed' ? j.reason : `Sent to ${j.machine}. It starts there within a minute.`;
  // The last word from a computer that stopped reporting.
  if (j.stale) return j.stale;
  if (j.status === 'working') return `Turn ${t.n || j.turns + 1} · ${t.steps || 0} step${t.steps === 1 ? '' : 's'} so far · running ${ago(j.running_since || t.started_at)}`;
  if (j.status === 'starting') return 'Starting up…';
  if (j.status === 'closed') return 'Closed. Notes to it wait until you reopen it.';
  if (j.paused) return j.paused;
  if (j.status === 'stopped' || j.status === 'failed') return j.reason || 'Stopped.';
  if (!j.turns) return 'Waiting for its first turn.';
  const done = t.ended_at ? `${ago(t.ended_at)} ago` : '';
  return `${j.turns} turn${j.turns === 1 ? '' : 's'} · ${j.steps} step${j.steps === 1 ? '' : 's'} · last finished ${done}. ${j.parent ? 'Its report went to its lead.' : 'A note from you starts its next turn.'}`;
}

/** The facts as small chips: model, effort, hands, cap. */
export function JobChips({ j }) {
  return (
    <span className="jchips">
      <span className={`jchip tone-${familyOf(j.model_id)}`}><i className="jchip-dot" aria-hidden="true" />{j.model_label}</span>
      <span className="jchip">{EFFORT[j.effort] || j.effort} effort</span>
      <span className="jchip">{j.hands_label} hands</span>
      <span className="jchip">{j.cap_min} min cap</span>
    </span>
  );
}

export function familyOf(model) {
  const m = String(model || '').toLowerCase();
  for (const f of ['opus', 'fable', 'sonnet', 'haiku']) if (m.includes(f)) return f;
  return 'unknown';
}

/** The conversation of a session the office started. Asks again whenever its turn count or status moves. */
export function useTalk(s) {
  const j = s.dispatch;
  const [talk, setTalk] = useState(null);
  // talk_v: when the hub last kept the conversation of a session on another computer (it can come a feed later).
  const tickKey = j ? `${j.id}:${j.turns}:${j.status}:${j.pending}:${j.talk_v || ''}` : null;
  useEffect(() => {
    if (!j) { setTalk(null); return undefined; }
    let live = true;
    fetch(`/api/dispatch/${encodeURIComponent(j.id)}/talk`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((out) => { if (live) setTalk(out && out.ok ? out : { ok: false, items: [] }); })
      .catch(() => { if (live) setTalk({ ok: false, items: [] }); });
    return () => { live = false; };
  }, [tickKey]);
  return talk;
}

export default function DispatchCard({ s, token, ago, asOf }) {
  const j = s.dispatch;
  const [said, setSaid] = useState(null);
  const [busy, setBusy] = useState(false);
  const press = async (verb) => {
    setBusy(true);
    setSaid(await dispatchAct(token, j.id, verb));
    setBusy(false);
  };
  const by = `${j.parent ? `Handed down by ${j.parent.name}` : 'Started by you from the office'} · on ${j.machine}`;
  if (j.start) {
    // Not a session yet: Close takes it back while it is on its way, and clears a refusal off the floor.
    return (
      <section className="jcard jcard-start">
        <div className="jcard-head">
          <h3>{by}</h3>
          <span className="jcard-at">{formatClock(j.created_at)}</span>
        </div>
        <JobChips j={j} />
        <p className="jcard-turn">{turnLine(j, asOf, ago)}</p>
        {token && (
          <div className="jcard-actions">
            <button type="button" className="jbtn" disabled={busy} onClick={() => press('close')}>{j.status === 'failed' ? 'Clear' : 'Take it back'}</button>
          </div>
        )}
        {said && <p className="jcard-said" role="status">{said}</p>}
      </section>
    );
  }
  return (
    <section className="jcard">
      <div className="jcard-head">
        <h3>{by}</h3>
        <span className="jcard-at">{formatClock(j.created_at)}</span>
      </div>
      <JobChips j={j} />
      <p className="jcard-turn">{turnLine(j, asOf, ago)}</p>
      {j.person && <p className="jcard-who">{j.person} sits in the chair{j.role ? `: ${j.role}` : ''}.</p>}
      {token && !j.parent && (
        <label className="dcheck">
          <input type="checkbox" checked={!!j.notify} disabled={busy} onChange={(e) => press(e.target.checked ? 'notify' : 'quiet')} />
          Buzz my phone when it replies
        </label>
      )}
      {j.status !== 'working' && j.status !== 'starting' && !j.client_work && (
        <p className="jcard-who">To carry on in a chat instead: /resume in Claude Code on {j.machine}'s Hub, and pick "{j.name}".</p>
      )}
      {j.brief && (
        <details className="jcard-brief">
          <summary>What it was asked</summary>
          <p>{j.brief}</p>
        </details>
      )}
      {token && (
        <div className="jcard-actions">
          {j.status === 'working' || j.status === 'starting'
            ? <button type="button" className="jbtn jbtn-stop" disabled={busy} onClick={() => press('stop')}>Stop this turn</button>
            : null}
          {j.status === 'closed'
            ? <button type="button" className="jbtn" disabled={busy} onClick={() => press('reopen')}>Reopen</button>
            : <button type="button" className="jbtn" disabled={busy} onClick={() => press('close')} title="No more turns. Its conversation stays; you can reopen it.">Close</button>}
        </div>
      )}
      {said && <p className="jcard-said" role="status">{said}</p>}
    </section>
  );
}

/** The sessions this one handed work down to: each with its status and what it is on. */
export function Team({ team, ago, onOpen }) {
  if (!team || !team.length) return null;
  return (
    <section className="jteam">
      <h3>Handed down</h3>
      {team.map((t) => (
        <button key={`${t.machine}:${t.id}`} type="button" className="jteam-row" onClick={() => onOpen(`${t.machine}:${t.id}`)}>
          <Avatar avatar={t.avatar} agent={t.agent} family={t.family} state={t.state === 'done' ? 'idle' : t.state} size={30} />
          <span className="jteam-id">
            <span className="jteam-name">{t.display.name}</span>
            <span className="jteam-sub">{t.dispatch ? `${t.dispatch.model_label} · ${EFFORT[t.dispatch.effort] || t.dispatch.effort}` : ''}</span>
          </span>
          <Status s={t} ago={ago} compact />
        </button>
      ))}
    </section>
  );
}
