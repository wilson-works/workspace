// WorkBoard.jsx — the Work tab (/api/work): Running now (the sessions at work this
// minute, read off the floor), then every project in projects/ (and any
// workspace.config.json work_folders), each with its % done ring, its count in each
// of the eight boxes, and its steps as a small kanban - To do, Doing, Done. An order
// in Build says Running only while a session is on it; otherwise Staged. A course reads as lessons, with the next
// one to take; a project reads as orders. A project opens its page
// (#/work/<project>), a card its step (#/step/<project>/<id>), a session its desk.

import { useEffect, useRef, useState } from 'react';
import Close from './Close.jsx';
import Avatar from './Avatar.jsx';
import { Ring, useRise } from './Progress.jsx';
import { nowText } from '../words.js';
import { formatAgo } from '../useOfficeStream.js';

const POLL_MS = 15000;

// GET a JSON view now and every POLL_MS (or every `fastMs` while one is given); `bump` and
// `reload()` load it again at once.
export function useJson(url, bump, fastMs) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const fast = useRef(null);
  fast.current = fastMs || null;
  const kick = useRef(() => {});
  useEffect(() => {
    let alive = true;
    let timer = null;
    let seq = 0;
    const load = async () => {
      clearTimeout(timer);
      const mine = ++seq;
      try {
        const res = await fetch(url, { cache: 'no-store' });
        const body = await res.json();
        if (!alive) return;
        setData(body);
        setError(null);
      } catch {
        if (alive) setError('Could not reach the office.');
      }
      // Only the newest load sets the next one, so a reload never starts a second timer.
      if (alive && mine === seq) timer = setTimeout(load, fast.current ? Math.min(POLL_MS, fast.current) : POLL_MS);
    };
    kick.current = load;
    load();
    return () => { alive = false; clearTimeout(timer); kick.current = () => {}; };
  }, [url, bump]);
  return { data, error, reload: () => kick.current() };
}

// "4m ago", or "just now".
const agoText = (asOf, t) => { const a = formatAgo(asOf - t); return a === 'now' ? 'just now' : `${a} ago`; };

// One session at work: who, what it is for, what it is doing this minute, its helpers, and where
// (repo, branch, machine). Opens its desk on the floor.
function LiveCard({ x, asOf, onSession }) {
  const ago = (t) => (t ? formatAgo(asOf - t) : '—');
  const doing = nowText({ state: x.state, now: x.now, before: x.before, waiting: x.waiting, helpers: x.helpers, last_at: x.last_at }, ago);
  const where = [x.repo, x.branch, x.machine].filter(Boolean).join(' · ');
  const tasks = x.helpers.map((h) => h.task || `a ${h.type}`);
  return (
    <li>
      <button type="button" className="kcard live-card" onClick={() => onSession(x.key)} title={`Open ${x.name}'s desk`}>
        <span className="live-who">
          <Avatar avatar={x.avatar} family={x.family} state={x.state} size={28} />
          <span className="live-name">{x.name}</span>
          <span className={`live-state live-${x.state}`}>{x.state === 'working' ? 'Working' : x.state === 'waiting' ? 'Waiting' : 'Quiet'}</span>
        </span>
        {x.title && x.title !== x.name && <span className="live-title">{x.title}</span>}
        <span className="live-doing">{doing}</span>
        {tasks.length > 0 && (
          <span className="live-helpers">
            {tasks.length === 1 ? '1 helper' : `${tasks.length} helpers`}: {tasks.slice(0, 3).join(' · ')}{tasks.length > 3 ? ` · +${tasks.length - 3} more` : ''}
          </span>
        )}
        {(where || x.started_at) && (
          <span className="run-meta">{[where, x.started_at ? `started ${agoText(asOf, x.started_at)}` : null].filter(Boolean).join(' · ')}</span>
        )}
      </button>
    </li>
  );
}

function liveCount(list) {
  const n = (st) => list.filter((x) => x.state === st).length;
  const quiet = list.length - n('working') - n('waiting');
  return [n('working') && `${n('working')} working`, n('waiting') && `${n('waiting')} waiting`, quiet && `${quiet} quiet`].filter(Boolean).join(' · ');
}

// Running now: what is being worked on this minute, from the floor itself, grouped by repo or room.
function RunningNow({ groups, asOf, onSession }) {
  return (
    <section className="live" aria-label="running now">
      <h3 className="live-head">Running now</h3>
      {groups.length === 0 ? <p className="kcol-empty">Nothing is being worked on right now.</p> : (
        <ul className="live-groups">
          {groups.map((g) => (
            <li key={g.project} className={`live-group ${g.working > 0 ? 'is-live' : ''}`}>
              <p className="live-group-head">
                <span className="live-group-name">{g.project}</span>
                <span className="live-group-count">{liveCount(g.sessions)}</span>
              </p>
              <ul className="kcards live-cards">{g.sessions.map((x) => <LiveCard key={x.key} x={x} asOf={asOf} onSession={onSession} />)}</ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export const LISTS = [
  { key: 'todo', label: 'To do' },
  { key: 'doing', label: 'Doing' },
  { key: 'done', label: 'Done' },
];

export const noun = (kind, n) => (kind === 'course' ? (n === 1 ? 'lesson' : 'lessons') : (n === 1 ? 'order' : 'orders'));

// The eight boxes an order moves through (work.js STAGES), in plain words.
export const BOXES = [
  { key: 'new', label: 'New' },
  { key: 'build', label: 'Build' },
  { key: 'review', label: 'Review' },
  { key: 'verify', label: 'Verify' },
  { key: 'ready', label: 'Ready' },
  { key: 'approved', label: 'Approved' },
  { key: 'cicd', label: 'CI/CD' },
  { key: 'shipped', label: 'Shipped' },
];

/** Where an order really stands, as a status word with a small dot (work.js truth): Running only with a live session. */
export function TruthPill({ x }) {
  if (x.truth === 'running') return <span className="pill pill-good"><span className="pill-dot" aria-hidden="true" />Running{x.live_name ? ` · ${x.live_name}` : ''}</span>;
  if (x.truth === 'staged') return <span className="pill pill-quiet"><span className="pill-dot" aria-hidden="true" />Staged · waiting to start</span>;
  if (x.truth === 'requeued') return <span className="pill pill-ask"><span className="pill-dot" aria-hidden="true" />Back in the queue</span>;
  if (x.stage && !['new', 'build', 'shipped'].includes(x.stage)) return <span className="pill pill-step"><span className="pill-dot" aria-hidden="true" />{x.stage_label}</span>;
  return null;
}

/** A project's (or every project's) count in each of the eight boxes. */
export function Boxes({ b, label }) {
  if (!b) return null;
  return (
    <ol className="boxes" aria-label={label || 'the eight boxes'}>
      {BOXES.map((x) => (
        <li key={x.key} className={`box box-${x.key} ${b[x.key] ? 'has' : ''}`}>
          <span className="box-n">{b[x.key] || 0}</span>
          <span className="box-k">{x.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function Card({ x, onStep }) {
  return (
    <li>
      <button type="button" className="kcard kcard-full" onClick={() => onStep(x.id)}>
        <span className="kcard-label">{x.label}</span>
        <TruthPill x={x} />
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
      {p.kind !== 'course' && c.total > 0 && <Boxes b={p.boxes} label={`${p.name}: the eight boxes`} />}
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
  const work = projects.filter((p) => p.kind !== 'course' && p.boxes);
  const all = work.length ? Object.fromEntries(BOXES.map((x) => [x.key, work.reduce((n, p) => n + (p.boxes[x.key] || 0), 0)])) : null;
  const running = work.reduce((n, p) => n + (p.boxes.running || 0), 0);
  const staged = work.reduce((n, p) => n + (p.boxes.staged || 0), 0);
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
      {all && (
        <div className="wtotals-boxes">
          <Boxes b={all} label="every project: the eight boxes" />
          <p className="wtotals-truth">
            {running > 0 ? `${running} running now` : 'Nothing running now'}
            {staged > 0 ? ` · ${staged} staged, waiting to start` : ''}
          </p>
        </div>
      )}
    </div>
  );
}

export default function WorkBoard({ onClose, onProject, onStep, onSession }) {
  const { data, error } = useJson('/api/work');
  const projects = (data && data.projects) || [];
  return (
    <aside className="panel work workpage" aria-label="work">
      <header className="panel-head">
        <div className="panel-id">
          <h2>Work</h2>
          <p>What is running now, your projects and the Get started course</p>
        </div>
        <Close onClose={onClose} />
      </header>
      <div className="panel-body">
        {error && <p className="q-error">{error}</p>}
        {data && data.ok && Array.isArray(data.live_work) && <RunningNow groups={data.live_work} asOf={data.asOf} onSession={onSession} />}
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
