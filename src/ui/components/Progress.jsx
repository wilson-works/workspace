// Progress.jsx — how far along something is, at a glance: % to completion.
//   Ring        a percent ring with the number in the middle; null reads "—"; `cheer` makes it
//               glow and throw a few sparks (when something just got done)
//   useRise     true for a moment after a count goes up

import { useEffect, useRef, useState } from 'react';

const CHEER_MS = 2600;

// True for a moment after `value` goes up (not on the first read): something just landed.
export function useRise(value) {
  const last = useRef(value);
  const [up, setUp] = useState(false);
  useEffect(() => {
    const before = last.current;
    last.current = value;
    if (typeof before === 'number' && typeof value === 'number' && value > before) {
      setUp(true);
      const t = setTimeout(() => setUp(false), CHEER_MS);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [value]);
  return up;
}

export function Ring({ pct, size = 52, label, cheer = false }) {
  const stroke = Math.max(4, Math.round(size / 10));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = typeof pct === 'number' ? Math.max(0, Math.min(100, pct)) : null;
  return (
    <span className={`ring ${p === 100 ? 'ring-full' : ''} ${cheer ? 'ring-cheer' : ''}`} style={{ width: size, height: size }}
      role="img" aria-label={label || (p === null ? 'nothing to count yet' : `${p}% done`)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        {p !== null && p > 0 && (
          <circle className="ring-fill" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke}
            strokeDasharray={`${(c * p) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
      </svg>
      <span className="ring-num" style={{ fontSize: Math.round(size * 0.27) }}>{p === null ? '—' : `${p}%`}</span>
      {cheer && <span className="ring-sparks" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>}
    </span>
  );
}
