// timeline.js — turn a caption script into frames.
//
// A script is a list of scenes; each scene has caption lines. A line stays on screen for as long
// as it takes to read (about three words a second, never under 3 s), unless it says how long
// (`s`, in seconds). A scene lasts as long as its lines. Scenes crossfade over XF frames; the
// caption band changes line exactly when the next line starts.

import { useCurrentFrame } from 'remotion';
import { sec } from '../brand';

export const XF = 12;

/** How long a caption line needs, in seconds. */
export function lineSeconds(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length;
  return Math.min(7.5, Math.max(3, 1.4 + words * 0.34));
}

/** script -> { scenes: [{...scene, from, duration, cues}], lines: [{from, duration, text, chapter}], total } */
export function buildTimeline(script) {
  let from = 0;
  let chapter = null;
  const scenes = [];
  const lines = [];
  for (const sc of script.scenes) {
    if (sc.chapter !== undefined) chapter = sc.chapter;
    const cues = [];
    let off = 0;
    for (const raw of sc.lines) {
      const l = typeof raw === 'string' ? { text: raw } : raw;
      const duration = sec(l.s != null ? l.s : lineSeconds(l.text));
      cues.push({ from: off, duration, text: l.text });
      lines.push({ from: from + off, duration, text: l.text, chapter });
      off += duration;
    }
    scenes.push(Object.assign({}, sc, { from, duration: off, cues, chapter }));
    from += off;
  }
  return { scenes, lines, total: from };
}

/** Inside a scene: which caption line is showing, and how many frames since it began. */
export function useCue(cues) {
  const frame = useCurrentFrame();
  let index = 0;
  for (let i = 0; i < cues.length; i += 1) if (frame >= cues[i].from) index = i;
  return { index, frame, since: frame - cues[index].from, at: (i) => (cues[Math.min(i, cues.length - 1)] || { from: 0 }).from };
}
