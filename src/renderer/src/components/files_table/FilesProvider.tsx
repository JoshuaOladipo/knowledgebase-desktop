import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { FileEntry } from '../../../../shared/contracts'
import { filterFiles } from '../../fileState'
import { FilesContext } from './filesContext'
import type { FilesContextValue } from './filesContext'

/** Owns shared file, search, selection, and details state for file views. */
export function FilesProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [query, setQuery] = useState('')
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [detailsFile, setDetailsFile] = useState<FileEntry | null>(null)
  const filteredFiles = useMemo(() => filterFiles(files, query), [files, query])

  const value = useMemo<FilesContextValue>(
    () => ({
      files,
      filteredFiles,
      query,
      selectedPaths,
      detailsFile,
      setFiles,
      setQuery,
      toggleSelected: (path) =>
        setSelectedPaths((current) => {
          const next = new Set(current)
          if (next.has(path)) next.delete(path)
          else next.add(path)
          return next
        }),
      toggleAll: () =>
        setSelectedPaths((current) =>
          filteredFiles.every((file) => current.has(file.path))
            ? new Set()
            : new Set(filteredFiles.map((file) => file.path))
        ),
      setDetailsFile
    }),
    [detailsFile, files, filteredFiles, query, selectedPaths]
  )

  return <FilesContext.Provider value={value}>{children}</FilesContext.Provider>
}
