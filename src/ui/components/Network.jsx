// Network.jsx — the Team tab: the office as a working network, where work is passed down to helper sessions and each
// team has its own chart.
//
// Each team is a lead and everyone working under it: the helper sessions it (or you) handed work down to through the
// office (dispatch.js), their helpers in turn, and the Claude Code helpers (subagents) each one has out right now. A
// wire joins each to the one above it; work handed down runs a dot down the wire, a report coming back runs one up.
// Every card opens that session's own chart: its status, its last steps, what it was asked, its conversation.

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import { Status, Pace, keyOf } from './Desk.jsx';
import { nowText, stepText, modelLabel } from '../words.js';
import { peopleRows } from '../team-view.js';

const PACKET_MS = 90 * 1000;
const EFFORT = { low: 'low', medium: 'medium', high: 'high', xhigh: 'extra high', max: 'max' };

function Card({ s, ago, selected, onSelect }) {
  const j = s.dispatch;
  const role = s.display.title || (j ? (j.role || (j.parent ? `Helping ${j.parent.name}` : 'Started from the office')) : (s.display.person ? null : s.room));
  return (
    <button type="button" className={`net-card state-${s.state} ${selected ? 'is-selected' : ''} ${s.arriving ? 'is-arriving' : ''}`} data-net={keyOf(s)} onClick={() => onSelect(keyOf(s))}>
      <span className="net-card-top">
        <Avatar avatar={s.avatar} agent={s.agent} family={s.family} state={s.state === 'done' ? 'working' : s.state} size={36} />
        <span className="net-card-id">
          <span className="net-card-name">{s.display.name}</span>
          {role && <span className="net-card-role">{role}</span>}
        </span>
        <Status s={s} ago={ago} compact />
      </span>
      <span className="net-card-chips">
        {s.model && <span className={`jchip tone-${s.family}`}><i className="jchip-dot" aria-hidden="true" />{modelLabel(s.model, s.family)}</span>}
        {j && <span className="jchip">{EFFORT[j.effort] || j.effort} effort</span>}
        {s.machine && <span className="jchip jchip-quiet">{s.machine}</span>}
        <Pace pace={s.pace} />
      </span>
      <span className="net-card-now">{nowText(s, ago)}</span>
    </button>
  );
}

// What a Claude Code helper is called on its card: the built-in kinds in plain words, an org agent by its own name.
const SUB_NAMES = { helper: 'Helper', 'general-purpose': 'Helper', Explore: 'Explorer', Plan: 'Planner', unknown: 'Helper' };
function subName(type) { return SUB_NAMES[type] || String(type || 'Helper').replace(/-/g, ' '); }

/** A Claude Code helper (subagent) out for a session right now: smaller, in its own colour. */
function SubCard({ h, owner }) {
  return (
    <span className="net-sub" data-net={`${keyOf(owner)}/${h.id}`}>
      <span className={`net-sub-dot tone-${h.family}`} aria-hidden="true" />
      <span className="net-sub-type">{subName(h.type)}</span>
      <span className="net-sub-now">{h.task || stepText(h.now) || 'working'}</span>
    </span>
  );
}

// Your people (config/org-people.json `people`): each person once, with what they are doing now or when they last
// worked, a status dot and word, and a tap to their session. Not machines: people.
function People({ people, sessions, ago, onSelect }) {
  const rows = peopleRows(people, sessions);
  if (!rows.length) return null;
  return (
    <section className="tm-sec" aria-label="your people">
      <h2>Your people</h2>
      <ul className="tm-list">
        {rows.map((r) => {
          const line = r.top && r.state !== 'free' ? nowText(r.top, ago) : r.last_at ? `Last worked at ${clock12(r.last_at)}` : 'Not on anything right now';
          const body = (
            <>
              <span className="tm-main">
                <span className="tm-name">{r.name}{r.count > 1 && <span className="tm-meta"> · {r.count} sessions</span>}</span>
                {r.title && <span className="who-title">{r.title}</span>}
                <span className="tm-sub">{line}</span>
              </span>
              <span className={`pill pill-${r.state === 'working' ? 'good' : r.state === 'waiting' ? 'ask' : 'quiet'}`}><span className="pill-dot" aria-hidden="true" />{r.word}</span>
            </>
          );
          return (
            <li key={r.name}>
              {r.top ? <button type="button" className="tm-row" onClick={() => onSelect(keyOf(r.top))}>{body}</button>
                : <div className="tm-row tm-row-still">{body}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** "2:05 PM", local time. */
function clock12(ms) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(ms));
}

function Node({ s, kidsOf, ago, selected, onSelect }) {
  const kids = kidsOf(keyOf(s));
  const subs = s.helpers || [];
  return (
    <div className="net-node">
      <Card s={s} ago={ago} selected={selected === keyOf(s)} onSelect={onSelect} />
      {(kids.length > 0 || subs.length > 0) && (
        <div className="net-kids">
          {kids.map((k) => <Node key={keyOf(k)} s={k} kidsOf={kidsOf} ago={ago} selected={selected} onSelect={onSelect} />)}
          {subs.map((h) => <div key={h.id} className="net-node net-node-sub"><SubCard h={h} owner={s} /></div>)}
        </div>
      )}
    </div>
  );
}

export default function Network({ sessions, people, asOf, ago, selected, onSelect, canStart }) {
  const wrapRef = useRef(null);
  const seen = useRef(new Map());
  const [wires, setWires] = useState([]);
  // The chart of who handed work to whom folds under Your people; with no people list it is the page, open.
  const hasPeople = (people || []).length > 0;
  const [chartOpen, setChartOpen] = useState(!hasPeople);

  const { teams, quiet, kidsOf, edges } = useMemo(() => {
    const byKey = new Map(sessions.map((s) => [keyOf(s), s]));
    const kids = new Map();
    for (const s of sessions) {
      if (!s.lead_key || !byKey.has(s.lead_key)) continue;
      if (!kids.has(s.lead_key)) kids.set(s.lead_key, []);
      kids.get(s.lead_key).push(s);
    }
    const kidsOfFn = (k) => kids.get(k) || [];
    const tops = sessions.filter((s) => !s.lead_key || !byKey.has(s.lead_key));
    const busy = (s) => s.state !== 'idle' || kidsOfFn(keyOf(s)).length > 0;
    const size = (s) => kidsOfFn(keyOf(s)).length + (s.helpers || []).length;
    const t = tops.filter(busy).sort((a, b) => size(b) - size(a) || (a.state === 'working' ? -1 : 0) - (b.state === 'working' ? -1 : 0) || (b.last_at || 0) - (a.last_at || 0));
    // Every wire: lead -> helper session, session -> subagent.
    const e = [];
    const walk = (s) => {
      for (const k of kidsOfFn(keyOf(s))) { e.push({ from: keyOf(s), to: keyOf(k), job: k.dispatch, family: k.family }); walk(k); }
      for (const h of s.helpers || []) e.push({ from: keyOf(s), to: `${keyOf(s)}/${h.id}`, job: null, family: h.family, sub: true });
    };
    t.forEach(walk);
    return { teams: t, quiet: tops.filter((s) => !busy(s)), kidsOf: kidsOfFn, edges: e };
  }, [sessions]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const measure = () => {
      if (!chartOpen) { setWires([]); return; }
      const box = wrap.getBoundingClientRect();
      const at = (key) => {
        const el = wrap.querySelector(`[data-net="${CSS.escape(key)}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const av = el.querySelector('.avatar, .net-sub-dot');
        const a = av ? av.getBoundingClientRect() : r;
        return { x: a.left - box.left + a.width / 2, top: r.top - box.top, bottom: r.bottom - box.top, left: r.left - box.left, mid: a.top - box.top + a.height / 2 };
      };
      const next = [];
      for (const e of edges) {
        const p = at(e.from);
        const c = at(e.to);
        if (!p || !c) continue;
        // An elbow: down from under the lead's avatar, then across into the helper's side.
        const x = p.x;
        const y0 = p.bottom;
        const y1 = c.mid;
        const r = Math.min(10, Math.max(0, (y1 - y0) / 2));
        const d = `M${x},${y0} L${x},${y1 - r} Q${x},${y1} ${x + r},${y1} L${c.left},${y1}`;
        const packets = [];
        const j = e.job;
        if (j && j.created_at && asOf - j.created_at < PACKET_MS) packets.push({ id: `h:${j.id}`, up: false });
        if (j && j.reported_at && asOf - j.reported_at < PACKET_MS) packets.push({ id: `r:${j.id}:${j.reported_at}`, up: true });
        for (const pk of packets) if (!seen.current.has(pk.id)) seen.current.set(pk.id, asOf);
        next.push({ id: `${e.from}>${e.to}`, d, family: e.family, sub: !!e.sub, packets: packets.filter((pk) => seen.current.get(pk.id) === asOf) });
      }
      setWires(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [edges, asOf, chartOpen]);

  const headless = sessions.filter((s) => s.dispatch);
  const helpers = headless.filter((s) => s.dispatch.parent).length;
  const subs = sessions.reduce((n, s) => n + (s.helpers || []).length, 0);
  const working = sessions.filter((s) => s.state === 'working').length;

  return (
    <div className="net" ref={wrapRef}>
      <section className="net-top">
        <span className="net-you-orb" aria-hidden="true" />
        <div className="net-you">
          <h1>Your team</h1>
          <p>
            {teams.length} {teams.length === 1 ? 'lead' : 'leads'} at work · {working} heads down
            {helpers > 0 ? ` · ${helpers} handed-down ${helpers === 1 ? 'helper' : 'helpers'}` : ''}
            {subs > 0 ? ` · ${subs} Claude ${subs === 1 ? 'helper' : 'helpers'} out` : ''}
          </p>
        </div>
      </section>

      <People people={people} sessions={sessions} ago={ago} onSelect={onSelect} />

      <details className="net-chart" open={chartOpen} onToggle={(e) => setChartOpen(e.currentTarget.open)}>
      <summary className="sfold-head"><span className="sfold-chev" aria-hidden="true">›</span><span className="sfold-title">How the work is passed down</span><span className="sfold-note">{teams.length} {teams.length === 1 ? 'lead' : 'leads'} at work</span></summary>
      {teams.length === 0 && (
        <div className="net-empty">
          <p>Nobody is at work right now.</p>
          {canStart && <p>Start one with New session, and hand work down from any desk: the team grows under it.</p>}
        </div>
      )}

      <div className="net-teams">
        {teams.map((s) => (
          <section key={keyOf(s)} className={`net-team ${s.state === 'working' ? 'is-lit' : ''}`}>
            <header className="net-team-head">
              <span>{s.room}</span>
              <span className="net-team-count">{kidsOf(keyOf(s)).length + (s.helpers || []).length > 0 ? `${kidsOf(keyOf(s)).length + (s.helpers || []).length} under` : 'solo'}</span>
            </header>
            <Node s={s} kidsOf={kidsOf} ago={ago} selected={selected} onSelect={onSelect} />
          </section>
        ))}
      </div>

      {quiet.length > 0 && (
        <section className="net-quiet">
          <h2>Quiet</h2>
          <div className="net-quiet-row">
            {quiet.map((s) => (
              <button key={keyOf(s)} type="button" className="quiet" onClick={() => onSelect(keyOf(s))}>
                <Avatar avatar={s.avatar} agent={s.agent} family={s.family} state="idle" size={22} />
                <span className="quiet-name">{s.display.name}</span>
                <span className="quiet-age">{ago(s.last_at)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      </details>

      <svg className="net-wires" aria-hidden="true">
        {wires.map((w) => (
          <g key={w.id} className={`tone-${w.family || 'unknown'} ${w.sub ? 'is-sub' : ''}`}>
            <path className="net-wire" d={w.d} />
            {w.packets.map((p) => (
              <circle key={p.id} className="net-packet" r="4.5">
                <animateMotion dur="1.4s" repeatCount="1" fill="freeze" path={w.d} keyPoints={p.up ? '1;0' : '0;1'} keyTimes="0;1" calcMode="linear" />
              </circle>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
