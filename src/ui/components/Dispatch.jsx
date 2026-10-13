// Dispatch.jsx — start a headless Claude Code session from the office, or hand a piece of a session's work to a helper.
// The sheet asks what it should do, then the model, effort and hands as one tap each; who sits in the chair, where it
// works, its time cap and a name sit under "More choices". The server (dispatch.js) checks every choice again.

import { useEffect, useRef, useState } from 'react';
import Close from './Close.jsx';

let cached = null;
/** What the sheet offers and every job (GET /api/dispatch). Cached for the page's life; the jobs come on the frame. */
export async function loadDispatch(force) {
  if (cached && !force) return cached;
  try {
    const res = await fetch('/api/dispatch', { cache: 'no-store' });
    const out = await res.json();
    if (out && out.ok) cached = out;
    return out;
  } catch {
    return { ok: false, error: 'Could not reach the office.' };
  }
}

/** Stop, close or reopen a session the office started. Resolves to the office's words. */
export async function dispatchAct(token, id, verb) {
  try {
    const res = await fetch(`/api/dispatch/${encodeURIComponent(id)}/${verb}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Office-Token': token || '' }, body: '{}',
    });
    const out = await res.json().catch(() => ({}));
    return out.message || out.error || `Not done (HTTP ${res.status}).`;
  } catch {
    return 'Could not reach the office.';
  }
}

/** A row of one-tap choices. An item with `disabled` shows but cannot be picked. */
export function Seg({ label, items, value, onPick, hint, className }) {
  return (
    <div className={`dfield ${className || ''}`}>
      <span className="dlabel">{label}</span>
      <div className="dseg" role="group" aria-label={label}>
        {items.map((it) => (
          <button key={it.key} type="button" className={`dseg-btn ${value === it.key ? 'on' : ''}`} aria-pressed={value === it.key} disabled={!!it.disabled} onClick={() => onPick(it.key)}>
            {it.label}
          </button>
        ))}
      </div>
      {hint && <span className="dhint">{hint}</span>}
    </div>
  );
}

const EFFORT_WORDS = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' };

/**
 * lead: the session handing work down (a desk's "Hand work down"), or null for a new session of the owner's own.
 * onStarted(reply): the office's answer, { id, session_id, name, message }.
 */
export default function DispatchSheet({ token, lead, onClose, onStarted, initialBrief }) {
  const [data, setData] = useState(cached);
  const [brief, setBrief] = useState(initialBrief || '');
  const [preset, setPreset] = useState(null);
  const [notify, setNotify] = useState(false);
  const [model, setModel] = useState(null);
  const [effort, setEffort] = useState(null);
  const [hands, setHands] = useState(null);
  const [cap, setCap] = useState(null);
  const [as, setAs] = useState('');
  const [place, setPlace] = useState('hub');
  const [computer, setComputer] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(null);
  const box = useRef(null);

  useEffect(() => {
    let live = true;
    loadDispatch(true).then((d) => { if (live) setData(d); });
    if (box.current) box.current.focus();
    return () => { live = false; };
  }, []);

  const o = data && data.ok ? data.options : null;
  const d = o ? (lead ? o.helper_defaults : o.defaults) : {};
  const pick = (v, def) => (v == null ? def : v);
  const m = pick(model, d.model);
  const e = pick(effort, d.effort);
  const h = pick(hands, d.hands);
  const c = pick(cap, d.cap_min);
  const modelHint = o ? (o.models.find((x) => x.key === m) || {}).hint : null;
  const handsHint = o ? (o.hands.find((x) => x.key === h) || {}).hint : null;
  const person = o && as ? o.people.find((p) => p.key === as) : null;
  // Which computer it starts on: this one until you pick another; a helper always on its lead's. Each computer brings
  // its own places, and says why when it can't start one.
  const ms = (o && o.machines) || [];
  const own = ms.find((x) => x.self) || null;
  const comp = lead ? lead.machine : computer || (own ? own.key : null);
  const here = ms.find((x) => x.key === comp) || null;
  const remote = !!(here && !here.self);
  const canGo = !!(here && here.ok);
  const why = here ? here.why : comp ? `${comp} can't be reached from this office.` : null;
  const placeList = here ? here.places : o ? o.places : [];
  const where = placeList.find((p) => p.key === place);

  const start = async () => {
    const text = brief.trim();
    if (!text || busy || !o || !canGo) return;
    setBusy(true);
    setSaid(null);
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Office-Token': token || '' },
        body: JSON.stringify({
          brief: text, model: m, effort: e, hands: h, cap_min: c, as: as || null, place: place === 'hub' ? null : place, machine: comp,
          name: name.trim() || null, parent: lead ? { machine: lead.machine, session_id: lead.id } : null, notify: !lead && notify,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok && out.ok) { onStarted && onStarted(out); return; }
      setSaid(out.error || `Not started (HTTP ${res.status}).`);
    } catch {
      setSaid('Could not reach the office.');
    } finally {
      setBusy(false);
    }
  };

  const title = lead ? `Hand work down from ${lead.display ? lead.display.name : 'this session'}` : 'New session';
  return (
    <div className="dsheet-wrap" onClick={onClose}>
      <section className="dsheet" role="dialog" aria-modal="true" aria-label={title} onClick={(ev) => ev.stopPropagation()}>
        <header className="dsheet-head">
          <Close onClose={onClose} sheet />
          <div className="dsheet-id">
            <h2>{title}</h2>
            <p>{lead
              ? `A helper session starts on ${remote ? lead.machine : 'this computer'}. When its turn ends, its report goes back to the lead.`
              : `A Claude Code session starts on ${remote ? comp : 'this computer'}, headless. You talk to it here.`}</p>
          </div>
        </header>
        <div className="dsheet-body">
          {!data && <p className="dhint">Opening…</p>}
          {data && !data.ok && <p className="q-error">{data.error || 'The office could not say what it offers.'}</p>}
          {o && (
            <>
              <label className="dfield">
                <span className="dlabel">What should it do?</span>
                <textarea
                  ref={box}
                  value={brief}
                  onChange={(ev) => setBrief(ev.target.value)}
                  rows={5}
                  maxLength={o.limits.brief_max_chars}
                  placeholder={lead ? 'The piece of work, with everything the helper needs to do it alone…' : 'Say it the way you would in a chat…'}
                />
              </label>
              {!lead && ms.length > 1 && (
                <Seg
                  label="Computer"
                  className="dseg-computer"
                  items={ms.map((x) => ({ key: x.key, label: x.label, disabled: !x.ok }))}
                  value={comp}
                  onPick={(k) => { setComputer(k); setPlace('hub'); }}
                  hint={ms.filter((x) => !x.ok).map((x) => x.why).join(' ') || (remote ? `It works in ${comp}'s own Hub, from ${comp}'s own office.` : null)}
                />
              )}
              {(o.presets || []).length > 0 && (
                <Seg
                  label="Start from"
                  items={o.presets}
                  value={preset}
                  hint={preset ? (o.presets.find((p) => p.key === preset) || {}).hint : 'One tap sets the model, effort, hands and time together.'}
                  onPick={(k) => {
                    const p = o.presets.find((x) => x.key === k);
                    setPreset(k); setModel(p.model); setEffort(p.effort); setHands(p.hands); setCap(p.cap_min);
                  }}
                />
              )}
              <Seg label="Model" items={o.models} value={m} onPick={(v) => { setPreset(null); setModel(v); }} hint={modelHint} />
              <Seg label="Effort" items={o.efforts.map((x) => ({ key: x, label: EFFORT_WORDS[x] || x }))} value={e} onPick={(v) => { setPreset(null); setEffort(v); }} />
              <Seg label="Hands" items={o.hands} value={h} onPick={(v) => { setPreset(null); setHands(v); }} hint={handsHint} />
              {!lead && (
                <label className="dcheck">
                  <input type="checkbox" checked={notify} onChange={(ev) => setNotify(ev.target.checked)} />
                  Buzz my phone when it replies
                </label>
              )}
              <details className="dmore">
                <summary>More choices<span className="dmore-sum">{[person ? person.person : null, where && where.key !== 'hub' ? where.label : null, `${c} min`].filter(Boolean).join(' · ')}</span></summary>
                <label className="dfield">
                  <span className="dlabel">Who sits in the chair</span>
                  <select value={as} onChange={(ev) => setAs(ev.target.value)}>
                    <option value="">Anyone (plain Claude Code)</option>
                    {o.people.map((p) => <option key={p.key} value={p.key}>{p.role ? `${p.person} · ${p.role}` : p.person}</option>)}
                  </select>
                </label>
                <label className="dfield">
                  <span className="dlabel">Where it works</span>
                  <select value={place} onChange={(ev) => setPlace(ev.target.value)}>
                    {placeList.map((p) => <option key={p.key} value={p.key}>{p.client ? `${p.label} (private)` : p.label}</option>)}
                  </select>
                </label>
                <Seg label="Time cap per turn" items={o.caps_min.map((x) => ({ key: x, label: x < 60 ? `${x} min` : `${x / 60} h` }))} value={c} onPick={(v) => { setPreset(null); setCap(v); }} />
                <label className="dfield">
                  <span className="dlabel">Name on the floor</span>
                  <input value={name} onChange={(ev) => setName(ev.target.value)} maxLength={40} placeholder={person ? person.person : 'From the first words of what it should do'} />
                </label>
              </details>
            </>
          )}
        </div>
        <footer className="dsheet-foot">
          <p className="dsheet-said" role="status" aria-live="polite">
            {said || (o && !canGo ? why : here && here.running != null
              ? `${here.running} of ${here.max_running} at work ${remote ? `on ${comp}` : 'here'} now.`
              : '')}
          </p>
          <button type="button" className="send" onClick={start} disabled={busy || !o || !brief.trim() || !canGo}>
            {busy ? 'Starting…' : lead ? 'Hand it down' : 'Start'}
          </button>
        </footer>
      </section>
    </div>
  );
}
