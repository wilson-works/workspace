// brand.js — the WilsonWorks look for every video: colours, type, the purple orb, and the layout
// sizes of each format (the caption band is the same height, in the same place, in every frame).

import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';

export const FPS = 30;

export const C = {
  accent: '#7C3AED', // --ww-accent
  accentHover: '#6D28D9', // --ww-accent-hover
  accentLight: '#A855F7',
  orb: 'radial-gradient(circle at 30% 30%, #A855F7, #6D28D9)',
  ink: '#0A0A0A', // --ww-ink
  bg: '#0D0524', // the office's dark panel
  bg2: '#160935',
  panel: '#2E1065',
  panelSoft: 'rgba(46, 16, 101, 0.55)',
  line: 'rgba(224, 231, 255, 0.14)',
  text: '#E0E7FF',
  text2: 'rgba(224, 231, 255, 0.72)',
  text3: 'rgba(224, 231, 255, 0.48)',
  white: '#FFFFFF',
  good: '#22C55E',
  warn: '#F59E0B',
};

// One colour per invented computer, used wherever a computer is drawn.
export const MACHINE = { DESK: '#A855F7', MINI: '#22C55E', LAPTOP: '#F59E0B' };

export const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
export const MONO = "'JetBrains Mono', ui-monospace, Consolas, monospace";

// Strong UI ease-out (the caption rise), and a soft in-out for camera moves.
export const EASE_OUT = [0.16, 1, 0.3, 1];
export const EASE_IN_OUT = [0.65, 0, 0.35, 1];

/** The layout of one format: where the caption band is, and the area below it. */
export function layoutOf(width, height) {
  const portrait = height > width;
  const band = portrait ? 340 : 220;
  return {
    portrait,
    width,
    height,
    band,
    captionSize: portrait ? 64 : 60,
    captionWidth: portrait ? 960 : 1720,
    area: { x: 0, y: band, w: width, h: height - band },
    gutter: portrait ? 60 : 90,
  };
}

/** Frames from seconds. */
export const sec = (s) => Math.round(s * FPS);
