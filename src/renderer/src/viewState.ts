export type FileView = 'list' | 'cards'

/** Returns a requested file view as a type-safe state transition. */
export function selectFileView(view: FileView): FileView {
  return view
}
