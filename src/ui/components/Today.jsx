// Today.jsx — under the floor's greeting: one Care line (are your own sites working?) and Plan today (the office
// drafts your day from your own open work). Both say a status with a small dot and a word, never a raw row.

import { useState } from 'react';
import { useJson } from './WorkBoard.jsx';

/** "1:00 PM", local time. */
function clock12(ms) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(ms));
}

async function post(url, token) {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Office-Token': token || '' }, body: '{}' });
    const out = await res.json().catch(() => ({}));
    return res.ok && out.ok ? out : { ok: false, error: out.error || `That did not work (HTTP ${res.status}).` };
  } catch {
    return { ok: false, error: 'Could not reach the office.' };
  }
}

/** The care rounds' state as a pill and one plain sentence. */
export function careWords(c) {
  if (!c || !c.on) {
    return { tone: 'quiet', word: 'Off', say: `Care rounds check your own sites at ${(c && c.times ? c.times : ['6:30 AM', '1:00 PM']).join(' and ')}. To turn them on, ask Claude: "set up care rounds for my sites".` };
  }
  const when = c.last_at ? ` Checked at ${clock12(c.last_at)}.` : '';
  if (c.state === 'unchecked') return { tone: 'quiet', word: 'Not checked yet', say: `The first round runs at ${c.times[0]}, or now with Check now.` };
  if (c.state === 'problem') {
    const names = c.failing.map((f) => f.name);
    return { tone: 'bad', word: `${names.length} not working`, say: `${names.join(', ')}. ${names.length === 1 ? 'It is' : 'Each is'} an order in Site care on the Work page.${when}` };
  }
  return { tone: 'good', word: 'All good', say: `${c.sites === 1 ? 'Your site answered' : `All ${c.sites} of your sites answered`}.${when}` };
}

function Care({ care, token }) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(null);
  const w = careWords(care);
  const check = async () => {
    setBusy(true);
    setSaid(null);
    const r = await post('/api/care/check', token);
    setBusy(false);
    if (!r.ok) setSaid(r.error);
  };
  return (
    <div className="today-line">
      <span className="today-k">Care</span>
      <span className={`pill pill-${w.tone}`}><span className="pill-dot" aria-hidden="true" />{busy ? 'Checking…' : w.word}</span>
      <span className="today-v">{said || w.say}</span>
      {care && care.on && token && <button type="button" className="q-btn today-go" disabled={busy} onClick={check}>Check now</button>}
    </div>
  );
}

function PlanCard({ token, canStart, onStart, onStep, onQuestions }) {
  const [bump, setBump] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { data } = useJson('/api/plan', bump);
  const plan = data && data.ok ? data.plan : null;
  const draft = async () => {
    setBusy(true);
    setError(null);
    const r = await post('/api/plan/draft', token);
    setBusy(false);
    if (r.ok) setBump((n) => n + 1);
    else setError(r.error);
  };
  return (
    <section className="dayplan" aria-label="plan today">
      <div className="dayplan-head">
        <h2>Plan today</h2>
        {token && <button type="button" className="q-btn" disabled={busy} onClick={draft}>{busy ? 'Drafting…' : plan ? 'Draft again' : 'Draft my day'}</button>}
      </div>
      {error && <p className="q-error">{error}</p>}
      {!plan && <p className="dayplan-sub">The office drafts your day from your own open work: questions waiting on you, sites that need care, and the next order in each project.</p>}
      {plan && plan.items.length === 0 && <p className="dayplan-sub">Nothing open. A clear day.</p>}
      {plan && plan.items.length > 0 && (
        <>
          <p className="dayplan-sub">Drafted at {clock12(plan.at)}.</p>
          <ol className="dayplan-list">
            {plan.items.map((x, i) => (
              <li key={`${x.kind}-${x.project || ''}-${x.id || i}`}>
                <span className="dayplan-text">{x.text}</span>
                {x.kind === 'answer' && <button type="button" className="q-btn" onClick={onQuestions}>Open</button>}
                {x.brief && canStart && <button type="button" className="q-btn q-go" onClick={() => onStart(x.brief)}>Start</button>}
                {x.project && x.id && <button type="button" className="q-btn" onClick={() => onStep(x.project, x.id)}>Open</button>}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

export default function Today({ care, token, canStart, onStart, onStep, onQuestions }) {
  return (
    <section className="today" aria-label="today">
      <Care care={care} token={token} />
      <PlanCard token={token} canStart={canStart} onStart={onStart} onStep={onStep} onQuestions={onQuestions} />
    </section>
  );
}
