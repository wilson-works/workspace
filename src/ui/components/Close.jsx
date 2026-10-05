// Close.jsx — the button that leaves a panel. On a desktop it is the × at the
// top right. On a phone a sheet (session, run, project, order) gets a Back
// arrow at the top left instead, and a tab's own view has none: the bottom
// tabs are the way out.

export default function Close({ onClose, sheet = false }) {
  return (
    <button
      type="button"
      className={`panel-close ${sheet ? 'is-sheet' : 'is-tab'}`}
      onClick={onClose}
      aria-label={sheet ? 'back' : 'close'}
    >
      <span className="pc-x" aria-hidden="true">×</span>
      {sheet && <span className="pc-back" aria-hidden="true">←</span>}
    </button>
  );
}
