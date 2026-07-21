import { useState } from 'react'
import type { WatcherPhase } from '../../../shared/contracts'
import type { FileView } from '../viewState'
import CardTable from './files_table/CardTable'
import { useFiles } from './files_table/useFiles'
import RowTable from './files_table/RowTable'
import SearchBox from './files_table/SearchBox'
import TableSwitcher from './files_table/TableSwitcher'

/** Presents searchable file results, view controls, status states, and metadata details. */
function FilterableFileView({ watcherPhase }: { watcherPhase: WatcherPhase }): React.JSX.Element {
  const [view, setView] = useState<FileView>('list')
  const { detailsFile, filteredFiles, files, setDetailsFile } = useFiles()

  return (
    <section className="rounded-box bg-base-100 p-4 shadow-sm" aria-labelledby="files-heading">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 id="files-heading" className="font-semibold">
            Files
          </h2>
          <p className="text-sm text-base-content/60">
            {filteredFiles.length} of {files.length} items
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchBox />
          <TableSwitcher view={view} setView={setView} />
        </div>
      </div>

      {watcherPhase === 'loading' && (
        <div className="mt-8 flex justify-center" role="status">
          <span className="loading loading-spinner loading-lg" />
          <span className="sr-only">Loading files</span>
        </div>
      )}
      {watcherPhase !== 'loading' && files.length === 0 && (
        <div className="mt-6 rounded-box border border-dashed border-base-300 p-10 text-center text-base-content/60">
          {watcherPhase === 'idle' ? 'Choose a folder to begin.' : 'This folder is empty.'}
        </div>
      )}
      {watcherPhase !== 'loading' && files.length > 0 && filteredFiles.length === 0 && (
        <p className="mt-8 text-center text-base-content/60">No files match your search.</p>
      )}
      {watcherPhase !== 'loading' &&
        filteredFiles.length > 0 &&
        (view === 'list' ? <RowTable /> : <CardTable />)}

      {detailsFile && (
        <div
          className="modal modal-open"
          role="dialog"
          aria-modal="true"
          aria-labelledby="details-title"
        >
          <div className="modal-box">
            <h3 id="details-title" className="text-lg font-bold">
              {detailsFile.name}
            </h3>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="font-semibold">Path</dt>
              <dd className="break-all">{detailsFile.path}</dd>
              <dt className="font-semibold">Type</dt>
              <dd>{detailsFile.isDirectory ? 'Folder' : 'File'}</dd>
              <dt className="font-semibold">Created</dt>
              <dd>{new Date(detailsFile.createdAt).toLocaleString()}</dd>
              <dt className="font-semibold">Modified</dt>
              <dd>{new Date(detailsFile.modifiedAt).toLocaleString()}</dd>
            </dl>
            <div className="modal-action">
              <button className="btn" type="button" autoFocus onClick={() => setDetailsFile(null)}>
                Close
              </button>
            </div>
          </div>
          <button
            className="modal-backdrop"
            type="button"
            aria-label="Close details"
            onClick={() => setDetailsFile(null)}
          />
        </div>
      )}
    </section>
  )
}

export default FilterableFileView
