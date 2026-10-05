// machines.jsx — the drawn diagrams about several computers: the three invented computers and
// their roles, each one's own Hub (and the two values that may differ), and the one office they
// share over a private tailnet, with the phone.

import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { C, FONT, MONO } from '../brand';
import { Area, useHighlight, useLayout } from '../components/Area';
import { Card, Computer, Folder, PathText, Rise, machineColor } from '../components/ui';
import { Orb } from '../components/Orb';
import { ROLE_WORD, WORLD, ZONES } from '../data/world';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const dim = (any, lit) => (any && !lit ? 0.35 : 1);

const NamePill = ({ name, size = 30 }) => (
  <span style={{ background: machineColor(name), color: '#0D0524', fontFamily: MONO, fontWeight: 700, fontSize: size, borderRadius: 999, padding: '6px 20px', letterSpacing: '0.04em' }}>{name}</span>
);

/** The three computers and their roles. hl: computer indexes or 'all'. */
export const Computers = ({ cues, hl }) => {
  const L = useLayout();
  const { lit, any } = useHighlight(cues, hl);
  return (
    <Area column={L.portrait} style={{ gap: L.portrait ? 26 : 40 }}>
      {WORLD.computers.map((c, i) => (
        <Rise key={c.name} at={i * 6}>
          <Card lit={lit(i)} color={machineColor(c.name)} style={{ width: L.portrait ? 940 : 540, padding: L.portrait ? '26px 36px' : '40px 40px', opacity: dim(any, lit(i)), display: 'flex', flexDirection: L.portrait ? 'row' : 'column', alignItems: 'center', gap: L.portrait ? 30 : 18, textAlign: L.portrait ? 'left' : 'center' }}>
            <Computer kind={c.kind} size={L.portrait ? 200 : 250} color={machineColor(c.name)} glow={lit(i) ? 1 : 0} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: L.portrait ? 'flex-start' : 'center', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><NamePill name={c.name} /><span style={{ fontSize: 28, color: C.text3 }}>{c.kind}</span></div>
              <div style={{ fontSize: 38, fontWeight: 800 }}>{ROLE_WORD[c.role]}</div>
              <div style={{ fontSize: 28, color: C.text2, lineHeight: 1.3, maxWidth: 440 }}>{c.duty}</div>
            </div>
          </Card>
        </Rise>
      ))}
    </Area>
  );
};

/** Each computer's own Hub. hl: 'root' (where it is), 'code' (its code folder), 'json', 'all'. */
export const Hubs = ({ cues, hl }) => {
  const L = useLayout();
  const { lit } = useHighlight(cues, hl);
  const root = lit('root');
  const code = lit('code');
  const json = lit('json');
  const mark = (on) => (on ? { background: 'rgba(168,85,247,0.28)', boxShadow: `0 0 0 2px ${C.accentLight}`, borderRadius: 10 } : {});
  return (
    <Area column style={{ gap: 26 }}>
      <div style={{ display: 'flex', flexDirection: L.portrait ? 'column' : 'row', gap: L.portrait ? 18 : 34 }}>
        {WORLD.computers.map((c, i) => (
          <Rise key={c.name} at={i * 5}>
            <Card style={{ width: L.portrait ? 940 : 540, padding: L.portrait ? '22px 30px' : '30px 34px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}><NamePill name={c.name} size={26} /><span style={{ fontSize: 24, color: C.text3 }}>{c.os}</span></div>
              <div style={Object.assign({ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 10px' }, mark(root))}>
                <Folder size={30} /><PathText size={26} weight={700}>{c.hub_root}</PathText>
              </div>
              {!L.portrait && (
                <div style={{ paddingLeft: 34, marginTop: 6 }}>
                  {ZONES.map((z) => (
                    <div key={z.dir} style={{ fontFamily: MONO, fontSize: 22, color: C.text2, padding: '4px 10px', ...(z.dir === '20-Coding' ? mark(code) : {}) }}>
                      {z.dir === '20-Coding' ? `${c.code_zone}/` : `${z.dir}/`}
                    </div>
                  ))}
                </div>
              )}
              {L.portrait && (
                <div style={Object.assign({ fontFamily: MONO, fontSize: 24, color: C.text2, padding: '6px 10px', marginTop: 6 }, mark(code))}>code: {c.code_zone}/</div>
              )}
            </Card>
          </Rise>
        ))}
      </div>
      {json && (
        <Rise at={cues[hl.indexOf('json')].from}>
          <Card lit style={{ padding: '22px 34px', fontFamily: MONO, fontSize: L.portrait ? 24 : 26, color: C.text }}>
            <span style={{ color: C.text3 }}>.hub/hub.json on MINI  </span>
            {'{ "machine": "MINI", "role": "builder", "code_zone": "20-Coding/Active" }'}
          </Card>
        </Rise>
      )}
    </Area>
  );
};

/** A dot that runs along a line again and again: one floor sent to the office. */
const Feed = ({ x1, y1, x2, y2, phase = 0, period = 45, color }) => {
  const f = useCurrentFrame();
  const t = ((f + phase) % period) / period;
  return <circle cx={x1 + (x2 - x1) * t} cy={y1 + (y2 - y1) * t} r={9} fill={color} opacity={Math.sin(Math.PI * t)} />;
};

/**
 * One office for every computer, over the tailnet. hl per line: 'office', 'tailnet', 'feeds',
 * 'private', 'phone', 'all'.
 */
export const Mesh = ({ cues, hl, phone = false }) => {
  const L = useLayout();
  const { lit, cue } = useHighlight(cues, hl);
  const W = L.width;
  const H = L.area.h - 30;
  const pos = L.portrait
    ? { DESK: [W / 2, 300], MINI: [W * 0.25, 900], LAPTOP: [W * 0.75, 900], PHONE: [W / 2, 1250] }
    : { DESK: [W * 0.3, H * 0.5], MINI: [W * 0.72, H * 0.24], LAPTOP: [W * 0.72, H * 0.76], PHONE: [W * 0.9, H * 0.5] };
  const showPhone = phone || lit('phone');
  const feeds = lit('feeds') || lit('all') || lit('private') || cue.index >= (hl ? Math.max(0, hl.indexOf('feeds')) : 0);
  const tail = lit('tailnet') || lit('all');
  const nodes = WORLD.computers.map((c) => ({ name: c.name, kind: c.kind, at: pos[c.name], hub: c.hub }));
  const pv = lit('private');
  return (
    <Area style={{ display: 'block' }}>
      <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
        <rect x={L.portrait ? 50 : 140} y={20} width={L.portrait ? W - 100 : W - 280} height={H - 40} rx={48} fill="none" stroke={tail ? C.accentLight : C.line} strokeWidth={tail ? 4 : 2.5} strokeDasharray="16 14" />
        {nodes.filter((n) => !n.hub).map((n, i) => (
          <g key={n.name}>
            <line x1={n.at[0]} y1={n.at[1]} x2={pos.DESK[0]} y2={pos.DESK[1]} stroke={machineColor(n.name)} strokeWidth={4} opacity={0.5} />
            {feeds && <Feed x1={n.at[0]} y1={n.at[1]} x2={pos.DESK[0]} y2={pos.DESK[1]} phase={i * 20} color={machineColor(n.name)} />}
          </g>
        ))}
        {showPhone && <line x1={pos.PHONE[0]} y1={pos.PHONE[1]} x2={pos.DESK[0]} y2={pos.DESK[1]} stroke={C.text2} strokeWidth={4} strokeDasharray="4 10" opacity={0.7} />}
      </svg>
      <div style={{ position: 'absolute', left: L.portrait ? 90 : 190, top: 44, fontFamily: MONO, fontSize: 26, letterSpacing: '0.12em', color: tail ? C.white : C.text3 }}>YOUR TAILNET · PRIVATE · {WORLD.tailnet}</div>
      {nodes.map((n) => (
        <div key={n.name} style={{ position: 'absolute', left: n.at[0], top: n.at[1], transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Computer kind={n.kind} size={n.hub ? 300 : 230} color={machineColor(n.name)} glow={n.hub && lit('office') ? 1 : 0} />
          <NamePill name={n.name} />
          {n.hub && <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 28, fontWeight: 700, marginTop: 4 }}><Orb size={24} /> runs the office</span>}
        </div>
      ))}
      {showPhone && (
        <div style={{ position: 'absolute', left: pos.PHONE[0], top: pos.PHONE[1], transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <Computer kind="phone" size={180} color={C.text} glow={lit('phone') ? 0.8 : 0} />
          <span style={{ fontSize: 28, fontWeight: 700 }}>your phone</span>
        </div>
      )}
      {!L.portrait && feeds && !pv && (
        <div style={{ position: 'absolute', left: W * 0.5, top: H * 0.5, transform: 'translate(-50%, -50%)', fontFamily: MONO, fontSize: 26, color: C.text2, background: 'rgba(13,5,36,0.8)', padding: '8px 18px', borderRadius: 12 }}>every 15 s</div>
      )}
      {pv && (
        <Rise at={cues[hl.indexOf('private')].from} style={{ position: 'absolute', left: L.portrait ? W / 2 - 420 : W * 0.47 - 330, top: L.portrait ? 1130 : 84 }}>
          <Card lit style={{ width: L.portrait ? 840 : 660, padding: '24px 34px', fontSize: 32, lineHeight: 1.6 }}>
            <div style={{ color: '#86EFAC', fontWeight: 700 }}>✓ what each session is doing</div>
            <div style={{ color: '#FDA4AF' }}>✗ no prompts  ✗ no files  ✗ no messages</div>
          </Card>
        </Rise>
      )}
    </Area>
  );
};
