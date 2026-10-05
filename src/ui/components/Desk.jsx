// Desk.jsx — one session: who, what they are doing now, who is helping,
// and the last thing they said to another session.

import Avatar from './Avatar.jsx';
import { nowText, stepText, modelLabel } from '../words.js';

export function keyOf(s) { return `${s.machine}:${s.id}`; }

// The office nudged it in this idle stretch (nudge.js): a small bell.
function Bell({ s }) {
  if (!(s.nudged_at && s.last_at && s.nudged_at >= s.last_at)) return null;
  const at = new Date(s.nudged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return <span className="desk-bell" title={`the office nudged it at ${at}`} aria-label={`nudged at ${at}`}>🔔</span>;
}

export default function Desk({ s, ago, selected, onSelect, lastFlow, showMachine, asking }) {
  const pending = (s.notes || []).filter((n) => !n.delivered_at).length;
  const helpers = s.helpers || [];

  return (
    <button
      type="button"
      className={`desk state-${s.state} ${selected ? 'is-selected' : ''}`}
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
          <span className="desk-name">{s.display.label}</span>
          {s.display.label !== s.name && <span className="desk-title">{s.name}</span>}
          <span className="desk-meta">
            {modelLabel(s.model, s.family)}
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
