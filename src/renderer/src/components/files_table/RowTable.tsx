import { formatBytes } from '../../fileState'
import { useFiles } from './useFiles'

/** Renders filtered files as an accessible selectable metadata table. */
function RowTable(): React.JSX.Element {
  const { filteredFiles, selectedPaths, setDetailsFile, toggleAll, toggleSelected } = useFiles()
  const allSelected = filteredFiles.every((file) => selectedPaths.has(file.path))

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="table table-zebra">
        <thead>
          <tr>
            <th>
              <input
                aria-label="Select all visible files"
                checked={allSelected}
                className="checkbox checkbox-sm"
                type="checkbox"
                onChange={toggleAll}
              />
            </th>
            <th>Name</th>
            <th>Type</th>
            <th>Size</th>
            <th>Modified</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {filteredFiles.map((file) => (
            <tr key={file.path}>
              <td>
                <input
                  aria-label={`Select ${file.name}`}
                  checked={selectedPaths.has(file.path)}
                  className="checkbox checkbox-sm"
                  type="checkbox"
                  onChange={() => toggleSelected(file.path)}
                />
              </td>
              <td>
                <div className="max-w-md">
                  <div className="font-semibold">{file.name}</div>
                  <div className="truncate text-xs text-base-content/50" title={file.path}>
                    {file.path}
                  </div>
                </div>
              </td>
              <td>{file.isDirectory ? 'Folder' : 'File'}</td>
              <td>{file.isDirectory ? '—' : formatBytes(file.size)}</td>
              <td>{new Date(file.modifiedAt).toLocaleString()}</td>
              <td>
                <button
                  className="btn btn-ghost btn-xs"
                  type="button"
                  onClick={() => setDetailsFile(file)}
                >
                  Details
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default RowTable
