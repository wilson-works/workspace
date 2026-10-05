// Panel.jsx — one session up close: what it is doing, who is helping it, and
// one conversation: what it said to other sessions, what they said to it, and
// the notes you sent it, with a box to send another.

import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import Close from './Close.jsx';
import { QuestionCard } from './Questions.jsx';
import { nowText, stepText, modelLabel } from '../words.js';
import { formatClock } from '../useOfficeStream.js';

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

  if (!s.deliverable) {
    return <p className="composer-off">This session can't receive notes: it isn't running the office's hooks.</p>;
  }

  return (
    <div className="composer">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        placeholder={`Message ${s.display.person || s.callsign ? s.display.name : s.client_work ? 'this session' : s.name}…`}
        rows={2}
        maxLength={1500}
        aria-label="message this session"
      />
      <button type="button" className="send" onClick={send} disabled={busy || !text.trim()}>
        {busy ? 'Sending' : 'Send'}
      </button>
      <p className="composer-hint">{status || (s.waker ? 'It wakes and reads this now.' : 'It reads this the next time it uses a tool.')}</p>
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

export default function Panel({ s, flows, token, ago, onClose, question }) {
  const threadRef = useRef(null);

  // One conversation, oldest first: bus messages to or from this session, and
  // your notes to it.
  const items = [];
  for (const f of flows) {
    const out = f.from.session === s.id && f.from.machine === s.machine;
    const inn = f.to.session === s.id && f.to.machine === s.machine;
    if (!out && !inn) continue;
    items.push({ key: f.id, at: f.at, kind: out ? 'out' : 'in', who: out ? `to ${f.to.label}` : `from ${f.from.label}`, text: f.subject });
  }
  for (const n of s.notes || []) {
    items.push({ key: n.id, at: n.at, kind: 'you', who: n.from === 'office' ? 'The office' : n.from === 'group' ? 'Group chat' : 'You', text: n.text, delivered: n.delivered_at });
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
          {s.display.label !== s.name && <p className="panel-title">{s.name}</p>}
          <p>{modelLabel(s.model, s.family)} · {s.machine} · {s.room}{s.display.person && s.callsign && <> · callsign {s.callsign.name}</>}</p>
          {s.display.rename && <RenameButton c={s.display} />}
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
            {items.length === 0 && <p className="thread-empty">Nothing said to or by this session in the last 45 minutes.</p>}
            {items.map((m) => (
              <div key={m.key} className={`msg msg-${m.kind}`}>
                <span className="msg-who">{m.who} · {formatClock(m.at)}</span>
                <p className="msg-text">{m.text}</p>
                {m.kind === 'you' && (
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
