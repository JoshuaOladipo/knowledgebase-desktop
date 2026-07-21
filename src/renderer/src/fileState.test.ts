import { describe, expect, it } from 'vitest'
import type { FileEntry } from '../../shared/contracts'
import { applyFileEvent, filterFiles, formatBytes } from './fileState'
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
})
