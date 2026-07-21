import { useContext } from 'react'
import { FilesContext } from './filesContext'
import type { FilesContextValue } from './filesContext'

/** Returns the shared file context and enforces use beneath its provider. */
export function useFiles(): FilesContextValue {
  const context = useContext(FilesContext)
  if (!context) throw new Error('useFiles must be used inside FilesProvider')
  return context
}
