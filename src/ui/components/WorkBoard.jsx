// WorkBoard.jsx — the Work tab (/api/work): every project in projects/ (and any
// workspace.config.json work_folders), each with its % done ring and its steps as
// a small kanban - To do, Doing, Done. A course reads as lessons, with the next
// one to take; a project reads as orders. A project opens its page
// (#/work/<project>), a card its step (#/step/<project>/<id>).

import { useEffect, useState } from 'react';
import Close from './Close.jsx';
import { Ring, useRise } from './Progress.jsx';

const POLL_MS = 15000;

// GET a JSON view now and every POLL_MS; `bump` reloads it at once.
export function useJson(url, bump) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    let timer = null;
    const load = async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        const body = await res.json();
        if (!alive) return;
        setData(body);
        setError(null);
      } catch {
        if (alive) setError('Could not reach the office.');
      }
      if (alive) timer = setTimeout(load, POLL_MS);
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [url, bump]);
  return { data, error };
}

export const LISTS = [
  { key: 'todo', label: 'To do' },
  { key: 'doing', label: 'Doing' },
  { key: 'done', label: 'Done' },
];

export const noun = (kind, n) => (kind === 'course' ? (n === 1 ? 'lesson' : 'lessons') : (n === 1 ? 'order' : 'orders'));

export function Card({ x, onStep }) {
  return (
    <li>
      <button type="button" className="kcard" onClick={() => onStep(x.id)}>
        <span className="kcard-label">{x.label}</span>
        <span className="run-meta">{[x.id, x.who, x.minutes && `${x.minutes} min`].filter(Boolean).join(' · ')}</span>
      </button>
    </li>
  );
}

function MiniKanban({ p, onStep, onProject }) {
  return (
    <div className="kanban kanban-mini">
      {LISTS.map((l) => {
        const col = p.kanban[l.key];
        return (
          <section key={l.key} className={`kcol kcol-${l.key}`}>
            <h4 className="kcol-head"><span>{l.label}</span><span className="kcol-count">{col.count}</span></h4>
            {col.cards.length > 0 ? (
              <ul className="kcards">{col.cards.map((x) => <Card key={x.id} x={x} onStep={onStep} />)}</ul>
            ) : <p className="kcol-empty">{l.key === 'doing' ? 'Nothing underway' : l.key === 'done' ? 'None yet' : 'Clear'}</p>}
            {col.count > col.cards.length && (
              <button type="button" className="kcol-more" onClick={() => onProject(p.key)}>+{col.count - col.cards.length} more</button>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ProjectSection({ p, onProject, onStep }) {
  const c = p.counts;
  const cheer = useRise(c.done);
  return (
    <li className="wproj">
      <button type="button" className="wproj-head" onClick={() => onProject(p.key)}>
        <Ring pct={p.pct} size={54} cheer={cheer} label={p.pct === null ? `${p.name}: nothing to count yet` : `${p.name}: ${p.pct}% done`} />
        <span className="wproj-id">
          <span className="wproj-name">{p.name}</span>
          <span className="wproj-sub">
            {p.summary ? `${p.summary} · ` : ''}{c.done} of {c.total} {noun(p.kind, c.total)} done
          </span>
        </span>
        <span className="work-card-go" aria-hidden="true">›</span>
      </button>
      {p.kind === 'course' && p.next && (
        <button type="button" className="wnext" onClick={() => onStep(p.next.id)}>
          <span className="wnext-label">{c.done === 0 ? 'Start here' : 'Next up'}</span>
          <span className="wnext-title">{p.next.label}</span>
          {p.next.minutes && <span className="wnext-time">{p.next.minutes} min</span>}
        </button>
      )}
      {p.kind === 'course' && !p.next && c.total > 0 && <p className="wdone">Course complete. Well done.</p>}
      {p.kind !== 'course' && c.total > 0 && (
        <div className="wproj-part">
          <MiniKanban p={p} onStep={(id) => onStep(id)} onProject={onProject} />
        </div>
      )}
    </li>
  );
}

function Totals({ projects }) {
  const sum = (f) => projects.reduce((n, p) => n + f(p), 0);
  const total = sum((p) => p.counts.total);
  const done = sum((p) => p.counts.done);
  const pct = total > 0 ? Math.round((done / total) * 100) : null;
  const cheer = useRise(done);
  return (
    <div className="wtotals">
      <Ring pct={pct} size={72} cheer={cheer} label={pct === null ? 'nothing to count yet' : `${pct}% of everything done`} />
      <ul className="wtotals-list">
        <li><strong>{sum((p) => p.counts.doing)}</strong> doing</li>
        <li><strong>{sum((p) => p.counts.todo)}</strong> to do</li>
        <li><strong>{done}</strong> done</li>
        <li><strong>{projects.length}</strong> project{projects.length === 1 ? '' : 's'}</li>
      </ul>
    </div>
  );
}

export default function WorkBoard({ onClose, onProject, onStep }) {
  const { data, error } = useJson('/api/work');
  const projects = (data && data.projects) || [];
  return (
    <aside className="panel work workpage" aria-label="work">
      <header className="panel-head">
        <div className="panel-id">
          <h2>Work</h2>
          <p>Your projects and the Get started course</p>
        </div>
        <Close onClose={onClose} />
      </header>
      <div className="panel-body">
        {error && <p className="q-error">{error}</p>}
        {data && data.ok === false && <p className="q-empty">{data.error || "Can't read the work."}</p>}
        {data && data.ok && projects.length === 0 && (
          <p className="q-empty">No projects yet. A project is a folder in projects/ with a PROJECT.md and a steps folder (projects/README.md).</p>
        )}
        {projects.length > 0 && <Totals projects={projects} />}
        {projects.length > 0 && (
          <ul className="wprojects">
            {projects.map((p) => <ProjectSection key={p.key} p={p} onProject={onProject} onStep={(id) => onStep(p.key, id)} />)}
          </ul>
        )}
      </div>
    </aside>
  );
}
