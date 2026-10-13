// Panel.jsx — one session up close: what it is doing, who is helping it, and
// one conversation: what it said to other sessions, what they said to it, and
// the notes you sent it, with a box to send another.

import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import Close from './Close.jsx';
import { QuestionCard } from './Questions.jsx';
import { nowText, stepText, modelLabel } from '../words.js';
import { formatClock } from '../useOfficeStream.js';
import { clearSeats } from './Pulse.jsx';
import DispatchCard, { Team, useTalk } from './DispatchCard.jsx';
import Markdown from '../markdown.jsx';

// Take this quiet seat off the floor (server seats.js). It stops nothing; the seat comes back the
// moment the session does anything new.
function ClearSeat({ s, token, onDone }) {
  const [said, setSaid] = useState(null);
  const [busy, setBusy] = useState(false);
  const press = async () => {
    setBusy(true);
    const r = await clearSeats(token, [`${s.machine}:${s.id}`]);
    setBusy(false);
    setSaid(r.text);
    if (r.ok && /^Cleared/.test(r.text)) setTimeout(onDone, 900);
  };
  return (
    <span className="seat-clear-wrap">
      <button type="button" className="seat-clear" disabled={busy} onClick={press} title="Stops nothing. The seat comes back if this session does anything new.">
        {busy ? 'Clearing…' : 'Remove from floor'}
      </button>
      <span className="seat-said" role="status" aria-live="polite">{said || ''}</span>
    </span>
  );
}

function Composer({ s, token }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Office-Token': token || '' },
        body: JSON.stringify({ session_id: s.id, machine: s.machine, text: body }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok && out.ok) setText('');
      else setStatus(out.error || `Not sent (HTTP ${res.status}).`);
    } catch {
      setStatus('Could not reach the office.');
    } finally {
      setBusy(false);
    }
  };

  // A start sent to another computer is not a session yet (mesh-dispatch.js).
  if (s.dispatch && s.dispatch.start) {
    return <p className="composer-off">{s.dispatch.status === 'failed' ? 'It never started, so there is nobody to send a note to.' : `It takes notes once ${s.machine} has started it.`}</p>;
  }
  if (!s.deliverable && !s.dispatch) {
    return <p className="composer-off">This session can't receive notes: it isn't running the office's hooks.</p>;
  }

  return (
    <div className="composer">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        placeholder={`Message ${s.display.person || s.callsign || s.dispatch ? s.display.name : s.client_work ? 'this session' : s.name}…`}
        rows={2}
        maxLength={1500}
        aria-label="message this session"
      />
      <button type="button" className="send" onClick={send} disabled={busy || !text.trim()}>
        {busy ? 'Sending' : 'Send'}
      </button>
      <p className="composer-hint">{status || (s.dispatch
        ? (s.dispatch.status === 'closed' ? 'It is closed: this waits until you reopen it.'
          : s.dispatch.status === 'working' ? 'It reads this at its next step, or right after this turn.'
            : 'This starts its next turn within seconds.')
        : s.waker ? 'It wakes and reads this now.' : 'It reads this the next time it uses a tool.')}</p>
    </div>
  );
}

// One tap puts `/rename Vega-LAPTOP` on the clipboard for the VS Code chat tab.
// Over plain http on the tailnet the clipboard API is refused; the command is
// then shown selected so it can be copied by hand.
function RenameButton({ c }) {
  const [done, setDone] = useState(null);
  const cmd = `/rename ${c.rename}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setDone('Copied');
    } catch {
      setDone(cmd);
    }
  };
  return (
    <span className="rename">
      <button type="button" className="rename-copy" onClick={copy}>Copy {cmd}</button>
      {done && <code className="rename-done">{done}</code>}
    </span>
  );
}

// Keep awake (nudge.js): may the office nudge this session when it sits idle
// with nothing armed? On by default for run seats. This machine's desks only.
function KeepAwake({ s, token }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (s.keep_awake == null || !s.deliverable) return null;
  const flip = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/keep-awake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Office-Token': token || '' },
        body: JSON.stringify({ session_id: s.id, on: !s.keep_awake }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) setError(out.error || `Not changed (HTTP ${res.status}).`);
    } catch {
      setError('Could not reach the office.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <label className="keep-awake">
      <input type="checkbox" checked={!!s.keep_awake} onChange={flip} disabled={busy} />
      <span>Keep awake</span>
      <span className="keep-awake-hint">
        {error || (s.keep_awake ? 'The office nudges it if it sits idle with nothing to wake it.' : 'No nudges from the office.')}
      </span>
    </label>
  );
}

export default function Panel({ s, flows, token, ago, asOf, onClose, question, team, onOpen, onHandDown }) {
  const threadRef = useRef(null);
  // A session the office started: its own conversation, read back from its transcript (dispatch.talk).
  const talk = useTalk(s);

  // One conversation, oldest first: bus messages to or from this session, and
  // your notes to it.
  const items = [];
  for (const f of flows) {
    const out = f.from.session === s.id && f.from.machine === s.machine;
    const inn = f.to.session === s.id && f.to.machine === s.machine;
    if (!out && !inn) continue;
    items.push({ key: f.id, at: f.at, kind: out ? 'out' : 'in', who: out ? `to ${f.to.label}` : `from ${f.from.label}`, text: f.subject });
  }
  const fromTalk = !!(s.dispatch && talk && talk.ok && !talk.client_work);
  if (fromTalk) {
    // Its prompts and replies as it saw them; your notes from the note log only until it has read them.
    talk.items.forEach((t, i) => {
      const report = /^report:/.test(t.who || '');
      items.push(t.kind === 'reply'
        ? { key: `t${i}`, at: t.at, kind: 'reply', who: `${s.display.name}${t.steps ? ` · ${t.steps} step${t.steps === 1 ? '' : 's'}` : ''}`, text: t.text }
        : {
          key: `t${i}`, at: t.at, kind: report ? 'in' : 'you', delivered: t.at,
          who: t.who === 'brief' ? 'You asked' : report ? `Report from ${t.who.slice(7)}` : t.who === 'the owner' || t.who === 'owner' ? 'You' : `From ${t.who}`,
          text: t.text,
        });
    });
  }
  for (const n of s.notes || []) {
    if (fromTalk && n.delivered_at) continue;
    items.push({
      key: n.id, at: n.at, kind: n.from === 'helper' ? 'in' : 'you', delivered: n.delivered_at,
      who: n.from === 'office' ? 'The office' : n.from === 'group' ? 'Group chat' : n.from === 'helper' ? `Report from ${n.from_name || 'a helper'}` : 'You',
      text: n.text,
    });
  }
  items.sort((a, b) => a.at - b.at);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, s.id]);

  const before = (s.before || []).filter(Boolean);

  return (
    <aside className="panel sheet" aria-label={s.display.label}>
      <header className="panel-head">
        <a className="avatar-link" href="#/avatars" title="All avatars"><Avatar avatar={s.avatar} family={s.family} state={s.state} size={44} /></a>
        <div className="panel-id">
          <h2>{s.display.label}</h2>
          {s.display.label !== s.name && !s.dispatch && <p className="panel-title">{s.name}</p>}
          <p>{modelLabel(s.model, s.family)} · {s.machine} · {s.room}{s.display.person && s.callsign && <> · callsign {s.callsign.name}</>}</p>
          {s.display.rename && <RenameButton c={s.display} />}
          {onHandDown && (
            <button type="button" className="hand-down" onClick={() => onHandDown(s)}>Hand work down <span aria-hidden="true">↘</span></button>
          )}
          {s.state === 'idle' && token && !question && <ClearSeat s={s} token={token} onDone={onClose} />}
        </div>
        <Close onClose={onClose} sheet />
      </header>

      <div className="panel-body">
        {question && (
          <section className="panel-question">
            <h3>Waiting on you</h3>
            <QuestionCard q={question} token={token} ago={ago} showFrom={false} />
          </section>
        )}
        <section className={`now now-${s.state}`}>
          <span className="now-label">{s.state === 'working' ? 'Now' : s.state === 'waiting' ? 'Waiting' : 'Idle'}</span>
          <p className="now-text">{nowText(s, ago)}</p>
          {before.length > 0 && s.state !== 'idle' && (
            <p className="now-before">
              Before that: {before.map((b, i) => (
                <span key={i}>{i > 0 && ' · '}{stepText(b)}</span>
              ))}
            </p>
          )}
        </section>

        {s.dispatch && <DispatchCard s={s} token={token} ago={ago} asOf={asOf} />}
        <Team team={team} ago={ago} onOpen={onOpen} />

        {(s.helpers.length > 0 || s.returned.length > 0) && (
          <section className="helpers">
            <h3>Helpers</h3>
            {s.helpers.map((h) => (
              <div key={h.id} className="helper">
                <Avatar avatar={s.avatar} family={h.family} state="working" size={28} faint />
                <div>
                  <p className="helper-task">{h.task || `A ${h.type}`}</p>
                  <p className="helper-now">{h.type} · {stepText(h.now) || 'working'}</p>
                </div>
              </div>
            ))}
            {s.returned.map((h) => (
              <div key={h.id} className="helper helper-back">
                <Avatar avatar={s.avatar} family={h.family} state="idle" size={28} faint />
                <div>
                  <p className="helper-task">{h.task || `A ${h.type}`}</p>
                  <p className="helper-now">came back {ago(h.at)} ago</p>
                </div>
              </div>
            ))}
          </section>
        )}

        <section className="thread-wrap">
          <h3>Conversation</h3>
          <div className="thread" ref={threadRef}>
            {items.length === 0 && <p className="thread-empty">{s.dispatch && talk && talk.client_work
              ? 'Private work: its conversation stays in the session.'
              : s.dispatch ? 'Its first reply shows here when its turn ends.' : 'Nothing said to or by this session in the last 45 minutes.'}</p>}
            {items.map((m) => (
              <div key={m.key} className={`msg msg-${m.kind}`}>
                <span className="msg-who">{m.who} · {formatClock(m.at)}</span>
                {m.kind === 'reply' ? <div className="msg-text msg-md"><Markdown text={m.text} /></div> : <p className="msg-text">{m.text}</p>}
                {m.kind === 'you' && !fromTalk && (
                  <span className="msg-state">{m.delivered ? `read at ${formatClock(m.delivered)}` : 'waiting to be read'}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      <KeepAwake s={s} token={token} />
      <Composer s={s} token={token} />
    </aside>
  );
}
