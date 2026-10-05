// AgentsWing.jsx — the Agents' wing (#/agents, /api/agents; config/agents.json): an office for each
// of your specialist agents, in its own branding, with the doorway to its dashboard inside.
//
// One office per agent in its own colours, mark and type: a lit window when it is running, a door that
// swings open into its dashboard, a plaque with its name, and how many of its sessions are at a desk.
// The door opens the agent's own dashboard: on this machine its local address; on the phone only its
// tailnet address, once one is published (the office never proxies an agent's dashboard).

import Close from './Close.jsx';
import { useJson } from './WorkBoard.jsx';

const STATE_WORDS = {
  running: 'In the office',
  off: 'Lights off',
  checking: 'Knocking…',
  elsewhere: 'Works from',
  building: 'Being built',
  'no-dashboard': 'No dashboard yet',
  planned: 'Coming soon',
};

function onThisMachine() {
  const h = window.location.hostname;
  return h === '127.0.0.1' || h === 'localhost';
}

function doorOf(a) {
  if (onThisMachine()) return a.door.local || a.door.phone || null;
  return a.door.phone || null;
}

function whyClosed(a) {
  if (a.state === 'planned') return 'Moving in soon.';
  if (a.state === 'elsewhere') return `${a.name} works on ${a.machine}; the door opens there.`;
  if (a.state === 'building') return 'Still being built; no dashboard to open yet.';
  if (a.state === 'off') return `${a.name} isn't running on ${a.machine} right now.`;
  if (a.state === 'running' && !onThisMachine()) return `Opens on ${a.machine}'s screen; not on the phone yet.`;
  return null;
}

function Office({ a }) {
  const b = a.brand || {};
  const href = a.state === 'running' ? doorOf(a) : null;
  const lit = a.state === 'running' || a.working > 0;
  const style = {
    '--a-bg': b.bg, '--a-panel': b.panel, '--a-ink': b.ink, '--a-accent': b.accent, '--a-accent2': b.accent2 || b.accent,
    fontFamily: b.font || undefined,
  };
  const Door = href ? 'a' : 'div';
  const doorProps = href ? { href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Step into ${a.name}'s dashboard` } : {};
  return (
    <li className={`aoffice state-${a.state} ${lit ? 'is-lit' : ''}`} style={style}>
      <div className="aoffice-light" aria-hidden="true" />
      <Door className={`adoor ${href ? 'can-open' : ''}`} {...doorProps}>
        <span className="adoor-frame">
          <span className="adoor-room" aria-hidden="true">
            {b.mark ? <img className="adoor-mark" src={b.mark} alt="" width="64" height="64" /> : <span className="adoor-monogram">{String(a.name || '?').slice(0, 1)}</span>}
          </span>
          <span className="adoor-leaf" aria-hidden="true">
            {b.mark ? <img className="adoor-sign" src={b.mark} alt="" width="38" height="38" /> : <span className="adoor-monogram adoor-monogram-sign">{String(a.name || '?').slice(0, 1)}</span>}
            <span className="adoor-knob" />
          </span>
        </span>
      </Door>
      <div className="aplaque">
        <p className="aplaque-eyebrow">{a.name}'s office</p>
        <h3 className="aplaque-name">{a.name}<span className="aplaque-title"> · {a.title}</span></h3>
        {a.line && <p className="aplaque-line">{a.line}</p>}
        <p className="aplaque-status">
          <span className="astatus-dot" aria-hidden="true" />
          {STATE_WORDS[a.state] || a.state}{a.state === 'elsewhere' ? ` ${a.machine}` : ''}
          {a.at_desks > 0 && <span className="aplaque-desks"> · {a.at_desks} at a desk{a.working > 0 ? `, ${a.working} working` : ''}</span>}
        </p>
        {href
          ? <a className="aenter" href={href} target="_blank" rel="noopener noreferrer">Step inside <span aria-hidden="true">→</span></a>
          : <p className="aclosed">{whyClosed(a)}</p>}
      </div>
    </li>
  );
}

export default function AgentsWing({ onClose }) {
  const { data, error } = useJson('/api/agents');
  const agents = (data && data.agents) || [];
  const open = agents.filter((a) => a.state === 'running').length;
  return (
    <aside className="panel agents workpage" aria-label="the agents' wing">
      <header className="panel-head">
        <div className="panel-id">
          <h2>The Agents' wing</h2>
          <p>{data ? `${agents.length} offices · ${open} open now` : 'Walking the hall…'}</p>
        </div>
        <Close onClose={onClose} />
      </header>
      <div className="panel-body">
        {error && <p className="q-error">{error}</p>}
        {data && agents.length === 0 && <p className="q-empty">No agents have an office yet. Your first specialist moves in during lesson GS-09 of Get started.</p>}
        {agents.length > 0 && <ul className="ahall">{agents.map((a) => <Office key={a.key} a={a} />)}</ul>}
      </div>
    </aside>
  );
}
