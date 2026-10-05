// Questions.jsx — the owner's questions, one card at a time.
//
// Every question reached this page in plain English (the office refuses
// technical ones and sends them to the org), with the asking session's own
// recommendation. Three answers: go with it, let the org decide, or your own
// words. Answered cards leave; nothing is kept on the page.

import { useState } from 'react';
import Close from './Close.jsx';

async function postAnswer(token, q, kind, text) {
  try {
    const res = await fetch('/api/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Office-Token': token || '' },
      body: JSON.stringify({ id: q.id, machine: q.machine, kind, text }),
    });
    const out = await res.json().catch(() => ({}));
    return res.ok && out.ok ? { ok: true } : { ok: false, error: out.error || `Not sent (HTTP ${res.status}).` };
  } catch {
    return { ok: false, error: 'Could not reach the office.' };
  }
}

export function QuestionCard({ q, token, ago, onAnswered, showFrom = true }) {
  const [mode, setMode] = useState('choose');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const send = async (kind) => {
    if (busy) return;
    if (kind === 'own' && !text.trim()) return;
    setBusy(true);
    setError(null);
    const r = await postAnswer(token, q, kind, kind === 'own' ? text.trim() : null);
    setBusy(false);
    if (r.ok) onAnswered && onAnswered(q);
    else setError(r.error);
  };

  return (
    <article className="qcard">
      {showFrom && (
        <p className="q-from">{q.session_name} · {q.machine} · asked {ago(q.asked_at)} ago</p>
      )}
      <h3 className="q-text">{q.question}</h3>
      <div className="q-rec">
        <span className="q-rec-label">They recommend</span>
        <p>{q.recommendation}</p>
      </div>

      {mode === 'choose' ? (
        <div className="q-actions">
          <button type="button" className="q-btn q-go" disabled={busy} onClick={() => send('recommendation')}>Go with it</button>
          <button type="button" className="q-btn" disabled={busy} onClick={() => send('org')}>Let the org decide</button>
          <button type="button" className="q-btn" disabled={busy} onClick={() => setMode('own')}>Answer myself</button>
        </div>
      ) : (
        <div className="q-own">
          <textarea
            value={text}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send('own'); } }}
            placeholder="Your answer…"
            rows={3}
            maxLength={1200}
          />
          <div className="q-actions">
            <button type="button" className="q-btn q-go" disabled={busy || !text.trim()} onClick={() => send('own')}>Send answer</button>
            <button type="button" className="q-btn" disabled={busy} onClick={() => setMode('choose')}>Back</button>
          </div>
        </div>
      )}
      {error && <p className="q-error">{error}</p>}
    </article>
  );
}

export default function Questions({ questions, token, ago, onClose }) {
  const [index, setIndex] = useState(0);
  const [sent, setSent] = useState(0);
  const i = Math.min(index, Math.max(0, questions.length - 1));
  const q = questions[i];

  return (
    <aside className="panel questions" aria-label="questions for you">
      <header className="panel-head">
        <div className="panel-id">
          <h2>Questions for you</h2>
          <p>{questions.length === 0 ? 'Nothing waiting' : `${i + 1} of ${questions.length}`}</p>
        </div>
        {questions.length > 1 && (
          <div className="q-nav">
            <button type="button" className="panel-close" aria-label="previous" disabled={i === 0} onClick={() => setIndex(i - 1)}>‹</button>
            <button type="button" className="panel-close" aria-label="next" disabled={i >= questions.length - 1} onClick={() => setIndex(i + 1)}>›</button>
          </div>
        )}
        <Close onClose={onClose} />
      </header>
      <div className="panel-body">
        {q ? (
          <QuestionCard key={`${q.machine}:${q.id}`} q={q} token={token} ago={ago} onAnswered={() => setSent(sent + 1)} />
        ) : (
          <p className="q-empty">
            {sent > 0 ? 'All answered. Each session gets your answer the next time it works.' : 'No session is waiting on you.'}
          </p>
        )}
      </div>
    </aside>
  );
}
