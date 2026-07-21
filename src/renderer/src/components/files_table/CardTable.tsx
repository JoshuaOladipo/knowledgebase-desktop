import { formatBytes } from '../../fileState'
import { useFiles } from './useFiles'

/** Renders filtered files as selectable metadata cards. */
function CardTable(): React.JSX.Element {
  const { filteredFiles, selectedPaths, setDetailsFile, toggleSelected } = useFiles()
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {filteredFiles.map((file) => (
        <article
          className={`card border bg-base-100 ${selectedPaths.has(file.path) ? 'border-primary' : 'border-base-300'}`}
          key={file.path}
        >
          <div className="card-body p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="card-title truncate text-base" title={file.name}>
                  {file.name}
                </h3>
                <p className="truncate text-xs text-base-content/50" title={file.path}>
                  {file.path}
                </p>
              </div>
              <input
                aria-label={`Select ${file.name}`}
                checked={selectedPaths.has(file.path)}
                className="checkbox checkbox-sm"
                type="checkbox"
                onChange={() => toggleSelected(file.path)}
              />
            </div>
            <p className="text-sm">
              {file.isDirectory ? 'Folder' : formatBytes(file.size)} ·{' '}
              {new Date(file.modifiedAt).toLocaleDateString()}
            </p>
            <div className="card-actions justify-end">
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => setDetailsFile(file)}
              >
                Details
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

export default CardTable
