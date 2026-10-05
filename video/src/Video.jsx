// Video.jsx — plays one caption script: each scene in its own sequence, crossfading into the next,
// on the dark stage, with the caption band over everything.

import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Sequence, continueRender, delayRender, interpolate, useCurrentFrame } from 'remotion';
import { C, FONT } from './brand';
import { Backdrop } from './components/Backdrop';
import { CaptionTrack } from './components/Caption';
import { SCENES } from './scenes';
import { XF, buildTimeline } from './lib/timeline';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

/** Hold the first frame until the brand fonts are ready, so no frame renders in a fallback face. */
const FontGate = () => {
  const [handle] = useState(() => delayRender('Loading the brand fonts'));
  useEffect(() => {
    const faces = ['400 40px Inter', '500 40px Inter', '600 40px Inter', '700 40px Inter', '800 40px Inter', '400 30px "JetBrains Mono"', '600 30px "JetBrains Mono"'];
    Promise.all(faces.map((f) => document.fonts.load(f))).then(() => continueRender(handle), () => continueRender(handle));
  }, [handle]);
  return null;
};

const FadeIn = ({ on, children }) => {
  const f = useCurrentFrame();
  const o = on ? interpolate(f, [0, XF], [0, 1], clamp) : 1;
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

export const Video = ({ script }) => {
  const tl = buildTimeline(script);
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, fontFamily: FONT, color: C.text }}>
      <FontGate />
      <Backdrop />
      {tl.scenes.map((s, i) => {
        const Comp = SCENES[s.scene];
        if (!Comp) throw new Error(`${script.id}: no scene called "${s.scene}".`);
        const last = i === tl.scenes.length - 1;
        return (
          <Sequence key={i} from={s.from} durationInFrames={s.duration + (last ? 0 : XF)} name={`${i + 1} ${s.scene}`}>
            <FadeIn on={i > 0}>
              <Comp {...(s.props || {})} cues={s.cues} hl={s.hl} />
            </FadeIn>
          </Sequence>
        );
      })}
      <CaptionTrack lines={tl.lines} />
    </AbsoluteFill>
  );
};

export const durationOf = (script) => buildTimeline(script).total;
