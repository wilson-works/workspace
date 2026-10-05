// Area.jsx — the part of the frame under the caption band, where every scene draws; and the
// highlight helper diagrams use to light the item the current caption line is about.

import React from 'react';
import { useVideoConfig } from 'remotion';
import { layoutOf } from '../brand';
import { useCue } from '../lib/timeline';

export function useLayout() {
  const { width, height } = useVideoConfig();
  return layoutOf(width, height);
}

export const Area = ({ children, style, column = false }) => {
  const L = useLayout();
  return (
    <div
      style={Object.assign({
        position: 'absolute', left: 0, top: L.band, width: L.width, height: L.area.h,
        display: 'flex', flexDirection: column ? 'column' : 'row', alignItems: 'center', justifyContent: 'center',
        boxSizing: 'border-box', paddingBottom: L.portrait ? 40 : 30,
      }, style || {})}
    >
      {children}
    </div>
  );
};

/**
 * hl: one entry per caption line: an item index, a list of them, a key, 'all', or null.
 * Returns { cue, lit(i), any } for the line showing now.
 */
export function useHighlight(cues, hl) {
  const cue = useCue(cues);
  const h = hl ? hl[Math.min(cue.index, hl.length - 1)] : null;
  const lit = (i) => h === 'all' || h === i || (Array.isArray(h) && h.includes(i));
  return { cue, lit, any: h != null };
}
