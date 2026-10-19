// Desk.jsx — one session: who, what they are doing now, who is helping,
// and the last thing they said to another session.

import Avatar from './Avatar.jsx';
import { nowText, stepText, modelLabel, statusOf } from '../words.js';

export function keyOf(s) { return `${s.machine}:${s.id}`; }

const EFFORT_SHORT = { low: 'low', medium: 'medium', high: 'high', xhigh: 'extra high', max: 'max' };

/** Its status in a word, with a small dot and how long (no stripes: a dot and a word). */
export function Status({ s, ago, compact }) {
  const st = statusOf(s);
  const age = st.since ? ago(st.since) : null;
  return (
    <span className={`status status-${st.key} ${compact ? 'status-compact' : ''}`} title={age ? `${st.word} for ${age}` : st.word}>
      <span className="status-dot" aria-hidden="true" />
      {st.word}{age && <span className="status-age"> {age}</span>}
    </span>
  );
}

/** Steps started in each 2 minutes over the last 30, oldest on the left, when the floor has them. */
export function Pace({ pace }) {
  if (!Array.isArray(pace) || !pace.some((n) => n > 0)) return null;
  const max = Math.max(...pace);
  const total = pace.reduce((a, b) => a + b, 0);
  return (
    <span className="pace" role="img" aria-label={`${total} ${total === 1 ? 'step' : 'steps'} in the last 30 minutes`} title={`${total} ${total === 1 ? 'step' : 'steps'} in the last 30 minutes`}>
      {pace.map((n, i) => <i key={i} className={n ? '' : 'pace-none'} style={n ? { height: `${Math.round(25 + (75 * n) / max)}%` } : undefined} />)}
    </span>
  );
}

// The office nudged it in this idle stretch (nudge.js): a small bell.
function Bell({ s }) {
  if (!(s.nudged_at && s.last_at && s.nudged_at >= s.last_at)) return null;
  const at = new Date(s.nudged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return <span className="desk-bell" title={`the office nudged it at ${at}`} aria-label={`nudged at ${at}`}>🔔</span>;
}

export default function Desk({ s, ago, selected, onSelect, lastFlow, showMachine, asking }) {
  const pending = (s.notes || []).filter((n) => !n.delivered_at).length;
  const helpers = s.helpers || [];
  // A session the office started (dispatch.js): a helper says whose work it carries; its effort shows beside its model.
  const j = s.dispatch || null;

  return (
    <button
      type="button"
      className={`desk state-${s.state} ${selected ? 'is-selected' : ''} ${j ? 'is-dispatched' : ''} ${s.arriving ? 'is-arriving' : ''}`}
      data-key={keyOf(s)}
      onClick={() => onSelect(keyOf(s))}
      aria-pressed={selected}
    >
      <div className="desk-top">
        <span className="desk-avatar">
          <Avatar avatar={s.avatar} family={s.family} state={s.state} />
          {s.state === 'working' && <span className="typing" aria-hidden="true"><i /><i /><i /></span>}
        </span>
        <span className="desk-id">
          <span className="desk-name">
            {s.display.title ? s.display.name : s.display.label}
            {j && <span className="desk-headless" title="Started by the office: it runs headless, with no chat window">{j.parent ? 'helper' : 'office'}</span>}
          </span>
          {s.display.title && <span className="desk-title who-title">{s.display.title}{j && j.parent ? ` · helping ${j.parent.name}` : ''}</span>}
          {!s.display.title && (j && j.parent ? <span className="desk-title">Helping {j.parent.name}</span>
            : s.display.label !== s.name && <span className="desk-title">{s.name}</span>)}
          <span className="desk-meta">
            {modelLabel(s.model, s.family)}
            {j && <> · {EFFORT_SHORT[j.effort] || j.effort} effort</>}
            {showMachine && <> · {s.machine}</>}
            {s.lane && <> · lane {s.lane.toUpperCase()}</>}
          </span>
        </span>
        {asking && <span className="desk-ask" title="waiting on your answer">?</span>}
        <Bell s={s} />
        {pending > 0 && <span className="desk-mail" title={`${pending} note(s) not delivered yet`}>{pending}</span>}
      </div>

      <p className="desk-now">{nowText(s, ago)}</p>

      {helpers.length > 0 && (
        <div className="desk-helpers">
          <span className="helper-stack" aria-hidden="true">
            {helpers.slice(0, 4).map((h) => (
              <span key={h.id} className={`helper-dot tone-${h.family}`} />
            ))}
          </span>
          <span className="helper-line">
            {helpers.length === 1
              ? (helpers[0].task || stepText(helpers[0].now) || `a ${helpers[0].type} is helping`)
              : `${helpers.length} helpers working`}
          </span>
        </div>
      )}

      {lastFlow && (
        <div className="desk-said">
          <span className="said-who">{lastFlow.dir === 'out' ? `→ ${lastFlow.other}` : `${lastFlow.other} →`}</span>
          <span className="said-what">{lastFlow.subject}</span>
        </div>
      )}
    </button>
  );
}

export function QuietDesk({ s, selected, onSelect, asking }) {
  return (
    <button
      type="button"
      className={`quiet ${selected ? 'is-selected' : ''}`}
      data-key={keyOf(s)}
      onClick={() => onSelect(keyOf(s))}
      title={s.display.label !== s.name ? `${s.display.label} — ${s.name}` : s.name}
    >
      <Avatar avatar={s.avatar} family={s.family} state="idle" size={22} />
      <span className="quiet-name">{s.display.name}</span>
      {asking && <span className="desk-ask" title="waiting on your answer">?</span>}
      <Bell s={s} />
    </button>
  );
}
