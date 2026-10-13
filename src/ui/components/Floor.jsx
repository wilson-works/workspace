// Floor.jsx — the office floor: a room per project or run, a desk per session,
// and a line between two desks whenever one has just said something to the
// other on the comms bus. A new message travels along its line once.

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import Desk, { QuietDesk, keyOf } from './Desk.jsx';

const LINE_MS = 15 * 60 * 1000;   // how long a conversation line stays drawn
const PACKET_MS = 90 * 1000;      // a hand-down or a report this recent sends a dot along its team line
const SAID_MS = 10 * 60 * 1000;   // how long a desk shows its last message
const RANK = { working: 0, waiting: 1, idle: 2 };

function endpointKey(e) { return e && e.session ? `${e.machine}:${e.session}` : null; }

export default function Floor({ sessions, flows, asOf, ago, selectedKey, onSelect, showMachine, offline, asking }) {
  const wrapRef = useRef(null);
  const seen = useRef(new Map());
  const [lines, setLines] = useState([]);

  const rooms = useMemo(() => {
    const map = new Map();
    for (const s of sessions) {
      const name = showMachine ? `${s.room}|${s.machine}` : s.room;
      if (!map.has(name)) map.set(name, { name: s.room, machine: s.machine, list: [] });
      map.get(name).list.push(s);
    }
    const out = [...map.values()].map((r) => {
      r.list.sort((a, b) => RANK[a.state] - RANK[b.state] || (b.last_at || 0) - (a.last_at || 0));
      r.active = r.list.filter((s) => s.state !== 'idle');
      r.quiet = r.list.filter((s) => s.state === 'idle');
      return r;
    });
    return out.sort((a, b) => b.active.length - a.active.length || a.name.localeCompare(b.name));
  }, [sessions, showMachine]);

  // The newest thing each desk said or heard, for the bubble on the desk.
  const lastFlow = useMemo(() => {
    const m = new Map();
    for (const f of flows) {
      if (!f.at || asOf - f.at > SAID_MS) continue;
      const from = endpointKey(f.from);
      const to = endpointKey(f.to);
      if (from && !m.has(from)) m.set(from, { dir: 'out', other: f.to.label, subject: f.subject });
      if (to && !m.has(to)) m.set(to, { dir: 'in', other: f.from.label, subject: f.subject });
    }
    return m;
  }, [flows, asOf]);

  // Helpers the office started whose lead is on this floor too (dispatch.decorate sets lead_key), only while the
  // helper is at work: a line between two quiet seats would cut across the quiet row.
  const teamed = useMemo(() => {
    const here = new Set(sessions.map(keyOf));
    return sessions.filter((s) => s.lead_key && here.has(s.lead_key) && s.state !== 'idle');
  }, [sessions]);

  // Lines between desks that talked, measured from the rendered desks.
  const drawable = useMemo(
    () => flows.filter((f) => f.at && asOf - f.at < LINE_MS && endpointKey(f.from) && endpointKey(f.to)),
    [flows, asOf]
  );
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const measure = () => {
      const box = wrap.getBoundingClientRect();
      const centre = (key) => {
        const el = wrap.querySelector(`[data-key="${CSS.escape(key)}"] .person, [data-key="${CSS.escape(key)}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
      };
      const next = [];
      // A team (dispatch.js): a line from a lead to each helper the office started for it. Work handed down runs a dot
      // down the line once; a report coming back runs one up.
      for (const s of teamed) {
        const a = centre(s.lead_key);
        const b = centre(keyOf(s));
        if (!a || !b) continue;
        const j = s.dispatch || {};
        const packets = [];
        if (j.created_at && asOf - j.created_at < PACKET_MS) packets.push({ id: `h:${j.id}`, up: false });
        if (j.reported_at && asOf - j.reported_at < PACKET_MS) packets.push({ id: `r:${j.id}:${j.reported_at}`, up: true });
        for (const p of packets) if (!seen.current.has(p.id)) seen.current.set(p.id, asOf);
        const cy = Math.min(a.y, b.y) - Math.max(40, Math.abs(a.x - b.x) * 0.18);
        next.push({ id: `team:${keyOf(s)}`, team: true, family: s.family, d: `M${a.x},${a.y} Q${(a.x + b.x) / 2},${cy} ${b.x},${b.y}`, fade: 1, packets: packets.filter((p) => seen.current.get(p.id) === asOf) });
      }
      for (const f of drawable) {
        const a = centre(endpointKey(f.from));
        const b = centre(endpointKey(f.to));
        if (!a || !b) continue;
        const mx = (a.x + b.x) / 2;
        const my = Math.min(a.y, b.y) - Math.max(40, Math.abs(a.x - b.x) * 0.18);
        // A message is "fresh" for the frame it first appeared in, however
        // many times that frame is re-measured, so its dot travels once.
        if (!seen.current.has(f.id)) seen.current.set(f.id, asOf);
        next.push({ id: f.id, d: `M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`, fade: 1 - (asOf - f.at) / LINE_MS, fresh: seen.current.get(f.id) === asOf });
      }
      setLines(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [drawable, teamed, rooms, asOf]);

  if (sessions.length === 0) {
    return <p className="floor-empty">No sessions are running right now.</p>;
  }

  return (
    <div className="floor" ref={wrapRef}>
      <svg className="flow-layer" aria-hidden="true">
        {lines.filter((l) => l.team).map((l) => (
          <g key={l.id} className={`team-wire tone-${l.family || 'unknown'}`}>
            <path className="team-line" d={l.d} />
            {l.packets.map((p) => (
              <circle key={p.id} className="team-dot" r="4.5">
                <animateMotion dur="1.6s" repeatCount="1" fill="freeze" path={l.d} keyPoints={p.up ? '1;0' : '0;1'} keyTimes="0;1" calcMode="linear" />
              </circle>
            ))}
          </g>
        ))}
        {lines.filter((l) => !l.team).map((l) => (
          <g key={l.id} style={{ opacity: Math.max(0.18, l.fade) }}>
            <path className="flow-line" d={l.d} />
            {l.fresh && (
              <circle className="flow-dot" r="4">
                <animateMotion dur="1.8s" repeatCount="1" fill="freeze" path={l.d} />
              </circle>
            )}
          </g>
        ))}
      </svg>

      {rooms.map((r) => (
        <section key={`${r.name}|${r.machine}`} className={`room ${r.list.some((s) => s.state === 'working') ? 'is-lit' : r.active.length === 0 ? 'is-dim' : ''}`}>
          <header className="room-head">
            <h2>{r.name}</h2>
            <span className="room-sub">
              {showMachine && <span className="room-machine">{r.machine}</span>}
              {offline && offline.has(r.machine)
                ? 'not reporting'
                : r.active.length > 0 ? `${r.active.length} active` : 'quiet'}
            </span>
          </header>
          {r.active.length > 0 && (
            <div className="desks">
              {r.active.map((s) => (
                <Desk
                  key={keyOf(s)}
                  s={s}
                  ago={ago}
                  selected={selectedKey === keyOf(s)}
                  onSelect={onSelect}
                  lastFlow={lastFlow.get(keyOf(s))}
                  showMachine={false}
                  asking={asking && asking.has(keyOf(s))}
                />
              ))}
            </div>
          )}
          {r.quiet.length > 0 && (
            <div className="quiet-row">
              {r.quiet.map((s) => (
                <QuietDesk key={keyOf(s)} s={s} selected={selectedKey === keyOf(s)} onSelect={onSelect} asking={asking && asking.has(keyOf(s))} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
