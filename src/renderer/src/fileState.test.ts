import { describe, expect, it } from 'vitest'
import type { FileEntry } from '../../shared/contracts'
import {
  activeSelection,
  applyFileEvent,
  currentDetails,
  filterFiles,
  formatBytes,
  toggleVisibleSelection
} from './fileState'
import { selectFileView } from './viewState'

const file: FileEntry = {
  path: '/tmp/Report.TXT',
  name: 'Report.TXT',
  size: 2048,
  createdAt: '2025-01-01T00:00:00.000Z',
  modifiedAt: '2025-01-02T00:00:00.000Z',
  isDirectory: false
}

describe('renderer file state', () => {
  it('adds, updates, and removes watcher entries', () => {
    expect(applyFileEvent([], { type: 'add', path: file.path, entry: file })).toEqual([file])
    const changed = { ...file, size: 4096 }
    expect(applyFileEvent([file], { type: 'change', path: file.path, entry: changed })).toEqual([
      changed
    ])
    expect(applyFileEvent([file], { type: 'unlink', path: file.path })).toEqual([])
  })

  it('filters names and paths without case sensitivity', () => {
    expect(filterFiles([file], 'report')).toEqual([file])
    expect(filterFiles([file], '/TMP')).toEqual([file])
    expect(filterFiles([file], 'missing')).toEqual([])
  })

  it('formats sizes and selects either view', () => {
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(selectFileView('cards')).toBe('cards')
    expect(selectFileView('list')).toBe('list')
  })

  it('reconciles selection and refreshes or closes details from the active snapshot', () => {
    const changed = { ...file, size: 4096 }
    expect(activeSelection([changed], new Set([file.path, '/removed']))).toEqual(
      new Set([file.path])
    )
    expect(currentDetails([changed], file)).toEqual(changed)
    expect(currentDetails([], file)).toBeNull()
  })

  it('toggles visible selections while preserving hidden selections and handles empty results', () => {
    const hidden = { ...file, path: '/hidden', name: 'hidden' }
    const selected = new Set([hidden.path])
    expect(toggleVisibleSelection([file], selected)).toEqual(new Set([hidden.path, file.path]))
    expect(toggleVisibleSelection([file], new Set([hidden.path, file.path]))).toEqual(
      new Set([hidden.path])
    )
    expect(toggleVisibleSelection([], selected)).toBe(selected)
  })
})
