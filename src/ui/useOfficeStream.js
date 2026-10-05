// useOfficeStream.js — the live connection to the office server.
//
// This is the ONLY file under src/ui/ that may read the client clock
// (`new Date()` / `Date.now()`); the drill greps for it. Every age shown on the
// page is `frame.asOf - something`, server time minus server time. The one
// exception is noticing that frames have stopped, which by definition has no
// fresh server time to measure against.

import { useEffect, useState } from 'react';

/** Epoch ms -> local "HH:MM". */
export function formatClock(epochMs) {
  if (typeof epochMs !== 'number' || !Number.isFinite(epochMs)) return '--:--';
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Duration -> "now", "45s", "4m", "1h 03m", "2d". */
export function formatAgo(ms) {
  const sec = typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  if (sec < 5) return 'now';
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ${String(min % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d`;
}

// Frames arrive every 5 s. Three missed in a row and the page says it is
// reconnecting, and stops animating, so a frozen page never looks busy.
const STALE_MS = 15000;

export function useOfficeStream() {
  const [frame, setFrame] = useState(null);
  const [lastFrameAt, setLastFrameAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const es = new EventSource('/events');
    es.onmessage = (evt) => {
      try {
        setFrame(JSON.parse(evt.data));
        setLastFrameAt(Date.now());
      } catch { /* keep the last good frame */ }
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 2000);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  return { frame, stale: now - lastFrameAt > STALE_MS };
}
