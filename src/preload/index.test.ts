import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ipcChannels } from '../shared/contracts'

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()
const on = vi.fn()
const removeListener = vi.fn()

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on, removeListener }
}))

describe('preload contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('exposes only the typed PC Agent bridge and uses shared channels', async () => {
    await import('./index')
    expect(exposeInMainWorld).toHaveBeenCalledOnce()
    const [name, api] = exposeInMainWorld.mock.calls[0]
    expect(name).toBe('pcAgent')
    await api.startWatching(['/tmp'])
    expect(invoke).toHaveBeenCalledWith(ipcChannels.startWatching, ['/tmp'])
    await api.getWatchedFiles()
    expect(invoke).toHaveBeenCalledWith(ipcChannels.getWatchedFiles)
    const unsubscribe = api.onFileEvent(vi.fn())
    expect(on).toHaveBeenCalledWith(ipcChannels.fileEvent, expect.any(Function))
    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith(ipcChannels.fileEvent, expect.any(Function))
  })
})
