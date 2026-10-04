import { createContext } from 'react'
import type { FileEntry } from '../../../../shared/contracts'

export interface FilesContextValue {
  files: FileEntry[]
  filteredFiles: FileEntry[]
  query: string
  selectedPaths: Set<string>
  detailsFile: FileEntry | null
  setFiles: React.Dispatch<React.SetStateAction<FileEntry[]>>
  resetFiles: () => void
  setQuery: (query: string) => void
  toggleSelected: (path: string) => void
  toggleAll: () => void
  setDetailsFile: (file: FileEntry | null) => void
}

export const FilesContext = createContext<FilesContextValue | null>(null)
