// Notify.jsx — the bell. Tap it once on the phone and a new question buzzes
// you, even with the office closed (the server pushes it; push.js). One buzz
// per question, never anything else.
//
// On an iPhone the browser can only do this for the office once it is on the
// Home Screen, so there the bell says how, instead of pretending.

import { useEffect, useRef, useState } from 'react';

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyBytes(b64u) {
  const s = atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

// An office running older server code than this page answers the push
// routes with a plain-text 404. Say that, not a JSON parse error.
const NEEDS_RESTART = 'The office needs a restart before it can send notifications.';

async function call(route, init) {
  const res = await fetch(route, init);
  const out = await res.json().catch(() => null);
  if (res.status === 404 && !out) throw new Error(NEEDS_RESTART);
  if (!res.ok || !out || out.ok === false) throw new Error((out && out.error) || `The office answered ${res.status}.`);
  return out;
}

function post(token, route, body) {
  return call(route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Office-Token': token || '' },
    body: JSON.stringify(body),
  });
}

const HINTS = {
  install: 'On iPhone: tap Share, then Add to Home Screen. Open the office from that icon and tap the bell again.',
  blocked: 'Notifications are blocked for this page. Allow them in the browser (or phone) settings, then tap the bell again.',
  on: 'You will get one buzz per new question, and nothing else.',
};

function Bell({ on }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      {!on && <path d="M3 3l18 18" />}
    </svg>
  );
}

export default function Notify({ token }) {
  // checking | hidden | install | blocked | off | on
  const [state, setState] = useState('checking');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(null);
  const sub = useRef(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    let live = true;
    (async () => {
      if (!window.isSecureContext) { setState('hidden'); return; }
      if (!canPush()) { setState(isIOS() && !standalone() ? 'install' : 'hidden'); return; }
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        const s = await reg.pushManager.getSubscription();
        if (!live) return;
        sub.current = s;
        if (Notification.permission === 'denied') { setState('blocked'); return; }
        setState(s && Notification.permission === 'granted' ? 'on' : 'off');
        // Re-sign this device up on every open: if the office lost it (a
        // reset, or the push service expired it) the bell would say on and
        // nothing would come.
        if (s && Notification.permission === 'granted') post(tokenRef.current, '/api/push/subscribe', { subscription: s.toJSON() }).catch(() => {});
      } catch {
        if (live) setState('hidden');
      }
    })();
    return () => { live = false; };
  }, []);

  const turnOn = async () => {
    // First thing in the tap: iOS only asks for permission inside the gesture.
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      setState(perm === 'denied' ? 'blocked' : 'off');
      if (perm === 'denied') setHint(HINTS.blocked);
      return;
    }
    const { publicKey } = await call('/api/push/key');
    const reg = await navigator.serviceWorker.ready;
    const old = await reg.pushManager.getSubscription();
    if (old) await old.unsubscribe().catch(() => {});
    const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    await post(tokenRef.current, '/api/push/subscribe', { subscription: s.toJSON() });
    sub.current = s;
    setState('on');
    setHint(HINTS.on);
    // A test buzz, so you see it work now rather than trust it later.
    // A brand-new sign-up can take a while to go live at the push service;
    // the device stays signed up either way (push.js SETTLE_MS).
    await post(tokenRef.current, '/api/push/test', { endpoint: s.endpoint })
      .catch(() => setHint('Signed up. The test buzz has not landed yet - new sign-ups can take a minute to go live. Questions will still reach you.'));
  };

  const turnOff = async () => {
    const s = sub.current;
    if (s) {
      await post(tokenRef.current, '/api/push/unsubscribe', { endpoint: s.endpoint }).catch(() => {});
      await s.unsubscribe().catch(() => {});
    }
    sub.current = null;
    setState('off');
    setHint(null);
  };

  const onClick = async () => {
    if (busy) return;
    if (state === 'install' || state === 'blocked') { setHint(hint ? null : HINTS[state]); return; }
    setBusy(true);
    try {
      if (state === 'on') await turnOff();
      else await turnOn();
    } catch (e) {
      const msg = (e && e.message) || String(e);
      setHint(msg === NEEDS_RESTART ? msg : `Could not turn notifications on: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  if (state === 'checking' || state === 'hidden') return null;
  const on = state === 'on';
  const label = on ? 'Buzzing you on new questions - tap to stop' : 'Buzz me when a question comes in';

  return (
    <span className="notify">
      <button
        type="button"
        className={`nbutton ${on ? 'on' : ''}`}
        onClick={onClick}
        disabled={busy}
        aria-pressed={on}
        aria-label={label}
        title={label}
      >
        <Bell on={on} />
      </button>
      {hint && (
        <button type="button" className="notify-hint" onClick={() => setHint(null)}>{hint}</button>
      )}
    </span>
  );
}
