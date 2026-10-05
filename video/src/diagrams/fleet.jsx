// fleet.jsx — the drawn diagrams about fleet ops: the private repo every computer shares, what is
// inside it, the board, one comms file per computer, a handoff from DESK to MINI, and the daily sync.
// The shapes follow docs/ARCHITECTURE.md, "The fleet repo".

import React from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { C, EASE_IN_OUT, FONT, MONO } from '../brand';
import { Area, useHighlight, useLayout } from '../components/Area';
import { Card, Computer, FileIcon, Folder, PathText, Rise, machineColor } from '../components/ui';
import { COMMS, FLEET_TREE, ORDERS, WORLD } from '../data/world';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const dim = (any, lit) => (any && !lit ? 0.35 : 1);

const Lock = ({ size = 26, color = C.text }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2.5" fill={color} /><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke={color} strokeWidth="2.5" /></svg>
);

const NamePill = ({ name, size = 26 }) => (
  <span style={{ background: machineColor(name), color: '#0D0524', fontFamily: MONO, fontWeight: 700, fontSize: size, borderRadius: 999, padding: '5px 18px' }}>{name}</span>
);

/** The private repo in the middle, a copy on each computer. hl: 'repo', 'private', 'copies', 'sync'. */
export const FleetRepo = ({ cues, hl }) => {
  const L = useLayout();
  const { lit, cue } = useHighlight(cues, hl);
  const f = useCurrentFrame();
  const W = L.width;
  const H = L.area.h - 30;
  const center = L.portrait ? [W / 2, 330] : [W / 2, H * 0.42];
  const at = L.portrait
    ? { DESK: [W * 0.2, 1020], MINI: [W * 0.5, 1180], LAPTOP: [W * 0.8, 1020] }
    : { DESK: [W * 0.16, H * 0.72], MINI: [W * 0.5, H * 0.86], LAPTOP: [W * 0.84, H * 0.72] };
  const copiesFrom = hl ? cues[Math.max(0, hl.indexOf('copies'))].from : 0;
  const copies = hl && hl.indexOf('copies') >= 0 && cue.index >= hl.indexOf('copies');
  const syncing = lit('sync');
  const ca = interpolate(f, [copiesFrom, copiesFrom + 16], [0, 1], clamp);
  return (
    <Area style={{ display: 'block' }}>
      <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
        {copies && WORLD.computers.map((c, i) => {
          const [x, y] = at[c.name];
          const t = ((f + i * 15) % 50) / 50;
          const up = Math.floor((f + i * 15) / 50) % 2 === 0;
          const a = up ? [x, y - 90] : [center[0], center[1] + 110];
          const b = up ? [center[0], center[1] + 110] : [x, y - 90];
          return (
            <g key={c.name} opacity={ca}>
              <line x1={x} y1={y - 90} x2={center[0]} y2={center[1] + 110} stroke={machineColor(c.name)} strokeWidth={4} opacity={0.45} />
              {syncing && <circle cx={a[0] + (b[0] - a[0]) * t} cy={a[1] + (b[1] - a[1]) * t} r={10} fill={machineColor(c.name)} opacity={Math.sin(Math.PI * t)} />}
            </g>
          );
        })}
      </svg>
      <div style={{ position: 'absolute', left: center[0], top: center[1], transform: 'translate(-50%, -50%)' }}>
        <Rise at={0}>
        <Card lit={lit('repo') || lit('private')} style={{ width: L.portrait ? 900 : 860, padding: '38px 46px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Folder size={52} />
            <PathText size={L.portrait ? 42 : 46} weight={700}>{WORLD.fleet_repo}</PathText>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 20 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: lit('private') ? C.accent : 'rgba(224,231,255,0.12)', borderRadius: 999, padding: '8px 20px', fontSize: 28, fontWeight: 700 }}><Lock size={22} /> Private</span>
            <span style={{ fontSize: 30, color: C.text2 }}>on your own GitHub account</span>
          </div>
        </Card>
        </Rise>
      </div>
      {WORLD.computers.map((c) => (
        <div key={c.name} style={{ position: 'absolute', left: at[c.name][0], top: at[c.name][1], transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: copies ? 1 : 0.5 }}>
          <Computer kind={c.kind} size={L.portrait ? 190 : 230} color={machineColor(c.name)} />
          <NamePill name={c.name} />
          <div style={{ opacity: ca, fontFamily: MONO, fontSize: L.portrait ? 24 : 28, color: C.text2, whiteSpace: 'nowrap' }}>Hub/50-AI/fleet-ops</div>
        </div>
      ))}
    </Area>
  );
};

/** What is inside the fleet repo. hl: keys from FLEET_TREE (machines, heartbeats, board ...). */
export const RepoTree = ({ cues, hl }) => {
  const L = useLayout();
  const { lit, any } = useHighlight(cues, hl);
  const f = useCurrentFrame();
  return (
    <Area>
      <Card style={{ width: L.portrait ? 980 : 1500, padding: L.portrait ? '34px 34px' : '36px 56px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <Folder size={44} /><PathText size={36} weight={700}>fleet-ops/</PathText>
        </div>
        {FLEET_TREE.map((r, i) => {
          const a = interpolate(f, [4 + i * 4, 16 + i * 4], [0, 1], clamp);
          const on = lit(r.key) || (Array.isArray(r.key) && r.key.some(lit));
          return (
            <div key={r.name} style={{ display: 'flex', flexDirection: L.portrait ? 'column' : 'row', alignItems: L.portrait ? 'flex-start' : 'center', gap: L.portrait ? 2 : 30, padding: L.portrait ? '10px 0' : '9px 0', paddingLeft: 40 + r.depth * 50, opacity: a * dim(any, on) }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: L.portrait ? undefined : 600 }}>
                {r.file ? <FileIcon size={26} color={C.text2} /> : <Folder size={30} />}
                <PathText size={L.portrait ? 28 : 30} color={on ? C.white : C.text}>{r.name}</PathText>
              </div>
              {r.note && <span style={{ fontSize: L.portrait ? 26 : 30, color: on ? C.white : C.text2, paddingLeft: L.portrait ? 42 : 0 }}>{r.note}</span>}
            </div>
          );
        })}
      </Card>
    </Area>
  );
};

/** The board: backlog, doing, done. GP-04 moves when hl says 'doing' or 'done'; 'commit' shows the log line. */
export const Board = ({ cues, hl, start = 'backlog' }) => {
  const L = useLayout();
  const { lit, cue } = useHighlight(cues, hl);
  const f = useCurrentFrame();
  const cols = ['backlog', 'doing', 'done'];
  const moveIdx = hl ? hl.findIndex((h) => h === 'doing' || (Array.isArray(h) && h.includes('doing'))) : -1;
  const doneIdx = hl ? hl.findIndex((h) => h === 'done' || (Array.isArray(h) && h.includes('done'))) : -1;
  const colW = L.portrait ? 300 : 500;
  const gap = L.portrait ? 20 : 40;
  const cardH = L.portrait ? 120 : 108;
  // Where GP-04 is: its column as a number that slides between whole columns.
  let pos = start === 'doing' ? 1 : 0;
  if (moveIdx >= 0 && start !== 'doing') pos += interpolate(f, [cues[moveIdx].from + 10, cues[moveIdx].from + 34], [0, 1], Object.assign({ easing: Easing.bezier(...EASE_IN_OUT) }, clamp));
  if (doneIdx >= 0) pos += interpolate(f, [cues[doneIdx].from + 10, cues[doneIdx].from + 34], [0, 1], Object.assign({ easing: Easing.bezier(...EASE_IN_OUT) }, clamp));
  const where = cols[Math.round(pos)];
  const OrderCard = ({ o, style }) => (
    <div style={Object.assign({ width: colW - 36, height: cardH, borderRadius: 18, background: o.moves ? 'rgba(124,58,237,0.55)' : 'rgba(224,231,255,0.08)', boxShadow: o.moves ? `0 0 0 3px ${C.accentLight}, 0 18px 40px rgba(0,0,0,0.4)` : '0 0 0 1.5px rgba(224,231,255,0.14)', padding: '16px 20px', boxSizing: 'border-box' }, style || {})}>
      <PathText size={L.portrait ? 24 : 24} color={C.accentLight}>{o.id}</PathText>
      <div style={{ fontSize: L.portrait ? 26 : 28, fontWeight: 700, marginTop: 6, lineHeight: 1.2 }}>{o.title}</div>
    </div>
  );
  const fixed = ORDERS.filter((o) => !o.moves);
  const mover = ORDERS.find((o) => o.moves);
  const moverRow = { backlog: 0, doing: fixed.filter((o) => o.col === 'doing').length, done: fixed.filter((o) => o.col === 'done').length };
  const top = 90;
  const x0 = 18;
  const moverX = x0 + pos * (colW + gap);
  const fromRow = moverRow[cols[Math.floor(pos)]] || 0;
  const toRow = moverRow[cols[Math.min(2, Math.ceil(pos))]] || 0;
  const moverY = top + (fromRow + (toRow - fromRow) * (pos - Math.floor(pos))) * (cardH + 16);
  return (
    <Area column style={{ gap: 26 }}>
      <div style={{ position: 'relative', width: cols.length * colW + (cols.length - 1) * gap, height: top + 4 * (cardH + 16) + 20 }}>
        {cols.map((col, ci) => {
          const list = fixed.filter((o) => o.col === col);
          const offset = col === 'backlog' ? 1 : 0;
          return (
            <div key={col} style={{ position: 'absolute', left: ci * (colW + gap), top: 0, width: colW, height: '100%', borderRadius: 26, background: 'rgba(46,16,101,0.4)', boxShadow: `0 0 0 1.5px ${lit(col) ? C.accentLight : 'rgba(224,231,255,0.12)'}` }}>
              <div style={{ padding: '24px 22px 0', display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span style={{ fontSize: L.portrait ? 30 : 34, fontWeight: 800, textTransform: 'capitalize' }}>{col}</span>
                <PathText size={22} color={C.text3}>board/{col}/</PathText>
              </div>
              {list.map((o, i) => <OrderCard key={o.id} o={o} style={{ position: 'absolute', left: x0, top: top + (i + (col === where ? 0 : 0) + offset * 1) * (cardH + 16) }} />)}
            </div>
          );
        })}
        <OrderCard o={mover} style={{ position: 'absolute', left: moverX, top: moverY - (Math.round(pos) === 0 ? 0 : 0) }} />
      </div>
      <div style={{ height: 70 }}>
        {cue.index >= (moveIdx >= 0 ? moveIdx : doneIdx >= 0 ? doneIdx : 99) && (
          <Rise at={cues[moveIdx >= 0 ? moveIdx : doneIdx].from + 30}>
            <PathText size={L.portrait ? 24 : 30} color={C.text2}>board/{start}/GP-04.md  →  board/{where}/GP-04.md   <span style={{ color: '#86EFAC' }}>saved as a commit by {where === 'done' ? 'DESK' : 'MINI'}</span></PathText>
          </Rise>
        )}
      </div>
    </Area>
  );
};

/** One comms file per computer; only its own computer writes there. hl: names, 'all'. */
export const Comms = ({ cues, hl }) => {
  const L = useLayout();
  const { lit, any } = useHighlight(cues, hl);
  const f = useCurrentFrame();
  return (
    <Area column={L.portrait} style={{ gap: L.portrait ? 18 : 30 }}>
      {WORLD.computers.map((c, ci) => {
        const on = lit(c.name) || lit('all');
        return (
          <Rise key={c.name} at={ci * 5}>
            <Card lit={on && any} color={machineColor(c.name)} style={{ width: L.portrait ? 960 : 590, padding: L.portrait ? '22px 30px' : '32px 32px', opacity: dim(any, on) }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <FileIcon size={30} color={machineColor(c.name)} /><PathText size={30} weight={700}>comms/{c.name}.md</PathText>
              </div>
              {COMMS[c.name].map((line, i) => {
                const a = interpolate(f, [10 + ci * 6 + i * 10, 22 + ci * 6 + i * 10], [0, 1], clamp);
                return <div key={line} style={{ fontFamily: MONO, fontSize: L.portrait ? 24 : 25, color: C.text, padding: '6px 0', opacity: a, whiteSpace: 'nowrap' }}>{line}</div>;
              })}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, fontSize: 24, color: C.text2 }}><Lock size={20} color={machineColor(c.name)} /> only {c.name} writes here</div>
            </Card>
          </Rise>
        );
      })}
    </Area>
  );
};

/** A handoff from DESK to MINI: open, taken, done. hl: 'plan', 'open', 'taken', 'done'. */
export const Handoff = ({ cues, hl }) => {
  const L = useLayout();
  const { lit, cue } = useHighlight(cues, hl);
  const f = useCurrentFrame();
  const W = L.width;
  const H = L.area.h - 30;
  const stops = ['open', 'taken', 'done'];
  const stepOf = (k) => (hl ? hl.indexOf(k) : -1);
  let p = -1;
  for (let s = 0; s < stops.length; s += 1) {
    const i = stepOf(stops[s]);
    if (i >= 0 && cue.index >= i) p = s - 1 + interpolate(f, [cues[i].from + 6, cues[i].from + 30], [0, 1], Object.assign({ easing: Easing.bezier(...EASE_IN_OUT) }, clamp));
  }
  const desk = L.portrait ? [W / 2, 150] : [W * 0.1, H * 0.45];
  const mini = L.portrait ? [W / 2, 1290] : [W * 0.9, H * 0.45];
  const slot = (s) => (L.portrait ? [W / 2, 420 + s * 270] : [W * 0.3 + s * W * 0.2, H * 0.45]);
  const from = p < 0 ? desk : slot(Math.max(0, Math.floor(p)));
  const to = p < 0 ? slot(0) : slot(Math.min(2, Math.ceil(p)));
  const k = p < 0 ? (p + 1) : p - Math.floor(p);
  const cardAt = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
  const show = p > -1 || (stepOf('open') >= 0 && cue.index >= stepOf('open'));
  const who = p >= 0.5 ? 'MINI' : 'DESK';
  return (
    <Area style={{ display: 'block' }}>
      {[['DESK', desk], ['MINI', mini]].map(([name, at]) => (
        <div key={name} style={{ position: 'absolute', left: at[0], top: at[1], transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: (name === 'DESK' && (lit('plan') || p < 0.5)) || (name === 'MINI' && p >= 0.5) ? 1 : 0.45 }}>
          <Computer kind={name === 'DESK' ? 'desktop' : 'mini PC'} size={L.portrait ? 180 : 250} color={machineColor(name)} glow={(name === 'DESK' && lit('plan')) || (name === 'MINI' && lit('taken')) ? 1 : 0} />
          <NamePill name={name} />
        </div>
      ))}
      {stops.map((s, i) => {
        const [x, y] = slot(i);
        return (
          <div key={s} style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)', width: L.portrait ? 560 : 340, height: L.portrait ? 220 : 360, borderRadius: 24, border: `3px dashed ${lit(s) ? C.accentLight : 'rgba(224,231,255,0.2)'}`, display: 'flex', alignItems: L.portrait ? 'flex-start' : 'flex-end', justifyContent: L.portrait ? 'flex-start' : 'center', padding: 16, boxSizing: 'border-box' }}>
            <PathText size={26} color={lit(s) ? C.white : C.text3}>handoffs/{s}/</PathText>
          </div>
        );
      })}
      {show && (
        <div style={{ position: 'absolute', left: cardAt[0], top: cardAt[1] - (L.portrait ? 0 : 30), transform: 'translate(-50%, -50%)' }}>
          <Card lit style={{ width: L.portrait ? 440 : 300, padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><FileIcon size={26} color={C.accentLight} /><PathText size={28} weight={700}>H-007.md</PathText></div>
            <div style={{ fontSize: 27, marginTop: 8, lineHeight: 1.3 }}>Build GP-04 frost dates</div>
            <div style={{ fontSize: 23, color: C.text2, marginTop: 6 }}>to MINI · {p >= 1.5 ? 'done' : p >= 0.5 ? `taken by ${who}` : 'from DESK'}</div>
          </Card>
        </div>
      )}
    </Area>
  );
};

/** The daily sync on each computer. hl: 'clock', 'steps', 'stop', 'os'. */
export const DailySync = ({ cues, hl }) => {
  const L = useLayout();
  const { lit } = useHighlight(cues, hl);
  const steps = [
    { k: 'Pull', line: 'catch up with the others', icon: '↓' },
    { k: 'Heartbeat', line: 'heartbeats/MINI.json says 09:00', icon: '♥' },
    { k: 'Push', line: 'share its own files', icon: '↑' },
  ];
  const stopAt = hl ? cues[Math.max(0, hl.indexOf('stop'))].from : 0;
  const osAt = hl ? cues[Math.max(0, hl.indexOf('os'))].from : 0;
  return (
    <Area column style={{ gap: L.portrait ? 30 : 40 }}>
      <Rise at={0}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, fontSize: L.portrait ? 40 : 44, fontWeight: 800, opacity: lit('clock') || lit('steps') || lit('stop') || lit('os') ? 1 : 0.6 }}>
          <svg width="64" height="64" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke={C.accentLight} strokeWidth="2.2" /><path d="M12 6v6l4 2" fill="none" stroke={C.accentLight} strokeWidth="2.2" strokeLinecap="round" /></svg>
          Every day, by itself
        </div>
      </Rise>
      <div style={{ display: 'flex', flexDirection: L.portrait ? 'column' : 'row', gap: L.portrait ? 18 : 34, alignItems: 'center' }}>
        {steps.map((s, i) => (
          <React.Fragment key={s.k}>
            <Rise at={6 + i * 6}>
              <Card lit={lit('steps')} style={{ width: L.portrait ? 900 : 460, padding: '30px 34px', display: 'flex', alignItems: 'center', gap: 24 }}>
                <span style={{ fontSize: 60, color: C.accentLight, width: 60, textAlign: 'center' }}>{s.icon}</span>
                <div><div style={{ fontSize: 40, fontWeight: 800 }}>{s.k}</div><div style={{ fontSize: 26, color: C.text2, marginTop: 6, fontFamily: s.k === 'Heartbeat' ? MONO : FONT }}>{s.line}</div></div>
              </Card>
            </Rise>
            {i < steps.length - 1 && !L.portrait && <span style={{ fontSize: 50, color: C.text3 }}>→</span>}
          </React.Fragment>
        ))}
      </div>
      <div style={{ height: L.portrait ? 120 : 90, display: 'flex', gap: 24, alignItems: 'center' }}>
        {lit('stop') && (
          <Rise at={stopAt}>
            <span style={{ background: 'rgba(244,63,94,0.16)', color: '#FDA4AF', borderRadius: 999, padding: '16px 32px', fontSize: L.portrait ? 30 : 34, fontWeight: 700 }}>Anything else changed? It stops and says what.</span>
          </Rise>
        )}
        {lit('os') && (
          <Rise at={osAt} style={{ display: 'flex', gap: 24 }}>
            {['Windows', 'macOS'].map((o) => <span key={o} style={{ background: 'rgba(124,58,237,0.3)', boxShadow: `0 0 0 2px ${C.accentLight}`, borderRadius: 999, padding: '14px 32px', fontSize: 34, fontWeight: 700 }}>{o}</span>)}
          </Rise>
        )}
      </div>
    </Area>
  );
};
