// Terminal.jsx — a terminal window showing a command and its output.
//
// The text comes from src/data/terminal.json: real output captured from a sandbox run, with the
// sandbox folder shown as the invented person's own folder (see that file). A command types itself
// in after the prompt; its output then appears a line at a time. A line that is just "…" marks
// where an excerpt leaves lines out, drawn dim.

import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { C, MONO, FONT, sec } from '../brand';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

const tone = (line) => {
  const t = line.trimStart();
  if (t === '…') return '#6B6390';
  if (t.startsWith('+')) return '#86EFAC';
  if (t.startsWith('~')) return '#FCD34D';
  if (t.startsWith('!')) return '#FDA4AF';
  if (t.startsWith('-')) return '#FCA5A5';
  if (t.startsWith('=')) return '#A5B4FC';
  return '#D9D4F0';
};

/**
 * steps: [{ cmd: 'node install.js --dry-run', out: ['line', ...] }]
 * at: seconds into the scene when the first command starts typing.
 */
export const Terminal = ({ w, h, title, prompt, steps, at = 0.4, fontSize = 24, cps = 30, lineEvery = 0.12 }) => {
  const frame = useCurrentFrame();
  const rows = [];
  let t = sec(at);
  for (const s of steps) {
    const typeLen = Math.ceil((s.cmd.length / cps) * 30);
    const n = Math.max(0, Math.min(s.cmd.length, Math.floor(((frame - t) / 30) * cps)));
    if (frame >= t) rows.push({ kind: 'cmd', text: s.cmd.slice(0, n), typing: n < s.cmd.length });
    t += typeLen + sec(0.35);
    (s.out || []).forEach((line, i) => {
      const show = t + Math.round(i * sec(lineEvery));
      if (frame >= show) rows.push({ kind: 'out', text: line, o: interpolate(frame, [show, show + 5], [0, 1], clamp) });
    });
    t += Math.round((s.out || []).length * sec(lineEvery)) + sec(0.6);
  }
  const lineH = fontSize * 1.45;
  const maxRows = Math.floor((h - 70) / lineH);
  const visible = rows.slice(-maxRows);
  const caret = Math.floor(frame / 15) % 2 === 0;
  return (
    <div style={{ width: w, height: h, borderRadius: 16, overflow: 'hidden', background: '#0F0B1C', boxShadow: '0 40px 100px rgba(0,0,0,0.55), 0 0 0 2px rgba(224,231,255,0.14)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 44, background: '#1A1430', display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', fontFamily: FONT, fontSize: 18, color: '#9C94BC' }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: '#3B3363' }} />)}
        <span style={{ marginLeft: 8 }}>{title || 'Terminal'}</span>
      </div>
      <div style={{ flex: 1, padding: '18px 24px', fontFamily: MONO, fontSize, lineHeight: `${lineH}px`, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {visible.map((r, i) => (
          r.kind === 'cmd'
            ? <div key={i} style={{ color: '#F3EEFF' }}><span style={{ color: C.accentLight }}>{prompt}</span> {r.text}{r.typing && caret ? <span style={{ background: '#F3EEFF', color: '#0F0B1C' }}> </span> : null}</div>
            : <div key={i} style={{ color: tone(r.text), opacity: r.o }}>{r.text}</div>
        ))}
      </div>
    </div>
  );
};

/** Seconds a terminal needs to type and print everything (to size a caption line). */
export function terminalSeconds(steps, cps = 30, lineEvery = 0.12) {
  let s = 0.4;
  for (const st of steps) s += st.cmd.length / cps + 0.35 + (st.out || []).length * lineEvery + 0.6;
  return s;
}
