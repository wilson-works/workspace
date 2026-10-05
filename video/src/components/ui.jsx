// ui.jsx — small drawing pieces the diagrams share: a card, a pill, folder and file icons, the three
// kinds of computer, a phone, and the motion helpers (appear, spring-in) every scene uses.

import React from 'react';
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, EASE_OUT, FONT, MONO, MACHINE } from '../brand';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

/** 0 -> 1 from frame `at`, over `len` frames, with the UI ease-out. */
export function useAppear(at = 0, len = 14) {
  const f = useCurrentFrame();
  return interpolate(f, [at, at + len], [0, 1], Object.assign({ easing: Easing.bezier(...EASE_OUT) }, clamp));
}

/** A springy 0 -> 1 from frame `at`. */
export function useSpring(at = 0, config) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - at, fps, config: Object.assign({ damping: 18, stiffness: 120, mass: 0.9 }, config || {}) });
}

/** Rises in from below while fading in (the same motion as the captions, smaller). */
export const Rise = ({ at = 0, dist = 30, children, style }) => {
  const p = useAppear(at, 14);
  return <div style={Object.assign({ opacity: p, transform: `translateY(${(1 - p) * dist}px)` }, style || {})}>{children}</div>;
};

export const Card = ({ children, style, lit = false, color }) => (
  <div
    style={Object.assign({
      background: lit ? 'rgba(76, 29, 149, 0.62)' : 'rgba(46, 16, 101, 0.48)',
      borderRadius: 24,
      boxShadow: lit
        ? `0 0 0 3px ${color || C.accentLight}, 0 24px 60px rgba(0,0,0,0.45), 0 0 50px rgba(168,85,247,0.35)`
        : '0 0 0 1.5px rgba(224,231,255,0.14), 0 20px 50px rgba(0,0,0,0.35)',
      color: C.text,
      fontFamily: FONT,
      boxSizing: 'border-box',
    }, style || {})}
  >
    {children}
  </div>
);

export const Pill = ({ children, color = C.accent, style }) => (
  <span style={Object.assign({ display: 'inline-flex', alignItems: 'center', gap: 8, background: color, color: C.white, borderRadius: 999, padding: '6px 16px', fontFamily: FONT, fontWeight: 700, fontSize: 22, whiteSpace: 'nowrap' }, style || {})}>{children}</span>
);

export const Mono = ({ children, style }) => <span style={Object.assign({ fontFamily: MONO }, style || {})}>{children}</span>;

export const Folder = ({ size = 34, color = C.accentLight }) => (
  <svg width={size} height={size * 0.8} viewBox="0 0 40 32" style={{ flex: 'none' }}>
    <path d="M2 6a3 3 0 0 1 3-3h10l4 4h16a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3z" fill={color} opacity="0.9" />
    <path d="M2 11h36v16a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3z" fill={color} />
  </svg>
);

export const FileIcon = ({ size = 30, color = C.text2 }) => (
  <svg width={size * 0.8} height={size} viewBox="0 0 24 30" style={{ flex: 'none' }}>
    <path d="M3 1h12l8 8v18a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z" fill="none" stroke={color} strokeWidth="2" />
    <path d="M15 1v8h8" fill="none" stroke={color} strokeWidth="2" />
  </svg>
);

/** A desktop monitor, a mini PC or a laptop, drawn in a computer's colour. */
export const Computer = ({ kind, size = 200, color = C.accentLight, glow = 0 }) => {
  const stroke = { fill: 'none', stroke: color, strokeWidth: 5, strokeLinejoin: 'round', strokeLinecap: 'round' };
  const screen = { fill: 'rgba(168,85,247,0.12)' };
  let body;
  if (kind === 'desktop') {
    body = (
      <>
        <rect x="14" y="14" width="172" height="108" rx="10" {...stroke} />
        <rect x="24" y="24" width="152" height="88" rx="4" {...screen} />
        <path d="M86 122v22M64 150h72" {...stroke} />
      </>
    );
  } else if (kind === 'mini PC') {
    body = (
      <>
        <rect x="40" y="62" width="120" height="70" rx="16" {...stroke} />
        <circle cx="70" cy="97" r="6" fill={color} />
        <path d="M96 97h40" {...stroke} />
        <path d="M58 140h84" {...stroke} opacity="0.5" />
      </>
    );
  } else if (kind === 'phone') {
    body = (
      <>
        <rect x="66" y="14" width="68" height="132" rx="14" {...stroke} />
        <rect x="74" y="26" width="52" height="104" rx="5" {...screen} />
        <path d="M92 138h16" {...stroke} />
      </>
    );
  } else {
    body = (
      <>
        <rect x="34" y="30" width="132" height="86" rx="8" {...stroke} />
        <rect x="42" y="38" width="116" height="70" rx="3" {...screen} />
        <path d="M14 128h172l-12 14H26z" {...stroke} />
      </>
    );
  }
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 200 160" style={{ filter: glow ? `drop-shadow(0 0 ${18 * glow}px ${color})` : undefined, flex: 'none' }}>
      {body}
    </svg>
  );
};

export const machineColor = (name) => MACHINE[name] || C.accentLight;

/** A short label in the mono face, used for folder and file names. */
export const PathText = ({ children, size = 26, color = C.text, weight = 600 }) => (
  <span style={{ fontFamily: MONO, fontSize: size, color, fontWeight: weight, whiteSpace: 'nowrap' }}>{children}</span>
);
