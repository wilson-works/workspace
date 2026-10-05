// Orb.jsx — the WilsonWorks mark: the purple orb, with an optional soft glow.
import React from 'react';
import { C } from '../brand';

export const Orb = ({ size = 40, glow = false, style }) => (
  <div
    style={Object.assign({
      width: size,
      height: size,
      borderRadius: '50%',
      background: C.orb,
      flex: 'none',
      boxShadow: glow
        ? `0 0 ${size * 0.6}px ${size * 0.12}px rgba(168, 85, 247, 0.55), inset 0 -${size * 0.08}px ${size * 0.2}px rgba(13, 5, 36, 0.35)`
        : `inset 0 -${size * 0.08}px ${size * 0.2}px rgba(13, 5, 36, 0.35)`,
    }, style || {})}
  />
);
