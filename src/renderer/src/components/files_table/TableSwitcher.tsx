import type { FileView } from '../../viewState'

interface TableSwitcherProps {
  view: FileView
  setView: (view: FileView) => void
}

/** Renders accessible controls for switching between list and card layouts. */
function TableSwitcher({ view, setView }: TableSwitcherProps): React.JSX.Element {
  return (
    <div className="join" aria-label="File view" role="group">
      <button
        className={`btn join-item ${view === 'list' ? 'btn-active' : ''}`}
        type="button"
        aria-label="List view"
        aria-pressed={view === 'list'}
        onClick={() => setView('list')}
      >
        List
      </button>
      <button
        className={`btn join-item ${view === 'cards' ? 'btn-active' : ''}`}
        type="button"
        aria-label="Card view"
        aria-pressed={view === 'cards'}
        onClick={() => setView('cards')}
      >
        Cards
      </button>
    </div>
  )
}

export default TableSwitcher
