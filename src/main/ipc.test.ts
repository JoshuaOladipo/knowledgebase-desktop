import { describe, expect, it, vi } from 'vitest'
import { ipcChannels } from '../shared/contracts'
import {
  assertTrustedSender,
  externalWebUrl,
  installNavigationPolicy,
  isTrustedRendererUrl,
  registerWatcherIpcHandlers,
  validateFolderPayload
} from './ipc'

function event(
  url = 'file:///app/renderer/index.html',
  mainFrame = true
): Electron.IpcMainInvokeEvent {
  const frame = { url }
  return {
    senderFrame: frame,
    sender: { mainFrame: mainFrame ? frame : { url } }
  } as unknown as Electron.IpcMainInvokeEvent
}

describe('watcher IPC boundary', () => {
  it('validates folder payloads and rejects untrusted or subframe senders', () => {
    expect(validateFolderPayload(['/tmp'])).toEqual(['/tmp'])
    expect(() => validateFolderPayload('not-an-array')).toThrow('non-empty array')
    expect(() => validateFolderPayload([])).toThrow('non-empty array')
    expect(() => validateFolderPayload([''])).toThrow('non-empty path')
    expect(() =>
      assertTrustedSender(event('https://attacker.example'), 'file:///app/renderer/index.html')
    ).toThrow('untrusted')
    expect(() =>
      assertTrustedSender(
        event('file:///app/renderer/index.html', false),
        'file:///app/renderer/index.html'
      )
    ).toThrow('untrusted')
  })

  it('allows only the trusted renderer location and external HTTP(S) links', () => {
    expect(
      isTrustedRendererUrl(
        'file:///app/renderer/index.html#details',
        'file:///app/renderer/index.html'
      )
    ).toBe(true)
    expect(
      isTrustedRendererUrl('file:///tmp/untrusted.html', 'file:///app/renderer/index.html')
    ).toBe(false)
    expect(externalWebUrl('https://example.com/path')).toBe('https://example.com/path')
    expect(externalWebUrl('http://example.com')).toBe('http://example.com/')
    expect(externalWebUrl('file:///etc/passwd')).toBeNull()
    expect(externalWebUrl('javascript:alert(1)')).toBeNull()
    expect(externalWebUrl('not a URL')).toBeNull()
  })

  it('enforces navigation and new-window policy on renderer web contents', async () => {
    let navigate: ((event: { preventDefault: () => void }, url: string) => void) | undefined
    let openWindow: ((details: { url: string }) => { action: string }) | undefined
    const openExternal = vi.fn(async () => undefined)
    installNavigationPolicy(
      {
        on: vi.fn((_event, listener) => {
          navigate = listener as typeof navigate
          return undefined as never
        }),
        setWindowOpenHandler: vi.fn((handler) => {
          openWindow = handler as typeof openWindow
        })
      } as never,
      'file:///app/renderer/index.html',
      openExternal
    )

    const trusted = { preventDefault: vi.fn() }
    navigate!(trusted, 'file:///app/renderer/index.html#chat')
    expect(trusted.preventDefault).not.toHaveBeenCalled()
    const untrusted = { preventDefault: vi.fn() }
    navigate!(untrusted, 'https://attacker.example')
    expect(untrusted.preventDefault).toHaveBeenCalledOnce()

    expect(openWindow!({ url: 'https://example.com/help' })).toEqual({ action: 'deny' })
    await vi.waitFor(() => expect(openExternal).toHaveBeenCalledWith('https://example.com/help'))
    expect(openWindow!({ url: 'file:///etc/passwd' })).toEqual({ action: 'deny' })
    expect(openWindow!({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' })
    expect(openExternal).toHaveBeenCalledTimes(1)
  })

  it('registers task-level handlers with sender and argument enforcement', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipc = {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      }
    }
    const watcher = {
      start: vi.fn(async (folders: string[]) => ({ folders, phase: 'watching' as const })),
      stop: vi.fn(async () => ({ folders: [], phase: 'idle' as const })),
      getState: vi.fn(() => ({ folders: [], phase: 'idle' as const })),
      getFiles: vi.fn(() => [])
    }
    const saveFolders = vi.fn(async () => undefined)
    registerWatcherIpcHandlers(ipc as never, {
      watcher: watcher as never,
      trustedRendererUrl: 'file:///app/renderer/index.html',
      selectFolders: async () => ['/chosen'],
      saveFolders
    })

    await expect(
      handlers.get(ipcChannels.startWatching)!(event(), ['/tmp'])
    ).resolves.toMatchObject({ phase: 'watching' })
    expect(watcher.start).toHaveBeenCalledWith(['/tmp'])
    expect(saveFolders).toHaveBeenCalledWith(['/tmp'])
    await expect(handlers.get(ipcChannels.selectFolders)!(event())).resolves.toEqual(['/chosen'])
    expect(handlers.get(ipcChannels.getWatcherState)!(event())).toEqual({
      folders: [],
      phase: 'idle'
    })
    expect(handlers.get(ipcChannels.getWatchedFiles)!(event())).toEqual([])
    await expect(handlers.get(ipcChannels.stopWatching)!(event())).resolves.toEqual({
      folders: [],
      phase: 'idle'
    })
    expect(saveFolders).toHaveBeenLastCalledWith([])
    await expect(handlers.get(ipcChannels.startWatching)!(event(), { 0: '/tmp' })).rejects.toThrow(
      'non-empty array'
    )
    expect(() => handlers.get(ipcChannels.getWatcherState)!(event(), 'extra')).toThrow(
      'does not accept arguments'
    )
    expect(() =>
      handlers.get(ipcChannels.getWatchedFiles)!(event('https://attacker.example'))
    ).toThrow('untrusted')
  })
})
