// Backdrop.jsx — the dark stage every scene sits on: the office's panel colour with two slow purple glows.
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C } from '../brand';

export const Backdrop = () => {
  const f = useCurrentFrame();
  const drift = Math.sin(f / 240) * 4;
  return (
    <AbsoluteFill
      style={{
        background: [
          `radial-gradient(1100px 760px at ${16 + drift}% ${28 - drift}%, rgba(124, 58, 237, 0.26), rgba(124, 58, 237, 0) 70%)`,
          `radial-gradient(900px 700px at ${88 - drift}% ${86 + drift}%, rgba(168, 85, 247, 0.16), rgba(168, 85, 247, 0) 70%)`,
          `linear-gradient(180deg, ${C.bg} 0%, ${C.bg2} 100%)`,
        ].join(', '),
      }}
    />
  );
};
