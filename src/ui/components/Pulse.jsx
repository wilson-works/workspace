// Pulse.jsx — the top of the floor: a greeting for the hour (your own time) and the office's pulse in
// one line - who is at a desk, who is heads down, who is waiting on you, who just talked.

const TALK_MS = 15 * 60 * 1000;

function hourHere(t) {
  return new Date(t).getHours();
}

export function greeting(t) {
  const h = hourHere(t);
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Night shift';
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default function Pulse({ sessions, flows, questions, asOf, onQuestions, brand, owner }) {
  const here = sessions.length;
  const working = sessions.filter((s) => s.state === 'working').length;
  const waiting = sessions.filter((s) => s.state === 'waiting').length;
  const talked = (flows || []).filter((f) => f.at && asOf - f.at < TALK_MS).length;
  const asks = (questions || []).length;
  const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(asOf));
  return (
    <section className={`pulse ${working > 0 ? 'is-busy' : ''}`} aria-label="the office right now">
      <p className="pulse-eyebrow">{[brand, clock].filter(Boolean).join(' · ')}</p>
      <h1 className="pulse-hello">{greeting(asOf)}{owner ? `, ${owner}` : ''}<span className="pulse-dot" aria-hidden="true" /></h1>
      <ul className="pulse-stats">
        <li><strong>{here}</strong> at {here === 1 ? 'a desk' : 'their desks'}</li>
        <li className={working > 0 ? 'is-on' : ''}><strong>{working}</strong> heads down</li>
        {waiting > 0 && <li><strong>{waiting}</strong> waiting</li>}
        {talked > 0 && <li><strong>{talked}</strong> {talked === 1 ? 'conversation' : 'conversations'} lately</li>}
        {asks > 0 && (
          <li className="pulse-ask">
            <button type="button" onClick={onQuestions}>{plural(asks, 'question', 'questions')} for you</button>
          </li>
        )}
      </ul>
    </section>
  );
}
