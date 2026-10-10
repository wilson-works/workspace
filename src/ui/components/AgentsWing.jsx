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
//
// Wake, Sleep and Restart (server wake.js): an agent installed on this computer that is off shows
// "Wake <Name>", then "Waking <Name>…" until it answers; a running one shows Sleep (which also stops
// the runs it has going) and Restart. "Sleep all agents" above the hall puts every one to sleep, after
// asking once. They call this office's own API, so they work the same from your desk and your phone.
// One that can't be woken from here says why.

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
  if (a.state === 'off' && a.wake && !a.wake.can && a.wake.why) return `${a.name} isn't running right now. ${a.wake.why}`;
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

// Wake shows for an agent that is off (or not yet checked) and can be woken from this office.
export const canWake = (a) => !!(a.wake && a.wake.can) && (a.state === 'off' || a.state === 'checking');
// Sleep and Restart show for a running agent the office can stop.
export const canSleep = (a) => !!(a.wake && a.wake.can && a.wake.sleep) && a.state === 'running';

// How long a door keeps watching for an agent that was still starting when its Wake came back.
const WATCH_MS = 30000;

/** POST one of the door's buttons; the office's answer in words, and the state it reports. */
async function pressAgent(path, token) {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Office-Token': token || '' }, body: '{}' });
    const body = await res.json().catch(() => ({}));
    return { text: body.message || body.error || (res.ok ? null : 'The office could not do that.'), state: body.state || null };
  } catch {
    return { text: 'Could not reach the office.', state: null };
  }
}

function Office({ a, asks, onQuestions, token, watching, onWatch, onChanged }) {
  const b = a.brand || {};
  const href = a.state === 'running' ? doorOf(a) : null;
  const lit = a.state === 'running' || a.working > 0;
  const [knock, setKnock] = useState(null); // null | { phase: 'knocking' | 'answered', text, in }
  const [act, setAct] = useState(null); // null | { kind: 'wake' | 'sleep' | 'restart', busy, text }
  const timers = useRef([]);
  const watchTimer = useRef(null);
  useEffect(() => () => { timers.current.forEach(clearTimeout); clearTimeout(watchTimer.current); }, []);
  // Once the agent answers, stop watching for it.
  useEffect(() => { if (a.state === 'running' && watching) onWatch(a.key, false); }, [a.state, watching]);
  const busy = !!(act && act.busy);
  const waking = (busy && act.kind === 'wake') || !!(a.wake && a.wake.starting) || (watching && a.state !== 'running');
  const sleeping = busy && act.kind === 'sleep';
  const press = async (kind) => {
    setAct({ kind, busy: true, text: null });
    onWatch(a.key, kind === 'wake' || kind === 'restart');
    const r = await pressAgent(`/api/agents/${encodeURIComponent(a.key)}/${kind}`, token);
    setAct({ kind, busy: false, text: r.text });
    // Still starting: keep watching a while, so the door opens by itself when the agent answers.
    clearTimeout(watchTimer.current);
    if ((kind === 'wake' || kind === 'restart') && r.state === 'starting') watchTimer.current = setTimeout(() => onWatch(a.key, false), WATCH_MS);
    else onWatch(a.key, false);
    onChanged();
  };
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
          {waking ? 'Waking up…' : sleeping ? 'Going to sleep…' : STATE_WORDS[a.state] || a.state}{a.state === 'elsewhere' ? ` ${a.machine}` : ''}
          {a.at_desks > 0 && <span className="aplaque-desks"> · {a.at_desks} at a desk{a.working > 0 ? `, ${a.working} working` : ''}</span>}
        </p>
        {href
          ? <a className="aenter" href={href} target="_blank" rel="noopener noreferrer">Step inside <span aria-hidden="true">→</span></a>
          : waking
            ? <button type="button" className="aenter is-waking" disabled>{`Waking ${a.name}…`}</button>
            : canWake(a)
              ? <button type="button" className="aenter" onClick={() => press('wake')}>Wake {a.name}</button>
              : <p className="aclosed">{whyClosed(a)}</p>}
        {canSleep(a) && (
          <span className="aactions">
            <button type="button" className="atalk" disabled={busy} aria-label={`Sleep ${a.name}`} onClick={() => press('sleep')}>
              {sleeping ? 'Going to sleep…' : 'Sleep'}
            </button>
            <button type="button" className="atalk" disabled={busy} aria-label={`Restart ${a.name}`} onClick={() => press('restart')}>
              {busy && act.kind === 'restart' ? 'Restarting…' : 'Restart'}
            </button>
          </span>
        )}
        <p className="awake-say" role="status" aria-live="polite">{act && !act.busy && act.text ? act.text : ''}</p>
        {a.desk && (
          <a className="atalk" href={`#/floor/${encodeURIComponent(a.desk.machine)}/${encodeURIComponent(a.desk.key)}`}>
            Talk to {a.name}
          </a>
        )}
      </div>
    </li>
  );
}

// Sleep all: every agent awake on this computer goes to sleep, and every run it has going stops.
// It asks once before it does it.
function SleepAll({ agents, token, onChanged }) {
  const [step, setStep] = useState('idle'); // idle | confirm | busy
  const [said, setSaid] = useState(null);
  const awake = agents.filter(canSleep);
  const working = awake.reduce((n, a) => n + (a.working || 0), 0);
  const go = async () => {
    setStep('busy');
    const r = await pressAgent('/api/agents/sleep-all', token);
    setSaid(r.text || 'Done.');
    setStep('idle');
    onChanged();
  };
  return (
    <section className="asleepall" aria-label="all agents">
      <p className="asleepall-count">
        <span className={`asleepall-dot ${awake.length ? 'is-on' : ''}`} aria-hidden="true" />
        {awake.length} {awake.length === 1 ? 'agent' : 'agents'} awake here{working > 0 ? `, ${working} at work right now` : ''}
      </p>
      {step === 'confirm' ? (
        <span className="asleepall-ask">
          <span>Put every agent here to sleep and stop their runs?</span>
          <button type="button" className="asleepall-go" onClick={go}>Sleep all</button>
          <button type="button" className="asleepall-no" onClick={() => setStep('idle')}>Cancel</button>
        </span>
      ) : (
        <button type="button" className="asleepall-no" disabled={step === 'busy' || awake.length === 0} onClick={() => { setSaid(null); setStep('confirm'); }}>
          {step === 'busy' ? 'Putting everyone to sleep…' : 'Sleep all agents'}
        </button>
      )}
      <p className="asleepall-say" role="status" aria-live="polite">{said || ''}</p>
    </section>
  );
}

// The questions you have open from one of this agent's desks: the bubble by its door.
export function asksOf(a, questions) {
  const keys = new Set(a.desks || []);
  return (questions || []).filter((q) => keys.has(`${q.machine}:${q.session_id}`)).length;
}

export default function AgentsWing({ onClose, questions = [], onQuestions, token }) {
  // While a door waits on its agent (a wake under way here or on another screen), read the hall every 2 s.
  const [watching, setWatching] = useState({});
  const [quick, setQuick] = useState(false);
  const { data, error, reload } = useJson('/api/agents', 0, quick ? 2000 : null);
  const agents = (data && data.agents) || [];
  const waiting = Object.values(watching).some(Boolean) || agents.some((a) => a.wake && a.wake.starting);
  useEffect(() => { setQuick(waiting); if (waiting) reload(); }, [waiting]);
  const onWatch = (key, on) => setWatching((w) => (!!w[key] === on ? w : { ...w, [key]: on }));
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
        {token && agents.some((x) => x.wake && x.wake.can) && <SleepAll agents={agents} token={token} onChanged={reload} />}
        {data && agents.length === 0 && <p className="q-empty">No agents have an office yet. Your first specialist moves in during lesson GS-09 of Get started.</p>}
        {agents.length > 0 && <ul className="ahall">{agents.map((a) => (
          <Office
            key={a.key} a={a} asks={asksOf(a, questions)} onQuestions={onQuestions}
            token={token} watching={!!watching[a.key]} onWatch={onWatch} onChanged={reload}
          />
        ))}</ul>}
      </div>
    </aside>
  );
}
