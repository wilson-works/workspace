// hub.jsx — the drawn diagrams about one computer's Hub: the three parts, the zones, the rule book
// (CLAUDE.md), the plain-English map (NAV.md), a project's own rules, and the starter skills.

import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { C, FONT, MONO } from '../brand';
import { Area, useHighlight, useLayout } from '../components/Area';
import { Card, FileIcon, Folder, PathText, Rise, useAppear } from '../components/ui';
import { Orb } from '../components/Orb';
import { NAV, PROJECT_RULES, RULES, SKILLS, WORLD, ZONES } from '../data/world';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const dim = (any, lit) => (any && !lit ? 0.38 : 1);

const Icon = ({ kind, size }) => {
  if (kind === 'hub') return <Folder size={size} />;
  if (kind === 'office') return <Orb size={size * 0.9} glow />;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <path d="M20 3l4.5 10.5L35 18l-10.5 4.5L20 33l-4.5-10.5L5 18l10.5-4.5z" fill={C.accentLight} />
      <circle cx="33" cy="33" r="4" fill={C.accentLight} opacity="0.7" />
    </svg>
  );
};

/** The Workspace's three parts, side by side. hl: 0 Hub, 1 skills, 2 office. */
export const ThreeParts = ({ cues, hl }) => {
  const L = useLayout();
  const { lit, any } = useHighlight(cues, hl);
  const parts = [
    { kind: 'hub', name: 'The Hub', line: 'Your work in one place, with a map Claude follows.' },
    { kind: 'skills', name: 'Starter skills', line: 'Ready-made instructions for common jobs.' },
    { kind: 'office', name: 'The office', line: 'Every session at a desk, live.' },
  ];
  return (
    <Area column={L.portrait} style={{ gap: L.portrait ? 40 : 48 }}>
      {parts.map((p, i) => (
        <Rise key={p.name} at={i * 6}>
          <Card lit={lit(i)} style={{ width: L.portrait ? 880 : 520, padding: L.portrait ? '40px 48px' : '54px 46px', opacity: dim(any, lit(i)), display: 'flex', flexDirection: L.portrait ? 'row' : 'column', alignItems: L.portrait ? 'center' : 'flex-start', gap: 28 }}>
            <Icon kind={p.kind} size={L.portrait ? 96 : 110} />
            <div>
              <div style={{ fontSize: L.portrait ? 50 : 52, fontWeight: 800, letterSpacing: '-0.02em' }}>{p.name}</div>
              <div style={{ fontSize: L.portrait ? 32 : 32, color: C.text2, marginTop: 12, lineHeight: 1.3 }}>{p.line}</div>
            </div>
          </Card>
        </Rise>
      ))}
    </Area>
  );
};

/** The Hub's zones as a folder tree, each with its plain line. hl: zone indexes, 'root', or 'all'. */
export const Zones = ({ cues, hl, root, compact }) => {
  const L = useLayout();
  const { lit, any } = useHighlight(cues, hl);
  const f = useCurrentFrame();
  const rowH = L.portrait ? 150 : compact ? 74 : 84;
  const w = L.portrait ? 960 : 1500;
  const rootLit = lit('root');
  return (
    <Area>
      <div style={{ width: w, fontFamily: FONT, color: C.text }}>
        <Rise at={0}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 18, opacity: any && !rootLit && !lit('all') ? 0.5 : 1 }}>
            <Folder size={L.portrait ? 64 : 58} />
            <PathText size={L.portrait ? 44 : 44} weight={700} color={rootLit ? C.white : C.text}>{root || WORLD.computers[0].hub_root}</PathText>
          </div>
        </Rise>
        {ZONES.map((z, i) => {
          const a = interpolate(f, [6 + i * 4, 18 + i * 4], [0, 1], clamp);
          const on = lit(i) || lit('all');
          return (
            <div key={z.dir} style={{ opacity: a * dim(any, on), transform: `translateX(${(1 - a) * 30}px)`, display: 'flex', flexDirection: L.portrait ? 'column' : 'row', alignItems: L.portrait ? 'flex-start' : 'center', gap: L.portrait ? 6 : 34, height: rowH, paddingLeft: 60, borderLeft: `3px solid ${C.line}`, marginLeft: 26, justifyContent: L.portrait ? 'center' : 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: L.portrait ? undefined : 420 }}>
                <Folder size={L.portrait ? 44 : 40} color={on && any ? C.white : C.accentLight} />
                <PathText size={L.portrait ? 42 : 38} weight={700} color={on && any ? C.white : C.text}>{z.dir}</PathText>
              </div>
              <div style={{ fontSize: L.portrait ? 34 : 34, color: on && any ? C.white : C.text2, paddingLeft: L.portrait ? 60 : 0 }}>{z.line}</div>
            </div>
          );
        })}
      </div>
    </Area>
  );
};

/** The Hub's CLAUDE.md: the rule book Claude reads first. hl: rule indexes. */
export const RuleBook = ({ cues, hl }) => {
  const L = useLayout();
  const { lit, any } = useHighlight(cues, hl);
  return (
    <Area>
      <Card style={{ width: L.portrait ? 960 : 1420, padding: L.portrait ? '44px 48px' : '46px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 26 }}>
          <FileIcon size={40} color={C.accentLight} />
          <PathText size={36} weight={700}>CLAUDE.md</PathText>
          <span style={{ fontSize: 30, color: C.text3 }}>· the Hub's rule book</span>
        </div>
        {RULES.map((r, i) => (
          <Rise key={r.head} at={6 + i * 5}>
            <div style={{ display: 'flex', gap: 28, alignItems: 'baseline', padding: L.portrait ? '22px 0' : '18px 0', borderTop: `1.5px solid ${C.line}`, opacity: dim(any, lit(i)) }}>
              <span style={{ fontFamily: MONO, fontSize: 34, color: C.accentLight, width: 40 }}>{i + 1}</span>
              <div>
                <div style={{ fontSize: L.portrait ? 42 : 42, fontWeight: 800, color: lit(i) ? C.white : C.text }}>{r.head}</div>
                <div style={{ fontSize: L.portrait ? 32 : 32, color: C.text2, marginTop: 6 }}>{r.line}</div>
              </div>
            </div>
          </Rise>
        ))}
      </Card>
    </Area>
  );
};

/** NAV.md: what you say, and the folder Claude opens. hl: row indexes, or 'rule' for the last line. */
export const NavMap = ({ cues, hl }) => {
  const L = useLayout();
  const { lit, any } = useHighlight(cues, hl);
  const f = useCurrentFrame();
  const ruleOn = lit('rule');
  return (
    <Area column style={{ gap: 30 }}>
      <Card style={{ width: L.portrait ? 1000 : 1500, padding: L.portrait ? '44px 40px' : '40px 56px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <FileIcon size={40} color={C.accentLight} />
          <PathText size={36} weight={700}>NAV.md</PathText>
          <span style={{ fontSize: 30, color: C.text3 }}>· the Hub's map, in plain English</span>
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: C.text3, letterSpacing: '0.12em', fontFamily: MONO, paddingBottom: 10 }}>
          <span style={{ width: L.portrait ? 420 : 560 }}>YOU SAY</span><span>CLAUDE OPENS</span>
        </div>
        {NAV.map((n, i) => {
          const a = interpolate(f, [8 + i * 6, 20 + i * 6], [0, 1], clamp);
          const on = lit(i);
          return (
            <div key={n.say} style={{ display: 'flex', alignItems: L.portrait ? 'flex-start' : 'center', flexDirection: L.portrait ? 'column' : 'row', gap: L.portrait ? 6 : 0, padding: L.portrait ? '18px 0' : '14px 0', borderTop: `1.5px solid ${C.line}`, opacity: a * dim(any && !ruleOn, on) }}>
              <span style={{ width: L.portrait ? undefined : 560, fontSize: L.portrait ? 42 : 38, fontWeight: 700, color: on ? C.white : C.text }}>“{n.say}”</span>
              <PathText size={L.portrait ? 32 : 32} color={on ? C.white : C.accentLight}>{L.portrait ? `→ ${n.path}` : n.path}</PathText>
            </div>
          );
        })}
      </Card>
      {ruleOn && (
        <Rise at={cues[Math.max(0, hl.indexOf('rule'))].from}>
          <div style={{ display: 'flex', gap: 24, fontSize: L.portrait ? 30 : 34, fontWeight: 700, flexDirection: L.portrait ? 'column' : 'row', alignItems: 'center' }}>
            <span style={{ background: 'rgba(34,197,94,0.18)', color: '#86EFAC', borderRadius: 999, padding: '12px 26px' }}>✓ Follows the map</span>
            <span style={{ background: 'rgba(244,63,94,0.16)', color: '#FDA4AF', borderRadius: 999, padding: '12px 26px' }}>✗ Never searches every folder</span>
          </div>
        </Rise>
      )}
    </Area>
  );
};

/** A project's own CLAUDE.md, beside the Hub's. */
export const ProjectRules = ({ cues }) => {
  const L = useLayout();
  const { cue } = useHighlight(cues, null);
  const second = useAppear(cues[1] ? cues[1].from : 0, 14);
  return (
    <Area column={L.portrait} style={{ gap: L.portrait ? 40 : 70 }}>
      <Rise at={0}>
        <Card style={{ width: L.portrait ? 900 : 560, padding: '36px 40px', opacity: cue.index > 0 ? 0.55 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Folder size={44} /><PathText size={34} weight={700}>Hub</PathText></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, paddingLeft: 30 }}><FileIcon size={30} color={C.accentLight} /><PathText size={28}>CLAUDE.md</PathText></div>
          <div style={{ fontSize: 28, color: C.text2, marginTop: 10, paddingLeft: 30 }}>Rules for everything</div>
        </Card>
      </Rise>
      <div style={{ fontSize: 60, color: C.accentLight }}>{L.portrait ? '↓' : '→'}</div>
      <Rise at={8}>
        <Card lit={cue.index > 0} style={{ width: L.portrait ? 900 : 920, padding: '36px 44px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Folder size={44} /><PathText size={L.portrait ? 28 : 32} weight={700}>20-Coding/Projects/garden-planner</PathText></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, paddingLeft: 30 }}><FileIcon size={30} color={C.accentLight} /><PathText size={28}>CLAUDE.md</PathText></div>
          <div style={{ paddingLeft: 30, marginTop: 12 }}>
            {PROJECT_RULES.map((r, i) => <div key={r} style={{ fontSize: 30, color: C.text, padding: '7px 0', opacity: i === 0 ? 1 : Math.max(0.55, second) }}>· {r}</div>)}
          </div>
        </Card>
      </Rise>
    </Area>
  );
};

/** The starter skills, each with its plain line. hl: 'pin' shows the pinned-version note. */
export const Skills = ({ cues, hl, limit }) => {
  const L = useLayout();
  const { lit } = useHighlight(cues, hl);
  const f = useCurrentFrame();
  const list = SKILLS.skills.slice(0, limit || SKILLS.skills.length);
  const cols = L.portrait ? 2 : 3;
  const w = L.portrait ? 960 : 1660;
  return (
    <Area column style={{ gap: 28 }}>
      <div style={{ width: w, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: L.portrait ? 18 : 20 }}>
        {list.map((s, i) => {
          const a = interpolate(f, [4 + i * 3, 16 + i * 3], [0, 1], clamp);
          return (
            <div key={s.name} style={{ opacity: a, transform: `scale(${0.92 + a * 0.08})`, background: 'rgba(46,16,101,0.5)', borderRadius: 20, padding: L.portrait ? '20px 22px' : '20px 26px', boxShadow: '0 0 0 1.5px rgba(224,231,255,0.14)' }}>
              <PathText size={L.portrait ? 36 : 30} weight={700} color={C.white}>{s.name}</PathText>
              <div style={{ fontSize: L.portrait ? 29 : 25, color: C.text2, marginTop: 6, lineHeight: 1.3 }}>{s.line}</div>
            </div>
          );
        })}
      </div>
      {lit('pin') && (
        <Rise at={cues[hl.indexOf('pin')].from}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14, background: 'rgba(124,58,237,0.3)', borderRadius: 999, padding: '14px 30px', fontSize: L.portrait ? 30 : 32, fontWeight: 700, boxShadow: `0 0 0 2px ${C.accentLight}` }}>
            <svg width="30" height="30" viewBox="0 0 24 24"><path d="M14 3l7 7-3 1-4 4 1 5-2 1-4-5-5 5-1-1 5-5-5-4 1-2 5 1 4-4z" fill={C.accentLight} /></svg>
            The free skills pack, pinned to one version
          </span>
        </Rise>
      )}
    </Area>
  );
};
