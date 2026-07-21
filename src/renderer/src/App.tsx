import { useEffect, useState } from 'react'
import FilterableFileView from './components/FilterableFileView'
import { FilesProvider } from './components/files_table/FilesProvider'
import { useFiles } from './components/files_table/useFiles'
import { applyFileEvent } from './fileState'
import type { FileEvent, WatcherState } from '../../shared/contracts'

/** Coordinates native watcher actions with the renderer's file state and controls. */
function Workspace(): React.JSX.Element {
  const { setFiles } = useFiles()
  const [watcher, setWatcher] = useState<WatcherState>({ folders: [], phase: 'idle' })
  const [actionError, setActionError] = useState<string>()

  useEffect(() => {
    let active = true
    let hydrating = true
    const pendingEvents: FileEvent[] = []
    const removeFileListener = window.pcAgent.onFileEvent((event) => {
      if (!active) return
      if (hydrating) pendingEvents.push(event)
      else setFiles((files) => applyFileEvent(files, event))
    })
    const removeStateListener = window.pcAgent.onWatcherState((state) => {
      if (active) setWatcher(state)
    })
    void window.pcAgent.getWatcherState().then((state) => {
      if (active) setWatcher(state)
    })
    void window.pcAgent.getWatchedFiles().then((files) => {
      if (active) {
        setFiles(pendingEvents.reduce(applyFileEvent, files))
        hydrating = false
      }
    })
    return () => {
      active = false
      removeFileListener()
      removeStateListener()
    }
  }, [setFiles])

  /** Prompts for folders and merges the selection into the active watcher. */
  async function addFolders(): Promise<void> {
    setActionError(undefined)
    try {
      const selected = await window.pcAgent.selectFolders()
      if (selected.length > 0) {
        setFiles([])
        setWatcher(await window.pcAgent.startWatching([...watcher.folders, ...selected]))
      }
    } catch (error) {
      setActionError(String(error))
    }
  }

  /** Removes one folder and restarts or stops the watcher as appropriate. */
  async function removeFolder(folder: string): Promise<void> {
    const remaining = watcher.folders.filter((current) => current !== folder)
    setFiles([])
    setWatcher(
      remaining.length > 0
        ? await window.pcAgent.startWatching(remaining)
        : await window.pcAgent.stopWatching()
    )
  }

  /** Stops all watching and clears the renderer's current file collection. */
  async function stopWatching(): Promise<void> {
    setFiles([])
    setWatcher(await window.pcAgent.stopWatching())
  }

  return (
    <main className="min-h-screen bg-base-200 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-col gap-4 rounded-box bg-base-100 p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">PC Agent</h1>
            <p className="text-sm text-base-content/65">
              Watch and inspect local folders in real time.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" type="button" onClick={() => void addFolders()}>
              Add folder
            </button>
            <button
              className="btn btn-outline"
              type="button"
              disabled={watcher.folders.length === 0}
              onClick={() => void stopWatching()}
            >
              Stop watching
            </button>
          </div>
        </header>

        <section
          className="rounded-box bg-base-100 p-4 shadow-sm"
          aria-labelledby="folders-heading"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="folders-heading" className="font-semibold">
              Watched folders
            </h2>
            <span className={`badge ${watcher.phase === 'error' ? 'badge-error' : 'badge-ghost'}`}>
              {watcher.phase}
            </span>
          </div>
          {watcher.folders.length === 0 ? (
            <p className="mt-2 text-sm text-base-content/60">No folders selected.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {watcher.folders.map((folder) => (
                <li
                  className="flex items-center justify-between gap-3 rounded bg-base-200 px-3 py-2"
                  key={folder}
                >
                  <span className="min-w-0 truncate font-mono text-xs" title={folder}>
                    {folder}
                  </span>
                  <button
                    className="btn btn-ghost btn-xs"
                    type="button"
                    aria-label={`Stop watching ${folder}`}
                    onClick={() => void removeFolder(folder)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(watcher.error || actionError) && (
            <p className="alert alert-error mt-3 text-sm" role="alert">
              {watcher.error ?? actionError}
            </p>
          )}
        </section>

        <FilterableFileView watcherPhase={watcher.phase} />
      </div>
    </main>
  )
}

/** Supplies application-wide file state and renders the main workspace. */
function App(): React.JSX.Element {
  return (
    <FilesProvider>
      <Workspace />
    </FilesProvider>
  )
}

export default App
