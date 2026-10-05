// Gallery.jsx — #/avatars: every emblem in each model family's frame, so you can see them all
// and retire any you dislike (config/avatars.json `retired`).

import EMBLEMS from '../avatars/emblems.json';
import CONFIG from '../../../config/avatars.json';
import Avatar from './Avatar.jsx';

const FAMILIES = ['opus', 'fable', 'sonnet', 'haiku'];
const label = (id) => id.replace(/^emblem-/, '').replace(/-/g, ' ');

export default function Gallery() {
  const retired = new Set(CONFIG.retired || []);
  const ids = Object.keys(EMBLEMS).sort();
  return (
    <div className="gallery">
      <header className="gallery-head">
        <a className="gallery-back" href="#/">← Office</a>
        <h1>Avatars</h1>
        <p>
          {ids.length} emblems, each in the frame of
          {' '}{FAMILIES.map((f, i) => <span key={f}>{i ? ', ' : ''}{f[0].toUpperCase() + f.slice(1)}</span>)}.
          {retired.size > 0 && ` ${retired.size} retired.`} To retire one, add its name to config/avatars.json.
        </p>
        <p className="gallery-credit">
          From <a href="https://credub.com" target="_blank" rel="noopener noreferrer">CreDub</a>, where your crew levels up together.
        </p>
      </header>
      <ul className="gallery-grid">
        {ids.map((id) => (
          <li key={id} className={`gallery-card ${retired.has(id) ? 'is-retired' : ''}`}>
            <div className="gallery-row">
              {FAMILIES.map((f) => (
                <Avatar
                  key={f}
                  avatar={{ emblem: id, variant: 1, frame: CONFIG.family_frames[f] }}
                  family={f}
                  state="working"
                  size={44}
                  title={`${label(id)} · ${f}`}
                />
              ))}
            </div>
            <p className="gallery-name">{label(id)}{retired.has(id) && ' · retired'}</p>
            <p className="gallery-id">{id}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
