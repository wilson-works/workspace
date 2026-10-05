// Avatar.jsx — a session's emblem inside its model family's frame.
//
// The emblems and frames are the WorkSpace avatar set (src/ui/avatars/*.json), chosen by the
// server (src/server/avatars.js): unique among live sessions, stable for a session's life.
// Drawn as a gradient disc with a duotone icon and an optional filled underlay icon at 35%. A session with no emblem yet falls back to the plain person.

import EMBLEMS from '../avatars/emblems.json';
import FRAMES from '../avatars/frames.json';
import ICONS from '../avatars/icons.json';
import '../avatars/keyframes.css';
import Person from './Person.jsx';

function Glyph({ name, weight, size, color, opacity, animation }) {
  const paths = (ICONS[name] || {})[weight];
  if (!paths) return null;
  return (
    <svg
      className="avatar-glyph"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill={color}
      style={{ opacity, animation }}
      aria-hidden="true"
    >
      {paths.map((p, i) => <path key={i} d={p.d} opacity={p.o} />)}
    </svg>
  );
}

function emblemAnimation(name) {
  if (!name) return undefined;
  return name === 'emblemRotate' ? 'emblemRotate 8s linear infinite' : `${name} 3s ease-in-out infinite`;
}

/**
 * avatar: {emblem, variant, frame} from the frame; faint: a helper, drawn in its parent's emblem.
 */
export default function Avatar({ avatar, family = 'unknown', state = 'idle', size = 40, faint = false, title }) {
  const e = avatar && EMBLEMS[avatar.emblem];
  if (!e) return <Person family={family} state={state} size={size} />;
  const f = (avatar.frame && FRAMES[avatar.frame]) || null;
  const bg = [e.image ? `url("${e.image}")` : null, e.pattern || null, e.bg].filter(Boolean).join(', ');
  const glyph = Math.round(size * (e.underlay ? 0.42 : 0.56));
  return (
    <span
      className={`avatar avatar-${state} ${faint ? 'avatar-faint' : ''} ${avatar.variant > 1 ? 'avatar-variant' : ''}`}
      title={title}
      style={{
        width: size,
        height: size,
        background: bg,
        color: e.color,
        border: f ? f.border : `2px solid ${e.color}66`,
        boxShadow: f ? f.shadow : undefined,
        animation: f ? f.animation : undefined,
        '--frame-shadow-base': f ? f.shadow : undefined,
        '--frame-shadow-pulse': f ? f.pulse : undefined,
      }}
      data-emblem={avatar.emblem}
      data-frame={avatar.frame || ''}
      aria-hidden={title ? undefined : 'true'}
    >
      {e.underlay && (
        <span className="avatar-underlay">
          <Glyph name={e.underlay} weight="fill" size={Math.round(size * 0.6)} color={e.underlayColor || e.color} opacity={0.35} />
        </span>
      )}
      <Glyph name={e.icon} weight="duotone" size={glyph} color={e.color} animation={emblemAnimation(e.animation)} />
    </span>
  );
}
