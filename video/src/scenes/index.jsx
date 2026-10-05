// scenes/index.jsx — every scene a script can name, and the scenes built from screenshots, windows
// and terminals.
//
// Times inside a scene's props are seconds from the scene's start, or a caption line: 'c2' is
// when the third line begins, 'c2+0.6' is 0.6 s after that. That way a zoom or a tap lands on the
// line that talks about it, however long the lines turn out to be.

import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { C, FONT, MONO } from '../brand';
import { Area, useLayout } from '../components/Area';
import { Shot, boxAspect, browserSize, shotOf } from '../components/Shot';
import { Terminal } from '../components/Terminal';
import { DesktopAppWindow, EditorWindow } from '../components/AppWindow';
import TERMINAL from '../data/terminal.json';
import { BrandOpen, ChapterCard, Offer, TitleCard } from './cards';
import { NavMap, ProjectRules, RuleBook, Skills, ThreeParts, Zones } from '../diagrams/hub';
import { Computers, Hubs, Mesh } from '../diagrams/machines';
import { Board, Comms, DailySync, FleetRepo, Handoff, RepoTree } from '../diagrams/fleet';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

/** 'c2+0.6' -> seconds from the scene start. */
export function resolveTime(t, cues) {
  if (typeof t === 'number') return t;
  const m = /^c(\d+)([+-][\d.]+)?$/.exec(String(t || '0'));
  if (!m) return Number(t) || 0;
  const cue = cues[Math.min(Number(m[1]), cues.length - 1)];
  return cue.from / 30 + (m[2] ? Number(m[2]) : 0);
}

function resolveAll(list, cues, fields) {
  return (list || []).map((x) => {
    const y = Object.assign({}, x);
    for (const k of fields) if (y[k] != null) y[k] = resolveTime(y[k], cues);
    return y;
  });
}

function timed(p, cues) {
  return {
    keys: p.keys ? resolveAll(p.keys, cues, ['at']) : undefined,
    swaps: resolveAll(p.swaps, cues, ['at', 'until']),
    marks: resolveAll(p.marks, cues, ['from', 'to']),
    taps: resolveAll(p.taps, cues, ['at']),
    labels: resolveAll(p.labels, cues, ['from', 'to']),
  };
}

/** A screenshot in a browser window (or a cropped card), with its camera, marks and taps. */
const ShotScene = (p) => {
  const L = useLayout();
  const t = timed(p, p.cues);
  let w;
  let h;
  if (p.frame === 'card') {
    // A crop is shaped like the part it shows first, within the space under the caption band.
    const maxW = p.w || (L.portrait ? 960 : 1600);
    const maxH = L.portrait ? 1340 : L.area.h - 70;
    const first = t.keys && t.keys[0];
    const aspect = first && first.box && first.box !== 'full' ? boxAspect(p.shot, first.box, first.pad == null ? 20 : first.pad) : maxW / maxH;
    w = maxW; h = p.h || Math.round(w / aspect);
    if (h > maxH) { h = maxH; w = Math.round(h * aspect); }
  } else if (p.size === 'wide' && !L.portrait) {
    w = 1720; h = L.area.h - 50;
  } else {
    const maxW = L.portrait ? 1000 : 1720;
    const maxH = L.portrait ? 1350 : L.area.h - 50;
    const s = browserSize(p.shot, maxW);
    if (s.h > maxH) { const k = (maxH - 50) / (s.h - 50); w = Math.round(maxW * k); h = maxH; } else { w = s.w; h = s.h; }
  }
  const keys = t.keys || (p.size === 'wide' ? [{ at: 0, box: 'full', fit: 'cover', top: true }] : undefined);
  return (
    <Area>
      <Shot shot={p.shot} frame={p.frame || 'browser'} w={w} h={h} keys={keys} swaps={t.swaps} marks={t.marks} taps={t.taps} labels={t.labels} address={p.address} title={p.title} />
    </Area>
  );
};

/**
 * A phone showing the office, with an optional address bar. In a landscape frame the phone is
 * drawn large and runs off the bottom edge, so its screen is readable; a desktop shot can stand
 * beside it.
 */
const PhoneScene = (p) => {
  const L = useLayout();
  const t = timed(p, p.cues);
  const m = shotOf(p.shot);
  const h = L.portrait ? 1420 : Math.round(L.area.h * 1.62);
  const w = Math.round(h * (m.width / m.height) * 1.02);
  const beside = p.beside && !L.portrait;
  return (
    <Area style={L.portrait ? { gap: 80 } : { gap: 90, alignItems: 'flex-start', paddingTop: 26, overflow: 'hidden' }}>
      {beside && <div style={{ marginTop: 60 }}><Shot shot={p.beside} frame="browser" {...browserSize(p.beside, 1000)} address={p.besideAddress} keys={p.besideKeys} /></div>}
      <Shot shot={p.shot} frame="phone" w={w} h={h} keys={t.keys} swaps={t.swaps} marks={t.marks} taps={t.taps} labels={t.labels} address={p.address} />
    </Area>
  );
};

/** A session started from an app window (cue 0), then the floor it lands on (cue 1 onwards). */
const LaunchScene = (p) => {
  const L = useLayout();
  const f = useCurrentFrame();
  const switchAt = p.cues[1] ? p.cues[1].from : 1e9;
  const out = interpolate(f, [switchAt, switchAt + 14], [1, 0], clamp);
  const s = browserSize(p.shot, L.portrait ? 1000 : 1720);
  const maxH = L.area.h - 50;
  const k = s.h > maxH ? (maxH - 50) / (s.h - 50) : 1;
  const sw = Math.round(s.w * k);
  const sh = Math.min(s.h, maxH);
  const at = switchAt / 30;
  const Win = p.app === 'desktop' ? DesktopAppWindow : EditorWindow;
  const ww = L.portrait ? 1000 : 1640;
  const wh = L.portrait ? 1200 : L.area.h - 70;
  return (
    <Area>
      {f >= switchAt && (
        <div style={{ position: 'absolute', opacity: 1 - out }}>
          <Shot shot={p.shot} frame="browser" w={sw} h={sh}
            keys={[{ at: 0, box: 'full' }, { at: at + 0.7, box: p.target, pad: 60, dur: 1.1 }]}
            marks={[{ from: at + 1.6, to: 99, box: p.target }]} />
        </div>
      )}
      {out > 0 && (
        // The window, then a slow push toward where the prompt is typed: the piece that matters.
        <div style={{ position: 'absolute', opacity: out, transform: `scale(${(0.97 + out * 0.03) * interpolate(f, [8, 46], [1, L.portrait ? 1.25 : 1.45], clamp)})`, transformOrigin: p.app === 'desktop' ? '62% 88%' : '86% 86%' }}>
          <Win w={ww} h={wh} prompt={p.prompt} sendAt={Math.min(switchAt - 40, 30 * 3.4)} />
        </div>
      )}
    </Area>
  );
};

/** A terminal showing a command and its real output. Marked DRAFT until that output is captured. */
const TerminalScene = (p) => {
  const L = useLayout();
  const tm = TERMINAL[p.name];
  if (!tm) throw new Error(`No terminal transcript called "${p.name}" in src/data/terminal.json.`);
  const fontSize = L.portrait ? 26 : 30;
  const w = L.portrait ? 1010 : 1680;
  // Rows as they will wrap at this width (a monospace character is about 0.6 of the font size).
  const perRow = Math.floor((w - 48) / (fontSize * 0.6));
  const rowsOf = (s) => Math.max(1, Math.ceil(s.length / perRow));
  const rows = tm.steps.reduce((n, s) => n + rowsOf(`${tm.prompt} ${s.cmd}`) + (s.out || []).reduce((k, o) => k + rowsOf(o), 0), 0);
  const h = Math.min(L.portrait ? 1300 : L.area.h - 90, 110 + rows * fontSize * 1.45);
  return (
    <Area column style={{ gap: 24 }}>
      <div style={{ position: 'relative' }}>
        <Terminal w={w} h={h} title={tm.title} prompt={tm.prompt} steps={tm.steps} fontSize={fontSize} cps={tm.cps || 30} at={resolveTime(p.at || 0.4, p.cues)} />
        {tm.draft && (
          <div style={{ position: 'absolute', right: 24, bottom: 20, fontFamily: MONO, fontWeight: 700, fontSize: 30, color: '#FDA4AF', border: '3px solid #FDA4AF', borderRadius: 10, padding: '4px 14px', transform: 'rotate(-4deg)' }}>DRAFT</div>
        )}
      </div>
      {p.note && <div style={{ fontFamily: FONT, fontSize: 30, color: C.text2 }}>{p.note}</div>}
    </Area>
  );
};

export const SCENES = {
  brand: BrandOpen,
  title: TitleCard,
  chapter: ChapterCard,
  offer: Offer,
  three: ThreeParts,
  zones: Zones,
  rules: RuleBook,
  nav: NavMap,
  project: ProjectRules,
  skills: Skills,
  computers: Computers,
  hubs: Hubs,
  mesh: Mesh,
  repo: FleetRepo,
  tree: RepoTree,
  board: Board,
  comms: Comms,
  handoff: Handoff,
  sync: DailySync,
  shot: ShotScene,
  phone: PhoneScene,
  launch: LaunchScene,
  terminal: TerminalScene,
};
