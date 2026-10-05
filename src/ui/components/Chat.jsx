// Chat.jsx — the Chat tab: one group thread for the owner and every running session
// (WO-20260930-office-group-channel; server side in src/server/channel.js).
//
// Newest at the bottom. Each message shows its sender's avatar and callsign; the owner's are
// pinned in their own colour. A receipt says how many sessions have read it, and taps open to
// who has not. Tapping a sender opens their desk. Scope chips decide who a post goes to.

import { useEffect, useRef, useState } from 'react';
import Close from './Close.jsx';
import Avatar from './Avatar.jsx';
import { formatClock } from '../useOfficeStream.js';

function scopeLabel(scope) {
  if (!scope || scope === 'all') return null;
  if (scope === 'auto') return 'their run';
  if (scope.startsWith('run:')) return `run ${scope.slice(4)}`;
  if (scope.startsWith('machine:')) return scope.slice(8);
  return scope;
}

function Receipt({ m }) {
  const [open, setOpen] = useState(false);
  if (!m.sent) return <span className="chat-receipt">sending…</span>;
  const all = m.recipients || [];
  if (!all.length) return <span className="chat-receipt">no live session in scope</span>;
  const read = all.filter((r) => r.delivered_at);
  const waiting = all.filter((r) => !r.delivered_at);
  return (
    <span className="chat-receipt-wrap">
      <button type="button" className="chat-receipt" onClick={() => setOpen(!open)} aria-expanded={open}>
        delivered to {read.length} of {all.length} session{all.length === 1 ? '' : 's'}
      </button>
      {open && waiting.length > 0 && (
        <span className="chat-waiting">
          Not read yet: {waiting.map((r) => `${r.callsign || r.session_id.slice(0, 6)} (${r.machine})`).join(', ')}
        </span>
      )}
    </span>
  );
}

function Message({ m, onOpen }) {
  const owner = m.from.kind === 'owner';
  const who = owner ? 'You' : `${m.from.callsign || 'A session'} · ${m.from.machine || ''}`;
  const chips = [scopeLabel(m.scope), m.to ? `→ ${m.to}` : null].filter(Boolean);
  return (
    <div className={`chat-msg ${owner ? 'chat-owner' : ''}`}>
      {owner ? (
        <span className="chat-you" aria-hidden="true">You</span>
      ) : (
        <button type="button" className="chat-sender" onClick={() => m.from.key && onOpen(m.from.key)} disabled={!m.from.key} title="Open their desk">
          <Avatar avatar={m.from.avatar} family={m.from.family || 'unknown'} state="working" size={34} />
        </button>
      )}
      <div className="chat-body">
        <span className="chat-who">
          {owner || !m.from.key ? who : <button type="button" className="chat-name" onClick={() => onOpen(m.from.key)}>{who}</button>}
          <span className="chat-time"> · {formatClock(m.at)}</span>
          {chips.map((c) => <span key={c} className="chat-chip">{c}</span>)}
        </span>
        <p className="chat-text">{m.text}</p>
        <Receipt m={m} />
      </div>
    </div>
  );
}

function Composer({ token, scopes }) {
  const [text, setText] = useState('');
  const [scope, setScope] = useState('all');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Office-Token': token || '' },
        body: JSON.stringify({ text: body, scope }),
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
  return (
    <div className="composer chat-composer">
      <div className="chat-scopes" role="radiogroup" aria-label="who gets it">
        {scopes.map((s) => (
          <button key={s.key} type="button" role="radio" aria-checked={scope === s.key} className={`chat-scope ${scope === s.key ? 'on' : ''}`} onClick={() => setScope(s.key)}>
            {s.label}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        placeholder="Message the group…"
        rows={2}
        maxLength={500}
        aria-label="message the group"
      />
      <button type="button" className="send" onClick={send} disabled={busy || !text.trim()}>
        {busy ? 'Sending' : 'Send'}
      </button>
      <p className="composer-hint">{status || 'Every live session in scope gets it; idle ones are woken.'}</p>
    </div>
  );
}

export default function Chat({ messages, hub, sessions, token, onClose, onOpen }) {
  const threadRef = useRef(null);
  const list = messages || [];
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [list.length]);

  const runs = [...new Set((sessions || []).map((s) => s.run).filter(Boolean))].sort();
  const machines = [...new Set((sessions || []).map((s) => s.machine))].sort();
  const scopes = [{ key: 'all', label: 'Everyone' }]
    .concat(runs.map((r) => ({ key: `run:${r}`, label: `Run ${r}` })))
    .concat(machines.map((m) => ({ key: `machine:${m}`, label: m })));

  return (
    <aside className="panel chat" aria-label="group chat">
      <header className="panel-head">
        <div className="panel-id">
          <h2>Chat</h2>
          <p>You and every running session</p>
        </div>
        <Close onClose={onClose} />
      </header>
      <div className="panel-body chat-thread" ref={threadRef}>
        {!hub && <p className="q-empty">The group chat lives on the hub's office. Open it there.</p>}
        {hub && list.length === 0 && <p className="q-empty">No messages yet. Say something to everyone below.</p>}
        {list.map((m) => <Message key={m.id} m={m} onOpen={onOpen} />)}
      </div>
      {hub && <Composer token={token} scopes={scopes} />}
    </aside>
  );
}
