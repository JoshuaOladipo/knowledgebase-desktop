import type { FileEntry, FileEvent } from '../../shared/contracts'

/** Applies one watcher event immutably to the renderer's file collection. */
export function applyFileEvent(files: FileEntry[], event: FileEvent): FileEntry[] {
  if (event.type === 'unlink') return files.filter((file) => file.path !== event.path)
  if (!event.entry) return files

  const existingIndex = files.findIndex((file) => file.path === event.path)
  if (existingIndex === -1) return [...files, event.entry]
  return files.map((file, index) => (index === existingIndex ? event.entry! : file))
}

/** Filters files by name or path using a case-insensitive query. */
export function filterFiles(files: FileEntry[], query: string): FileEntry[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return files
  return files.filter((file) =>
    `${file.name} ${file.path}`.toLocaleLowerCase().includes(normalizedQuery)
  )
}

export function activeSelection(files: FileEntry[], selectedPaths: Set<string>): Set<string> {
  const activePaths = new Set(files.map((file) => file.path))
  return new Set([...selectedPaths].filter((path) => activePaths.has(path)))
}

export function currentDetails(
  files: FileEntry[],
  detailsFile: FileEntry | null
): FileEntry | null {
  return detailsFile ? (files.find((file) => file.path === detailsFile.path) ?? null) : null
}

/** Toggles only visible paths while preserving selected paths hidden by filtering. */
export function toggleVisibleSelection(
  visibleFiles: FileEntry[],
  selectedPaths: Set<string>
): Set<string> {
  if (visibleFiles.length === 0) return selectedPaths
  const next = new Set(selectedPaths)
  if (visibleFiles.every((file) => selectedPaths.has(file.path))) {
    for (const file of visibleFiles) next.delete(file.path)
  } else {
    for (const file of visibleFiles) next.add(file.path)
  }
  return next
}

/** Formats a byte count as a compact human-readable file size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`
}
