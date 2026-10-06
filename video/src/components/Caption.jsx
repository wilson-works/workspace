// Caption.jsx — the fixed caption band at the top of every frame, and the one caption in it.
//
// Rules (create-onboarding-video): the caption sits at the same spot in every frame, in a band
// reserved at the top; it is big; it rises in from 60 px below while fading in, with a strong
// UI ease-out, and stays for the whole line; when the next line has exactly the same words it
// does not animate again. A video's opening line is already in place on frame 0, so no frame,
// the first included, is without a caption. The band also carries a small chapter tag at its left edge.

import React from 'react';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, EASE_OUT, FONT, MONO, layoutOf } from '../brand';
import { Orb } from './Orb';

const RISE = 12;

/**
 * The line showing at a frame, and whether it is already in place: it continues the one before, or
 * it is the video's opening line, which stands at full strength from frame 0 so the first frame is
 * never without its caption.
 */
function lineAt(lines, frame) {
  let i = 0;
  for (let k = 0; k < lines.length; k += 1) if (frame >= lines[k].from) i = k;
  const line = lines[i];
  const prev = lines[i - 1];
  return { line, continued: i === 0 || (!!prev && prev.text === line.text), since: frame - line.from };
}

/** An address in a caption never breaks across two lines. */
function keepWhole(text) {
  const parts = String(text).split(/((?:github\.com|[a-z0-9-]+\.example-tailnet\.ts\.net)\/?[\w./-]*[\w/])/i);
  return parts.map((p, i) => (i % 2 ? <span key={i} style={{ whiteSpace: 'nowrap' }}>{p}</span> : p));
}

export const CaptionText = ({ text, since, continued, size, maxWidth }) => {
  const p = continued ? 1 : interpolate(since, [0, RISE], [0, 1], {
    easing: Easing.bezier(...EASE_OUT), extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        maxWidth,
        textAlign: 'center',
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.16,
        letterSpacing: '-0.015em',
        color: C.white,
        textWrap: 'balance',
        opacity: p,
        transform: `translateY(${(1 - p) * 60}px)`,
        textShadow: '0 2px 18px rgba(13, 5, 36, 0.6)',
      }}
    >
      {keepWhole(text)}
    </div>
  );
};

export const CaptionTrack = ({ lines }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const L = layoutOf(width, height);
  const { line, continued, since } = lineAt(lines, frame);
  return (
    <div
      style={{
        position: 'absolute', left: 0, top: 0, width, height: L.band,
        background: `linear-gradient(180deg, ${C.bg} 0%, ${C.bg} 78%, rgba(13, 5, 36, 0) 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        paddingTop: L.portrait ? 46 : 26, boxSizing: 'border-box',
      }}
    >
      {line.chapter && (
        <div
          style={{
            position: 'absolute', left: L.portrait ? 0 : L.gutter - 30, right: L.portrait ? 0 : undefined,
            top: L.portrait ? 34 : 22,
            display: 'flex', alignItems: 'center', justifyContent: L.portrait ? 'center' : 'flex-start', gap: 12,
            fontFamily: MONO, fontWeight: 600, fontSize: L.portrait ? 24 : 21,
            letterSpacing: '0.16em', textTransform: 'uppercase', color: C.text3,
          }}
        >
          <Orb size={L.portrait ? 20 : 18} />
          {line.chapter}
        </div>
      )}
      <CaptionText text={line.text} since={since} continued={continued} size={L.captionSize} maxWidth={L.captionWidth} />
    </div>
  );
};
