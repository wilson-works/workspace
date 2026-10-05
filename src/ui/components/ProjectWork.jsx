// ProjectWork.jsx — one project's page (#/work/<project>, /api/work/<project>): its
// % done, what it is (the PROJECT.md text), then its steps. A course lists its
// lessons in order with a mark for each; a project shows its orders as a kanban -
// To do, Doing, Done. Tapping a step opens it (#/step/<project>/<id>).

import Close from './Close.jsx';
import Markdown from '../markdown.jsx';
import { useJson, Card, LISTS, noun } from './WorkBoard.jsx';
import { Ring } from './Progress.jsx';

const MARK = { todo: '', doing: '…', done: '✓' };

function Lessons({ steps, onStep }) {
  return (
    <ol className="lessons">
      {steps.map((s, i) => (
        <li key={s.id}>
          <button type="button" className={`lesson lesson-${s.status}`} onClick={() => onStep(s.id)}>
            <span className="lesson-mark" aria-label={s.status}>{MARK[s.status] || i + 1}</span>
            <span className="lesson-title">{s.label}</span>
            <span className="run-meta">{[s.id, s.minutes && `${s.minutes} min`].filter(Boolean).join(' · ')}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export default function ProjectWork({ project, onClose, onStep }) {
  const { data, error } = useJson(`/api/work/${encodeURIComponent(project)}`);
  const p = data && data.ok ? data.project : null;
  const steps = (data && data.ok && data.steps) || [];
  return (
    <aside className="panel sheet work-project workpage" aria-label={p ? p.name : project}>
      <header className="panel-head">
        {data && data.ok && <Ring pct={data.pct} size={46} />}
        <div className="panel-id">
          <h2>{p ? p.name : project}</h2>
          <p>{data && data.ok ? `${data.counts.done} of ${data.counts.total} ${noun(p.kind, data.counts.total)} done` : 'Work'}</p>
        </div>
        <Close onClose={onClose} sheet />
      </header>
      <div className="panel-body">
        {error && <p className="q-error">{error}</p>}
        {data && data.ok === false && <p className="q-empty">{data.error || "Can't read this project."}</p>}
        {p && p.body && <section className="order-body"><Markdown text={p.body} /></section>}
        {p && steps.length === 0 && <p className="q-empty">No steps yet. Add numbered Markdown files to this project's steps folder.</p>}
        {p && steps.length > 0 && (p.kind === 'course' ? <Lessons steps={steps} onStep={onStep} /> : (
          <div className="kanban kanban-full">
            {LISTS.map((l) => {
              const rows = steps.filter((s) => s.status === l.key);
              return (
                <section key={l.key} className={`kcol kcol-${l.key}`}>
                  <h4 className="kcol-head"><span>{l.label}</span><span className="kcol-count">{rows.length}</span></h4>
                  {rows.length === 0 ? <p className="kcol-empty">{l.key === 'doing' ? 'Nothing underway' : 'None'}</p> : (
                    <ul className="kcards">{rows.map((x) => <Card key={x.id} x={x} onStep={onStep} />)}</ul>
                  )}
                </section>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
