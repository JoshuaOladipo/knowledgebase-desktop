import React, { createContext, useContext} from 'react'

// Context for files
const FilesContext = createContext<any[]>([])

export const FilesProvider = ({ files, children }: { files: any[]; children: React.ReactNode }) => (
  <FilesContext.Provider value={files}>{children}</FilesContext.Provider>
)

export const useFiles = () => useContext(FilesContext)