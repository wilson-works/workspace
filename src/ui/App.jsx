// App.jsx — the WorkSpace office.
//
// Five places: the Floor, Work, Agents, Questions and Chat, and a sixth, the Fleet, when this
// computer has a fleet clone. On a desktop they are tabs
// in the slim bar; on a phone (≤ 760 px) they are a bar along the bottom, and
// the machine switch sits full width under the header on the Floor. Where you
// are lives in the address (route.js), so Back walks the office and every view
// can be bookmarked.

import { useEffect, useRef, useState } from 'react';
import { useOfficeStream, formatAgo } from './useOfficeStream.js';
import { parseRoute, formatRoute, parentRoute, legacyRoute } from './route.js';
import Floor from './components/Floor.jsx';
import Panel from './components/Panel.jsx';
import Questions from './components/Questions.jsx';
import Notify from './components/Notify.jsx';
import Chat from './components/Chat.jsx';
import WorkBoard from './components/WorkBoard.jsx';
import ProjectWork from './components/ProjectWork.jsx';
import StepView from './components/StepView.jsx';
import Pulse from './components/Pulse.jsx';
import AgentsWing from './components/AgentsWing.jsx';
import Fleet from './components/Fleet.jsx';
import { keyOf } from './components/Desk.jsx';

const STORE = 'workspace.machine.v1';
function loadMachine() { try { return window.localStorage.getItem(STORE) || 'all'; } catch { return 'all'; } }
function saveMachine(m) { try { window.localStorage.setItem(STORE, m); } catch { /* private window */ } }
// The group chat's read mark: the time of the newest message seen on the Chat tab.
const CHAT_READ = 'workspace.chat-read.v1';
function loadChatRead() { try { return Number(window.localStorage.getItem(CHAT_READ)) || 0; } catch { return 0; } }
function saveChatRead(t) { try { window.localStorage.setItem(CHAT_READ, String(t)); } catch { /* private window */ } }

// Read once, at load - not in a state initialiser, which may run twice. The
// /?questions (a tapped notification) and /?work (a bookmark) links land on
// their routes; an address with no route opens the floor you last looked at.
const START = (() => {
  const old = legacyRoute(window.location.href);
  if (old) {
    window.history.replaceState(null, '', old.path + formatRoute(old.route));
    return old.route;
  }
  const r = parseRoute(window.location.hash);
  if (r) return r;
  const home = { tab: 'floor', machine: loadMachine() };
  // #/avatars is the gallery's page (main.jsx), not an unknown route: leave the address alone.
  if (window.location.hash === '#/avatars') return home;
  window.history.replaceState(null, '', formatRoute(home));
  return home;
})();

const TABS = [
  { key: 'floor', label: 'Floor', icon: 'M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { key: 'work', label: 'Work', icon: 'M4 5h16M4 12h16M4 19h10' },
  { key: 'agents', label: 'Agents', icon: 'M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21M3 21h18M14.5 12.5h.01' },
  // Shown only when this computer has a fleet clone (frame.fleet).
  { key: 'fleet', label: 'Fleet', icon: 'M3 5h8v6H3zM13 5h8v6h-8zM8 15h8v5H8zM7 11v4M17 11v4', fleetOnly: true },
  { key: 'questions', label: 'Questions', icon: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z' },
  { key: 'chat', label: 'Chat', icon: 'M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12z' },
];

function Tabs({ where, current, onPick, badges, fleet }) {
  const tabs = TABS.filter((t) => !t.fleetOnly || fleet);
  return (
    <nav className={`tabs tabs-${where} tabs-${tabs.length}`} aria-label="places">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          className={`tab ${current === t.key ? 'on' : ''}`}
          onClick={() => onPick(t.key)}
          aria-current={current === t.key ? 'page' : undefined}
        >
          <svg className="tab-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={t.icon} />
          </svg>
          <span className="tab-label">{t.label}</span>
          {badges[t.key] > 0 && <span className="qcount tab-badge">{badges[t.key]}</span>}
        </button>
      ))}
    </nav>
  );
}

function MachineTabs({ machines, current, onPick, totals, where }) {
  return (
    <nav className={`machines machines-${where}`} aria-label="machines">
      <button type="button" className={`machine ${current === 'all' ? 'on' : ''}`} onClick={() => onPick('all')}>
        All <span className="machine-count">{totals}</span>
      </button>
      {machines.map((m) => (
        <button
          key={m.name}
          type="button"
          className={`machine ${current === m.name ? 'on' : ''} ${m.connected ? '' : 'off'}`}
          onClick={() => onPick(m.name)}
          title={m.connected ? `${m.sessions} session(s), ${m.working} working` : (m.reason || 'not connected')}
        >
          <span className={`machine-dot ${m.connected ? (m.working ? 'busy' : 'up') : 'down'}`} aria-hidden="true" />
          {m.name}
          {m.connected && <span className="machine-count">{m.working}</span>}
        </button>
      ))}
    </nav>
  );
}

// The phone's "…": what no longer fits in its header.
function More() {
  const [open, setOpen] = useState(false);
  return (
    <span className="more">
      <button type="button" className="nbutton more-button" aria-label="more" aria-expanded={open} onClick={() => setOpen(!open)}>…</button>
      {open && (
        <div className="notify-hint more-sheet" role="dialog" aria-label="more" onClick={() => setOpen(false)}>
          <p className="more-sub">Notifications: the bell turns the buzz for new questions on or off.</p>
          <p><a href="#/avatars">All avatars</a></p>
        </div>
      )}
    </span>
  );
}

// Whose office this is (workspace.config.json): the name in the bar and the tab,
// and the orb's two colours.
function useBrand(brand) {
  const name = (brand && brand.name) || 'WorkSpace';
  const colors = brand && brand.colors;
  useEffect(() => {
    document.title = brand && brand.company ? `${name} · ${brand.company}` : name;
    if (colors && colors.length >= 2) {
      document.documentElement.style.setProperty('--brand-1', colors[0]);
      document.documentElement.style.setProperty('--brand-2', colors[1]);
    }
  }, [name, brand && brand.company, colors && colors.join()]);
  return name;
}

export default function App() {
  const { frame, stale } = useOfficeStream();
  const brandName = useBrand(frame && frame.brand);
  const [route, setRoute] = useState(START);
  const [chatRead, setChatRead] = useState(loadChatRead);
  // Looking at the Chat tab reads everything in it.
  const newestChat = frame && frame.channel && frame.channel.length ? frame.channel[frame.channel.length - 1].at : 0;
  useEffect(() => {
    if (route.tab === 'chat' && newestChat > chatRead) { setChatRead(newestChat); saveChatRead(newestChat); }
  }, [route.tab, newestChat]);
  const [lastMachine, setLastMachine] = useState(START.tab === 'floor' && START.machine ? START.machine : loadMachine);
  const machine = route.tab === 'floor' && route.machine ? route.machine : lastMachine;

  useEffect(() => {
    if (machine !== lastMachine) setLastMachine(machine);
    saveMachine(machine);
  }, [machine]);

  // Opening something pushes history; switching machine replaces it, so Back
  // does not walk through every machine you glanced at.
  const go = (r, replace = false) => {
    const h = formatRoute(r);
    if (h !== window.location.hash) {
      if (replace) window.history.replaceState(window.history.state, '', h);
      else window.history.pushState({ office: true }, '', h);
    }
    setRoute(r);
  };
  // Back, or one step up when this view was opened straight from a link.
  const back = () => {
    if (window.history.state && window.history.state.office) window.history.back();
    else go(parentRoute(route, machine), true);
  };

  useEffect(() => {
    const onNav = () => setRoute(parseRoute(window.location.hash) || { tab: 'floor', machine: loadMachine() });
    window.addEventListener('popstate', onNav);
    window.addEventListener('hashchange', onNav);
    return () => { window.removeEventListener('popstate', onNav); window.removeEventListener('hashchange', onNav); };
  }, []);

  const routeRef = useRef(route);
  routeRef.current = route;
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    const onKey = (e) => {
      const r = routeRef.current;
      if (e.key === 'Escape' && !(r.tab === 'floor' && !r.session)) backRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A notification tapped while the office is already open (sw.js).
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMsg = (e) => { if (e.data && e.data.type === 'open-questions') goRef.current({ tab: 'questions' }); };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, []);

  if (!frame) {
    return <div className="office loading"><p>Opening the office…</p></div>;
  }

  const asOf = frame.asOf;
  const ago = (t) => (typeof t === 'number' ? formatAgo(asOf - t) : '—');
  const machines = frame.machines || [];
  const all = frame.sessions || [];
  const sessions = machine === 'all' ? all : all.filter((s) => s.machine === machine);
  const current = machines.find((m) => m.name === machine);
  const selected = route.tab === 'floor' ? route.session : null;
  const chosen = selected ? all.find((s) => keyOf(s) === selected) : null;
  const working = all.filter((s) => s.state === 'working').length;
  const offline = new Set(machines.filter((m) => !m.connected).map((m) => m.name));

  // Off the floor (a desktop panel open over it) the machine changes behind
  // the panel, as it always has, and the panel stays.
  const pick = (m) => (route.tab === 'floor' ? go({ tab: 'floor', machine: m }, true) : setLastMachine(m));
  const pickTab = (t) => go(t === 'floor' ? { tab: 'floor', machine } : { tab: t });
  const questions = frame.questions || [];
  const askingKeys = new Set(questions.map((q) => `${q.machine}:${q.session_id}`));
  const onFloor = route.tab === 'floor';
  // Chat's badge: group messages newer than the last one seen on the Chat tab, the owner's own excepted.
  const unread = (frame.channel || []).filter((m) => m.at > chatRead && m.from.kind !== 'owner').length;
  const tabs = (where) => <Tabs where={where} current={route.tab} onPick={pickTab} badges={{ questions: questions.length, chat: unread }} fleet={!!frame.fleet} />;

  let view = null;
  if (route.tab === 'work') {
    const openProject = (key) => go({ tab: 'work', project: key });
    const openStep = (key, id) => go({ tab: 'work', project: key, step: id });
    if (route.project && route.step) {
      view = <StepView key={`${route.project}/${route.step}`} project={route.project} id={route.step} token={frame.token} onClose={back} onStep={(id) => go({ tab: 'work', project: route.project, step: id }, true)} />;
    } else if (route.project) {
      view = <ProjectWork project={route.project} onClose={back} onStep={(id) => openStep(route.project, id)} />;
    } else {
      view = <WorkBoard onClose={back} onProject={openProject} onStep={openStep} />;
    }
  } else if (route.tab === 'agents') {
    view = <AgentsWing onClose={back} questions={questions} onQuestions={() => go({ tab: 'questions' })} />;
  } else if (route.tab === 'fleet') {
    view = <Fleet onClose={back} />;
  } else if (route.tab === 'questions') {
    view = <Questions questions={questions} token={frame.token} ago={ago} onClose={back} />;
  } else if (route.tab === 'chat') {
    view = (
      <Chat
        messages={frame.channel}
        hub={frame.channel_hub}
        sessions={all}
        token={frame.token}
        onClose={back}
        onOpen={(k) => { const s = all.find((x) => keyOf(x) === k); if (s) go({ tab: 'floor', machine, session: k }); }}
      />
    );
  } else if (chosen) {
    view = (
      <Panel
        question={questions.find((q) => q.machine === chosen.machine && q.session_id === chosen.id)}
        key={selected}
        s={chosen}
        flows={frame.flows || []}
        token={frame.token}
        ago={ago}
        onClose={back}
      />
    );
  }

  return (
    <div className={`office ${stale ? 'is-stale' : ''} ${view ? 'has-panel' : ''} on-${route.tab}`}>
      <header className="bar">
        <div className="brand">
          {frame.brand && frame.brand.logo
            ? <img className="brand-logo" src="/brand-logo" alt="" />
            : <span className="brand-mark" aria-hidden="true" />}
          <span className="brand-name">
            {brandName}
            {frame.brand && frame.brand.company && <span className="brand-company"> · {frame.brand.company}</span>}
          </span>
        </div>
        <MachineTabs machines={machines} current={machine} onPick={pick} totals={working} where="bar" />
        {tabs('top')}
        <div className="bar-right">
          <Notify token={frame.token} />
          <More />
          <span className={`live ${stale ? 'live-off' : ''}`}>{stale ? 'Reconnecting…' : 'Live'}</span>
        </div>
      </header>
      {onFloor && <MachineTabs machines={machines} current={machine} onPick={pick} totals={working} where="segment" />}

      <div className="stage">
        <main className="stage-floor">
          {current && !current.connected ? (
            <div className="floor-empty">
              <p>
                <strong>{current.name}</strong>{' '}
                {current.reason && current.reason.startsWith('stopped') ? current.reason : "isn't connected to this office yet"}.
              </p>
              <p className="floor-empty-sub">Its sessions appear here while it sends in, every 15 seconds, over the tailnet.</p>
            </div>
          ) : (
            <>
            <Pulse
              sessions={sessions}
              flows={frame.flows || []}
              questions={questions}
              asOf={asOf}
              onQuestions={() => pickTab('questions')}
              brand={frame.brand && frame.brand.company ? `${brandName} · ${frame.brand.company}` : brandName}
              owner={frame.brand && frame.brand.owner}
            />
            <Floor
              sessions={sessions}
              flows={frame.flows || []}
              asOf={asOf}
              ago={ago}
              selectedKey={selected}
              onSelect={(k) => (k === selected ? back() : go({ tab: 'floor', machine, session: k }, !!selected))}
              asking={askingKeys}
              showMachine={machine === 'all' && new Set(sessions.map((s) => s.machine)).size > 1}
              offline={offline}
            />
            </>
          )}
        </main>
        {view}
      </div>
      {tabs('bottom')}
    </div>
  );
}
