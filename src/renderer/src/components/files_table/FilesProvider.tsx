import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { FileEntry } from '../../../../shared/contracts'
import {
  activeSelection,
  currentDetails,
  filterFiles,
  toggleVisibleSelection
} from '../../fileState'
import { FilesContext } from './filesContext'
import type { FilesContextValue } from './filesContext'

/** Owns shared file, search, selection, and details state for file views. */
export function FilesProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [query, setQuery] = useState('')
  const [selectedPathState, setSelectedPaths] = useState<Set<string>>(new Set())
  const [detailsFileState, setDetailsFile] = useState<FileEntry | null>(null)
  const filteredFiles = useMemo(() => filterFiles(files, query), [files, query])
  const selectedPaths = useMemo(
    () => activeSelection(files, selectedPathState),
    [files, selectedPathState]
  )
  const detailsFile = currentDetails(files, detailsFileState)

  const value = useMemo<FilesContextValue>(
    () => ({
      files,
      filteredFiles,
      query,
      selectedPaths,
      detailsFile,
      setFiles,
      resetFiles: () => {
        setFiles([])
        setSelectedPaths(new Set())
        setDetailsFile(null)
      },
      setQuery,
      toggleSelected: (path) =>
        setSelectedPaths((current) => {
          const next = new Set(current)
          if (next.has(path)) next.delete(path)
          else next.add(path)
          return next
        }),
      toggleAll: () =>
        setSelectedPaths((current) => toggleVisibleSelection(filteredFiles, current)),
      setDetailsFile
    }),
    [detailsFile, files, filteredFiles, query, selectedPaths]
  )

  return <FilesContext.Provider value={value}>{children}</FilesContext.Provider>
}
