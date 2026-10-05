// AgentsWing.jsx — the Agents' wing (#/agents, /api/agents; config/agents.json): an office for each
// of your specialist agents, in its own branding, with the doorway to its dashboard inside.
//
// One office per agent in its own colours, mark and type: a lit window when it is running, a door that
// swings open into its dashboard, a plaque with its name, and how many of its sessions are at a desk.
// The door opens the agent's own dashboard: on this machine its local address; on the phone only its
// tailnet address, once one is published (the office never proxies an agent's dashboard).
//
// Living doors: the door stands open with the agent inside while it works; it is shut with zzz floating
// up while the agent runs but rests, and shut while it is off. A shut door that can be opened peeks on
// hover. A left click goes inside; a right click knocks, and the agent answers with one of its jokes.

import { useEffect, useRef, useState } from 'react';
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

// How the door stands: open, with the agent inside, while it is running and at work; shut with zzz
// floating up while it is running but resting; shut while it is off.
export function postureOf(a) {
  if (a.state !== 'running') return 'shut';
  return a.working > 0 ? 'open' : 'rest';
}

// Who answers a knock: never the same joke twice running. An agent still moving in comes to the door
// too, so it can be met before it runs; one that is off does not.
export const answers = (a) => a.state === 'running' || a.state === 'planned';
export function answerOf(a, last) {
  if (!answers(a)) return `No answer. ${a.name} is out.`;
  const jokes = (a.jokes || []).filter((j) => j !== last);
  return jokes.length ? jokes[Math.floor(Math.random() * jokes.length)] : last || `${a.name} waves.`;
}

const KNOCK_MS = 750;
const ANSWER_MS = 7000;

function Office({ a, asks, onQuestions }) {
  const b = a.brand || {};
  const href = a.state === 'running' ? doorOf(a) : null;
  const lit = a.state === 'running' || a.working > 0;
  const [knock, setKnock] = useState(null); // null | { phase: 'knocking' | 'answered', text, in }
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const style = {
    '--a-bg': b.bg, '--a-panel': b.panel, '--a-ink': b.ink, '--a-accent': b.accent, '--a-accent2': b.accent2 || b.accent,
    fontFamily: b.font || undefined,
  };
  const onKnock = (e) => {
    e.preventDefault();
    timers.current.forEach(clearTimeout);
    const text = answerOf(a, knock && knock.text);
    setKnock({ phase: 'knocking', text, in: answers(a) });
    timers.current = [
      setTimeout(() => setKnock((k) => k && { ...k, phase: 'answered' }), KNOCK_MS),
      setTimeout(() => setKnock(null), KNOCK_MS + ANSWER_MS),
    ];
  };
  // Whoever answers the door opens it; it goes back to how it stood once they are done talking.
  const posture = knock && knock.phase === 'answered' && knock.in ? 'open' : postureOf(a);
  const figure = a.art || b.mark;
  const letter = String(a.name || '?').slice(0, 1);
  const Door = href ? 'a' : 'div';
  const doorProps = href ? { href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Step into ${a.name}'s dashboard` } : {};
  return (
    <li className={`aoffice state-${a.state} ${lit ? 'is-lit' : ''}`} style={style}>
      <div className="aoffice-light" aria-hidden="true" />
      {asks > 0 && (
        <button type="button" className="abubble" onClick={onQuestions} aria-label={`${asks} ${asks === 1 ? 'note' : 'notes'} for you from ${a.name}`}>
          <span className="abubble-n">{asks}</span> {asks === 1 ? 'note for you' : 'notes for you'}
        </button>
      )}
      <div className="adoor-wrap">
        <Door
          className={`adoor posture-${posture} ${href ? 'can-open' : ''} ${knock && knock.phase === 'knocking' ? 'is-knocking' : ''}`}
          onContextMenu={onKnock}
          {...doorProps}
        >
          <span className="adoor-frame">
            <span className="adoor-room" aria-hidden="true">
              {figure ? <img className="adoor-figure" src={figure} alt="" width="112" height="124" /> : <span className="adoor-monogram">{letter}</span>}
            </span>
            <span className="adoor-leaf" aria-hidden="true">
              <span className="adoor-sign">
                {b.mark ? <img src={b.mark} alt="" width="36" height="36" /> : <span className="adoor-monogram adoor-monogram-sign">{letter}</span>}
                <span className={`adoor-word ${String(a.name || '').length > 8 ? 'is-long' : ''}`}>{a.name}</span>
              </span>
              <span className="adoor-knob" />
            </span>
          </span>
        </Door>
        {posture === 'rest' && !knock && (
          <span className="azzz" aria-hidden="true"><span>z</span><span>z</span><span>z</span></span>
        )}
        {knock && knock.phase === 'knocking' && <span className="aknock" aria-hidden="true">knock knock</span>}
        <p className="ajoke" role="status" aria-live="polite">
          {knock && knock.phase === 'answered' && <span className={`ajoke-say ${knock.in ? '' : 'is-out'}`}>{knock.text}</span>}
        </p>
      </div>
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
        {a.desk && (
          <a className="atalk" href={`#/floor/${encodeURIComponent(a.desk.machine)}/${encodeURIComponent(a.desk.key)}`}>
            Talk to {a.name}
          </a>
        )}
      </div>
    </li>
  );
}

// The questions you have open from one of this agent's desks: the bubble by its door.
export function asksOf(a, questions) {
  const keys = new Set(a.desks || []);
  return (questions || []).filter((q) => keys.has(`${q.machine}:${q.session_id}`)).length;
}

export default function AgentsWing({ onClose, questions = [], onQuestions }) {
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
        {agents.length > 0 && <ul className="ahall">{agents.map((a) => <Office key={a.key} a={a} asks={asksOf(a, questions)} onQuestions={onQuestions} />)}</ul>}
      </div>
    </aside>
  );
}
