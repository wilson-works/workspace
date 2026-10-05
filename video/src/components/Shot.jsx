// Shot.jsx — a captured screenshot of the sandbox office, framed, with a camera that moves between
// the parts that matter (pieces of the UI, not the whole UI).
//
//   <Shot shot="floor-all" frame="browser" w={1400} h={860}
//         keys={[{ at: 0, box: 'full' }, { at: 2, box: 'desk:Cedar', pad: 30 }]}
//         swaps={[{ at: 4, shot: 'floor-mini' }]}
//         marks={[{ from: 2.5, to: 6, box: 'desk:Cedar' }]}
//         taps={[{ at: 3, box: 'door:iris', button: 'right' }]} />
//
// Shots and their boxes come from public/shots/manifest.json (capture/shoot.js). A box is a name
// from that shot's manifest, 'full', or [x, y, w, h] in the page's CSS pixels. Times are seconds
// from the start of the Shot's own sequence. A tap follows the skill's cursor rule: the pointer
// fades in at the centre of the frame, glides in one straight line to the target, taps, and on the
// same UI glides straight on to the next target; it fades out after the last tap.

import React from 'react';
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import manifest from '../../public/shots/manifest.json';
import { C, EASE_IN_OUT, EASE_OUT, FONT, sec } from '../brand';
import { Orb } from './Orb';
import { Pointer, TapDot } from './Cursor';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

export function shotOf(name) {
  const m = manifest[name];
  if (!m) throw new Error(`No screenshot called "${name}" in public/shots/manifest.json. Run capture/shoot.js.`);
  return m;
}

/** A box in image pixels. */
function boxPx(m, box) {
  if (!box || box === 'full') return [0, 0, m.width, m.height];
  // A part of a named box: { of: 'machines', part: [x, y, w, h] as fractions of it }.
  // Several named boxes: the smallest box around all of them.
  if (Array.isArray(box) && typeof box[0] === 'string') {
    const all = box.map((b) => boxPx(m, b));
    const x = Math.min(...all.map((b) => b[0]));
    const y = Math.min(...all.map((b) => b[1]));
    return [x, y, Math.max(...all.map((b) => b[0] + b[2])) - x, Math.max(...all.map((b) => b[1] + b[3])) - y];
  }
  if (box && typeof box === 'object' && !Array.isArray(box)) {
    const [x, y, w, h] = boxPx(m, box.of);
    const [px, py, pw, ph] = box.part;
    return [x + px * w, y + py * h, pw * w, ph * h];
  }
  const b = typeof box === 'string' ? m.boxes[box] : box;
  if (!b) throw new Error(`Screenshot ${m.file} has no box "${box}".`);
  return b.map((v) => v * m.scale);
}

/** Where the camera looks to show a box: its centre and its zoom, kept inside the image. */
function cameraFor(m, k, cw, ch) {
  const [x, y, w, h] = boxPx(m, k.box);
  const p = (k.pad == null ? (k.box === 'full' || !k.box ? 0 : 20) : k.pad) * m.scale;
  // (boxPx returns image pixels; a raw [x, y, w, h] in a key is CSS pixels, scaled inside boxPx.)
  const fit = k.fit === 'cover' ? Math.max : Math.min;
  const z = fit(cw / (w + 2 * p), ch / (h + 2 * p)) * (k.zoom || 1);
  let cx = x + w / 2;
  let cy = y + h / 2;
  // free: centre on the box even past the page's edge (the page's own background fills in).
  if (k.free) return { cx, cy, z };
  const hw = cw / (2 * z);
  const hh = ch / (2 * z);
  cx = hw * 2 >= m.width ? m.width / 2 : Math.min(Math.max(cx, hw), m.width - hw);
  cy = hh * 2 >= m.height ? (k.top ? hh : m.height / 2) : Math.min(Math.max(cy, hh), m.height - hh);
  return { cx, cy, z };
}

function mix(a, b, t) {
  return {
    cx: a.cx + (b.cx - a.cx) * t,
    cy: a.cy + (b.cy - a.cy) * t,
    z: Math.exp(Math.log(a.z) + (Math.log(b.z) - Math.log(a.z)) * t),
  };
}

/** The camera at a frame: each key starts a move at `at` lasting `dur` seconds (0.9 by default). */
export function cameraAt(frame, keys, m, cw, ch) {
  const list = (keys && keys.length ? keys : [{ at: 0, box: 'full' }]).map((k) => Object.assign({ start: sec(k.at || 0), len: Math.max(1, sec(k.dur == null ? 0.9 : k.dur)) }, cameraFor(m, k, cw, ch)));
  let cur = list[0];
  for (let i = 1; i < list.length; i += 1) {
    const k = list[i];
    if (frame < k.start) break;
    const t = interpolate(frame, [k.start, k.start + k.len], [0, 1], Object.assign({ easing: Easing.bezier(...EASE_IN_OUT) }, clamp));
    cur = mix(cur, k, t);
  }
  return cur;
}

/** A box (in the shot's CSS pixels) as seen through the camera, in the frame's own pixels. */
function project(m, cam, box, cw, ch) {
  const [x, y, w, h] = boxPx(m, box);
  return { x: (x - cam.cx) * cam.z + cw / 2, y: (y - cam.cy) * cam.z + ch / 2, w: w * cam.z, h: h * cam.z };
}

/** A steady highlight ring around a part of the page while it is being talked about. */
const Mark = ({ r, from, to, frame, color = C.accentLight, radius = 18 }) => {
  const o = interpolate(frame, [from, from + 10, to - 8, to], [0, 1, 1, 0], clamp);
  if (o <= 0) return null;
  const s = interpolate(frame, [from, from + 14], [1.06, 1], Object.assign({ easing: Easing.bezier(...EASE_OUT) }, clamp));
  return (
    <div
      style={{
        position: 'absolute', left: r.x - 8, top: r.y - 8, width: r.w + 16, height: r.h + 16,
        borderRadius: radius, opacity: o, transform: `scale(${s})`,
        boxShadow: `0 0 0 4px ${color}, 0 0 36px 8px rgba(168, 85, 247, 0.45)`,
        pointerEvents: 'none',
      }}
    />
  );
};

/** One pointer for every tap on this UI: fade in at the centre, straight glides, fade out after the last. */
const Taps = ({ m, taps, frame, cw, ch, keys }) => {
  if (!taps || !taps.length) return null;
  const list = taps.map((t) => Object.assign({}, t, { f: sec(t.at) }));
  const first = list[0].f;
  const last = list[list.length - 1].f;
  const enter = first - sec(1.1);
  const opacity = interpolate(frame, [enter - 10, enter, last + 12, last + 24], [0, 1, 1, 0], clamp);
  const cam = cameraAt(frame, keys, m, cw, ch);
  const target = (t) => { const r = project(m, cam, t.box, cw, ch); return { x: r.x + r.w * (t.ax == null ? 0.5 : t.ax), y: r.y + r.h * (t.ay == null ? 0.5 : t.ay) }; };
  // Path: centre -> first target, then target to target, each one straight segment.
  let pos = { x: cw / 2, y: ch / 2 };
  let from = enter;
  for (const t of list) {
    const to = target(t);
    const moveStart = from;
    const p = interpolate(frame, [moveStart, t.f], [0, 1], Object.assign({ easing: Easing.bezier(...EASE_OUT) }, clamp));
    if (frame < t.f) { pos = { x: pos.x + (to.x - pos.x) * p, y: pos.y + (to.y - pos.y) * p }; break; }
    pos = to;
    from = t.f + sec(0.5);
  }
  return (
    <>
      {list.map((t, i) => { const p = target(t); return <TapDot key={i} tapAt={t.f} x={p.x} y={p.y} size={96} color={t.button === 'right' ? 'rgba(245, 158, 11, 0.6)' : 'rgba(124, 58, 237, 0.55)'} />; })}
      <Pointer x={pos.x} y={pos.y} opacity={opacity} size={56} />
    </>
  );
};

/** The screenshot itself, behind the camera, with any swaps to another shot of the same page. */
const Lens = ({ shot, keys, swaps, marks, taps, labels, cw, ch }) => {
  const frame = useCurrentFrame();
  const m = shotOf(shot);
  const cam = cameraAt(frame, keys, m, cw, ch);
  const img = (name, opacity) => {
    const mm = shotOf(name);
    return (
      <Img
        key={name}
        src={staticFile(mm.file)}
        style={{
          position: 'absolute', left: 0, top: 0, width: mm.width, height: mm.height, maxWidth: 'none',
          transformOrigin: '0 0', opacity,
          transform: `translate(${cw / 2 - cam.cx * cam.z}px, ${ch / 2 - cam.cy * cam.z}px) scale(${cam.z})`,
        }}
      />
    );
  };
  return (
    <div style={{ position: 'relative', width: cw, height: ch, overflow: 'hidden', background: '#F7F5FF' }}>
      {img(shot, 1)}
      {(swaps || []).map((s) => img(s.shot, s.until
        ? interpolate(frame, [sec(s.at), sec(s.at) + 9, sec(s.until), sec(s.until) + 9], [0, 1, 1, 0], clamp)
        : interpolate(frame, [sec(s.at), sec(s.at) + 9], [0, 1], clamp)))}
      {(marks || []).map((k, i) => <Mark key={i} r={project(m, cam, k.box, cw, ch)} from={sec(k.from)} to={sec(k.to)} frame={frame} radius={k.radius} />)}
      {(labels || []).map((l, i) => {
        const r = project(m, cam, l.box, cw, ch);
        const o = interpolate(frame, [sec(l.from), sec(l.from) + 10, sec(l.to) - 8, sec(l.to)], [0, 1, 1, 0], clamp);
        return (
          <div key={i} style={{
            position: 'absolute', left: r.x + r.w / 2, top: l.below ? r.y + r.h + 18 : r.y - 18,
            transform: `translate(-50%, ${l.below ? '0' : '-100%'})`, opacity: o,
            background: l.color || C.accent, color: C.white, fontFamily: FONT, fontWeight: 700, fontSize: l.size || 30,
            padding: '10px 22px', borderRadius: 999, whiteSpace: 'nowrap', boxShadow: '0 10px 30px rgba(13,5,36,0.35)',
          }}>{l.text}</div>
        );
      })}
      <Taps m={m} taps={taps} frame={frame} cw={cw} ch={ch} keys={keys} />
    </div>
  );
};

const BAR = 50;

/** A plain browser window: a tab with the office's name, and an address in words. */
const BrowserChrome = ({ w, address, title }) => (
  <div style={{ height: BAR, width: w, background: '#ECE9F7', display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', boxSizing: 'border-box', fontFamily: FONT }}>
    <div style={{ display: 'flex', gap: 8 }}>
      {['#D4D0E6', '#D4D0E6', '#D4D0E6'].map((c, i) => <span key={i} style={{ width: 13, height: 13, borderRadius: '50%', background: c, display: 'block' }} />)}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#FFFFFF', borderRadius: 10, padding: '7px 16px', fontSize: 19, fontWeight: 600, color: '#2A2140' }}>
      <Orb size={16} /> {title || 'WorkSpace'}
    </div>
    <div style={{ flex: 1, background: '#FFFFFF', borderRadius: 10, padding: '7px 16px', fontSize: 19, color: '#6B6385' }}>{address || 'your office, on this computer'}</div>
  </div>
);

/**
 * frame: 'browser' (a window), 'phone' (a phone), or 'card' (a cropped piece on its own).
 * w, h: the outer size in frame pixels.
 */
export const Shot = ({ shot, frame = 'browser', w, h, keys, swaps, marks, taps, labels, address, title, style }) => {
  if (frame === 'phone') {
    const bezel = Math.round(w * 0.045);
    const cw = w - bezel * 2;
    const ch = h - bezel * 2;
    const strip = address ? Math.round(cw * 0.12) : 0;
    return (
      <div style={Object.assign({ width: w, height: h, borderRadius: w * 0.16, background: '#0B0716', padding: bezel, boxSizing: 'border-box', boxShadow: '0 40px 90px rgba(0,0,0,0.55), 0 0 0 2px rgba(224,231,255,0.18)', position: 'relative' }, style || {})}>
        <div style={{ width: cw, height: ch, borderRadius: w * 0.12, overflow: 'hidden', background: '#F7F5FF', position: 'relative' }}>
          {address && (
            <div style={{ height: strip, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: strip * 0.12, boxSizing: 'border-box', background: '#ECE9F7' }}>
              <div style={{ background: '#FFFFFF', borderRadius: 999, padding: `${strip * 0.08}px ${strip * 0.3}px`, fontFamily: FONT, fontSize: strip * 0.3, color: '#2A2140', fontWeight: 600, whiteSpace: 'nowrap' }}>{address}</div>
            </div>
          )}
          <Lens shot={shot} keys={keys || [{ at: 0, box: 'full', fit: 'cover', top: true }]} swaps={swaps} marks={marks} taps={taps} labels={labels} cw={cw} ch={ch - strip} />
          <div style={{ position: 'absolute', top: strip ? strip * 0.18 : cw * 0.03, left: '50%', transform: 'translateX(-50%)', width: cw * 0.3, height: cw * 0.075, borderRadius: 999, background: '#0B0716', display: address ? 'none' : 'block' }} />
        </div>
      </div>
    );
  }
  if (frame === 'card') {
    return (
      <div style={Object.assign({ width: w, height: h, borderRadius: 28, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 0 2px rgba(224,231,255,0.16)' }, style || {})}>
        <Lens shot={shot} keys={keys} swaps={swaps} marks={marks} taps={taps} labels={labels} cw={w} ch={h} />
      </div>
    );
  }
  return (
    <div style={Object.assign({ width: w, height: h, borderRadius: 18, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.55), 0 0 0 2px rgba(224,231,255,0.16)', background: '#ECE9F7' }, style || {})}>
      <BrowserChrome w={w} address={address} title={title} />
      <Lens shot={shot} keys={keys} swaps={swaps} marks={marks} taps={taps} labels={labels} cw={w} ch={h - BAR} />
    </div>
  );
};

/** The width / height of a box (with its padding) in a shot: how a cropped card should be shaped. */
export function boxAspect(shot, box, pad = 20) {
  const m = shotOf(shot);
  const [, , w, h] = boxPx(m, box);
  const p = pad * m.scale;
  return (w + 2 * p) / (h + 2 * p);
}

/** The outer size of a browser frame that shows a shot whole at a given width. */
export function browserSize(shot, w) {
  const m = shotOf(shot);
  return { w, h: Math.round((w * m.height) / m.width) + BAR };
}
