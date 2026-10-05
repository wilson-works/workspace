// StepView.jsx — one step up close (#/step/<project>/<id>, /api/step/<project>/<id>):
// a lesson of the Get started course, or an order of a project. Its text, with a
// Copy button on every prompt block, buttons to mark it Doing or Done, and the
// way to the step before and after.

import { useState } from 'react';
import Close from './Close.jsx';
import Markdown from '../markdown.jsx';
import { useJson } from './WorkBoard.jsx';

const LABEL = { todo: 'To do', doing: 'Doing', done: 'Done' };

async function postMark(token, project, id, status) {
  try {
    const res = await fetch('/api/work-mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Office-Token': token || '' },
      body: JSON.stringify({ project, id, status }),
    });
    const out = await res.json().catch(() => ({}));
    return res.ok && out.ok ? { ok: true } : { ok: false, error: out.error || `Not saved (HTTP ${res.status}).` };
  } catch {
    return { ok: false, error: 'Could not reach the office.' };
  }
}

export default function StepView({ project, id, token, onClose, onStep }) {
  const [bump, setBump] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { data, error: readError } = useJson(`/api/step/${encodeURIComponent(project)}/${encodeURIComponent(id)}`, bump);
  const x = data && data.ok ? data : null;
  const course = x && x.project.kind === 'course';

  const mark = async (status) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await postMark(token, x.project.key, x.id, status);
    setBusy(false);
    if (r.ok) setBump((n) => n + 1);
    else setError(r.error);
  };

  return (
    <aside className="panel sheet order step workpage" aria-label={x ? x.title : `Step ${id}`}>
      <header className="panel-head">
        <div className="panel-id">
          <h2>{x ? x.title : `Step ${id}`}</h2>
          {x && (
            <p className="order-id">
              {[x.project.name, x.id, course && x.position && `lesson ${x.position.at} of ${x.position.of}`, x.minutes && `${x.minutes} min`, x.who && `for ${x.who}`]
                .filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <Close onClose={onClose} sheet />
      </header>
      <div className="panel-body">
        {readError && <p className="q-error">{readError}</p>}
        {data && !data.ok && <p className="q-empty">{data.error || "Can't read this step."}</p>}
        {!data && !readError && <p className="q-empty">Opening…</p>}
        {x && (
          <>
            <section className="step-actions" aria-label="where this stands">
              <span className={`order-chip order-chip-${x.status}`}>{LABEL[x.status] || x.status}</span>
              {x.status !== 'doing' && x.status !== 'done' && (
                <button type="button" className="q-btn" disabled={busy} onClick={() => mark('doing')}>Doing</button>
              )}
              {x.status !== 'done' && (
                <button type="button" className="q-btn q-go" disabled={busy} onClick={() => mark('done')}>Mark done</button>
              )}
              {x.status === 'done' && (
                <button type="button" className="q-btn" disabled={busy} onClick={() => mark('todo')}>Not done yet</button>
              )}
            </section>
            {error && <p className="q-error">{error}</p>}
            {x.notice ? <p className="order-redacted">{x.notice}</p> : <section className="order-body"><Markdown text={x.body} /></section>}
            <nav className="step-nav" aria-label="steps">
              {x.prev ? (
                <button type="button" className="step-go" onClick={() => onStep(x.prev.id)}>‹ {x.prev.label}</button>
              ) : <span />}
              {x.next && (
                <button type="button" className="step-go step-go-next" onClick={() => onStep(x.next.id)}>{x.next.label} ›</button>
              )}
            </nav>
          </>
        )}
      </div>
    </aside>
  );
}
