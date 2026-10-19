// SheetFold.jsx — one part of a session's sheet that opens and closes, remembered in this browser for every session
// (sheet-folds.js). The heading is the tap; `note` sits beside it (a count, a status).

import { useState } from 'react';
import { loadFolds, setFold, isOpen } from '../sheet-folds.js';

const store = () => { try { return window.localStorage; } catch { return null; } };

export default function SheetFold({ part, title, note, className, children }) {
  const [folds, setFolds] = useState(() => loadFolds(store()));
  const open = isOpen(folds, part);
  const toggle = (e) => {
    const now = e.currentTarget.open;
    if (now !== open) setFolds((f) => setFold(store(), f, part, now));
  };
  return (
    <details className={`sfold ${className || ''}`} open={open} onToggle={toggle} data-part={part}>
      <summary className="sfold-head">
        <span className="sfold-chev" aria-hidden="true">›</span>
        <span className="sfold-title">{title}</span>
        {note != null && note !== '' && <span className="sfold-note">{note}</span>}
      </summary>
      <div className="sfold-body">{children}</div>
    </details>
  );
}
