// Fleet.jsx — the Fleet page (#/fleet, /api/fleet; src/server/fleet.js): your computers working
// together through your private fleet repo.
//
// A card per computer (its role, when it last synced, the handoffs waiting for it, whether its
// office answered), the board in four columns, the handoffs on their way, and the latest notes from
// every computer's comms file. Read-only: the fleet is changed by the sessions and the fleet
// command line, never from this page. The tab shows only when this computer has a fleet clone.

import Close from './Close.jsx';
import { useJson } from './WorkBoard.jsx';

const ROLE_WORDS = { command: 'Command', builder: 'Builder', mobile: 'Mobile' };
const ROLE_LINES = {
  command: 'Plans, reviews and merges',
  builder: 'Works on branches; never merges',
  mobile: 'On the go: drafts and pushes branches',
};
const COLUMNS = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'doing', label: 'Doing' },
  { key: 'done', label: 'Done' },
  { key: 'archive', label: 'Archive' },
];
const PREVIOUS = {
  dirty: 'its last sync stopped on files that were not its own',
  conflict: 'its last sync stopped on a conflict',
  failed: 'its last sync could not reach GitHub',
};

export function ageWords(ms) {
  if (ms == null) return null;
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function Computer({ m }) {
  const hb = m.heartbeat;
  const left = m.status === 'left';
  const health = left ? 'is-left' : !hb ? 'is-new' : hb.ok ? 'is-ok' : 'is-late';
  return (
    <li className={`fcomp ${health} ${m.self ? 'is-self' : ''}`}>
      <div className="fcomp-top">
        <span className="fcomp-dot" aria-hidden="true" />
        <h3 className="fcomp-name">{m.name}</h3>
        <span className="fcomp-role">{ROLE_WORDS[m.role] || m.role || '?'}</span>
        {m.self && <span className="fcomp-you">this computer</span>}
      </div>
      <p className="fcomp-what">{ROLE_LINES[m.role] || ''}{m.office_hub ? ' · keeps the office your phone opens' : ''}</p>
      <ul className="fcomp-facts">
        <li>
          {left ? 'Left the fleet'
            : hb ? <>Synced <strong>{ageWords(hb.age_ms)}</strong>{hb.ok ? '' : ' (late: it syncs every day)'}</>
              : 'Has not synced yet'}
        </li>
        {hb && hb.previous && PREVIOUS[hb.previous] && <li className="fcomp-warn">Before that, {PREVIOUS[hb.previous]}.</li>}
        {!left && <li>{m.waiting ? <><strong>{m.waiting}</strong> {m.waiting === 1 ? 'handoff waits' : 'handoffs wait'} for it</> : 'No handoffs waiting'}</li>}
        {hb && hb.office && <li>Office {hb.office === 'up' ? 'answering' : 'not running'}</li>}
      </ul>
    </li>
  );
}

function Column({ col, data }) {
  const items = (data && data.items) || [];
  const count = (data && data.count) || 0;
  return (
    <section className={`kcol kcol-${col.key}`}>
      <h3 className="kcol-head">{col.label}<span className="kcol-count">{count}</span></h3>
      {items.length === 0 ? <p className="kcol-empty">Nothing here.</p> : (
        <ul className="kcards">
          {items.map((w) => (
            <li key={w.id} className="fcard">
              <span className="kcard-label">{w.title}</span>
              <span className="run-meta">
                {[
                  col.key === 'backlog' ? (w.for && w.for !== 'any' ? `for ${w.for}` : 'for any computer') : w.claimed_by && `by ${w.claimed_by}`,
                  w.branch && `branch ${w.branch}`,
                ].filter(Boolean).join(' · ') || w.id}
              </span>
            </li>
          ))}
        </ul>
      )}
      {count > items.length && <p className="kcol-empty">and {count - items.length} more</p>}
    </section>
  );
}

function Handoff({ h, taken }) {
  return (
    <li className="run-row fhand">
      <div className="run-row-top">
        <span className="run-id">{h.title}</span>
        <span className={`order-chip ${taken ? 'order-chip-doing' : 'order-chip-todo'}`}>{taken ? 'taken' : 'waiting'}</span>
      </div>
      <p className="run-meta">
        <span className="fhand-route">{h.from || '?'} to {h.to === 'any' ? 'any computer' : h.to || '?'}</span>
        {h.created && ` · sent ${h.created}`}
        {taken && h.taken_by && ` · taken by ${h.taken_by}${h.taken_at ? ` ${h.taken_at}` : ''}`}
      </p>
      {h.branch && <p className="run-meta">{h.repo ? `${h.repo}, ` : ''}branch {h.branch}</p>}
    </li>
  );
}

function NoFleet() {
  return (
    <div className="fempty">
      <p><strong>No fleet on this computer yet.</strong></p>
      <p>A fleet lets the sessions on your other computers share a board, leave each other notes and hand work on, through a private repo of your own on GitHub.</p>
      <p>On your first computer: <code>node fleet/bin/fleet.js init</code>. On each of the others: <code>node fleet/bin/fleet.js join &lt;your GitHub name&gt;/fleet-ops</code>.</p>
      <p>Guide 07, "Several computers", walks you through it.</p>
    </div>
  );
}

export default function Fleet({ onClose }) {
  const { data, error } = useJson('/api/fleet');
  const on = data && data.configured;
  const machines = (on && data.machines) || [];
  const active = machines.filter((m) => m.status !== 'left');
  const open = (on && data.handoffs.open) || [];
  const taken = (on && data.handoffs.taken) || [];
  const me = machines.find((m) => m.self);
  const waitingHere = me ? open.filter((h) => h.to === me.name || h.to === 'any').length : 0;
  return (
    <aside className="panel fleet workpage" aria-label="the fleet">
      <header className="panel-head">
        <div className="panel-id">
          <h2>The fleet</h2>
          <p>
            {!data ? 'Calling round…'
              : !on ? 'Not set up on this computer'
                : `${active.length} ${active.length === 1 ? 'computer' : 'computers'} · ${open.length} ${open.length === 1 ? 'handoff' : 'handoffs'} waiting${me ? ` (${waitingHere} for ${me.name})` : ''}, ${taken.length} taken`}
          </p>
        </div>
        <Close onClose={onClose} />
      </header>
      <div className="panel-body">
        {error && <p className="q-error">{error}</p>}
        {data && !on && <NoFleet />}
        {on && (
          <>
            <ul className="fcomps">{machines.map((m) => <Computer key={m.name} m={m} />)}</ul>

            <section className="fsection">
              <h3 className="wproj-part-head">The board</h3>
              <div className="kanban kanban-fleet">
                {COLUMNS.map((c) => <Column key={c.key} col={c} data={data.board[c.key]} />)}
              </div>
            </section>

            <section className="fsection">
              <h3 className="wproj-part-head">Handoffs</h3>
              {open.length + taken.length === 0
                ? <p className="kcol-empty">No handoffs on the way. {data.handoffs.done_count ? `${data.handoffs.done_count} done.` : ''}</p>
                : (
                  <ul className="run-rows fhands">
                    {open.map((h) => <Handoff key={h.id} h={h} taken={false} />)}
                    {taken.map((h) => <Handoff key={h.id} h={h} taken />)}
                  </ul>
                )}
            </section>

            <section className="fsection">
              <h3 className="wproj-part-head">Latest from every computer</h3>
              {data.comms.length === 0 ? <p className="kcol-empty">No notes yet.</p> : (
                <ul className="fcomms">
                  {data.comms.map((c, i) => (
                    <li key={`${c.machine}-${c.when}-${i}`} className="fcomm">
                      <p className="fcomm-who"><strong>{c.machine}</strong> <span className="chat-time">{c.when}</span></p>
                      <p className="fcomm-text">{c.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
