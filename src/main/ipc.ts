import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron'
import { ipcChannels } from '../shared/contracts'
import type { WatcherService } from './watcher'

export interface WatcherIpcDependencies {
  watcher: WatcherService
  selectFolders: () => Promise<string[]>
  saveFolders: (folders: string[]) => Promise<void>
  trustedRendererUrl: string
}

export function isTrustedRendererUrl(url: string, trustedRendererUrl: string): boolean {
  try {
    const candidate = new URL(url)
    const trusted = new URL(trustedRendererUrl)
    if (trusted.protocol === 'file:') {
      return candidate.protocol === 'file:' && candidate.pathname === trusted.pathname
    }
    return candidate.origin === trusted.origin
  } catch {
    return false
  }
}

export function externalWebUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null
  } catch {
    return null
  }
}

/** Locks one renderer WebContents to its trusted URL and externalizes only HTTP(S) links. */
export function installNavigationPolicy(
  webContents: Pick<WebContents, 'on' | 'setWindowOpenHandler'>,
  trustedRendererUrl: string,
  openExternal: (url: string) => Promise<unknown>
): void {
  webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url, trustedRendererUrl)) event.preventDefault()
  })
  webContents.setWindowOpenHandler(({ url }) => {
    const external = externalWebUrl(url)
    if (external) void openExternal(external)
    return { action: 'deny' }
  })
}

export function assertTrustedSender(event: IpcMainInvokeEvent, trustedRendererUrl: string): void {
  const frame = event.senderFrame
  if (
    !frame ||
    frame !== event.sender.mainFrame ||
    !isTrustedRendererUrl(frame.url, trustedRendererUrl)
  ) {
    throw new Error('IPC request rejected: untrusted sender.')
  }
}

export function validateFolderPayload(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new Error('Folders must be a non-empty array with at most 100 entries.')
  }
  return value.map((folder) => {
    if (typeof folder !== 'string' || folder.trim() === '' || folder.length > 4096) {
      throw new Error('Every folder must be a non-empty path string.')
    }
    return folder
  })
}

/** Registers the narrow watcher use cases exposed to the trusted renderer main frame. */
export function registerWatcherIpcHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  dependencies: WatcherIpcDependencies
): void {
  const trusted = (event: IpcMainInvokeEvent): void =>
    assertTrustedSender(event, dependencies.trustedRendererUrl)

  ipc.handle(ipcChannels.selectFolders, async (event, ...args) => {
    trusted(event)
    if (args.length !== 0) throw new Error('Folder selection does not accept arguments.')
    return dependencies.selectFolders()
  })
  ipc.handle(ipcChannels.startWatching, async (event, ...args) => {
    trusted(event)
    if (args.length !== 1) throw new Error('Watcher start requires one folder array.')
    const state = await dependencies.watcher.start(validateFolderPayload(args[0]))
    await dependencies.saveFolders(state.folders)
    return state
  })
  ipc.handle(ipcChannels.stopWatching, async (event, ...args) => {
    trusted(event)
    if (args.length !== 0) throw new Error('Watcher stop does not accept arguments.')
    const state = await dependencies.watcher.stop()
    await dependencies.saveFolders([])
    return state
  })
  ipc.handle(ipcChannels.getWatcherState, (event, ...args) => {
    trusted(event)
    if (args.length !== 0) throw new Error('Watcher state does not accept arguments.')
    return dependencies.watcher.getState()
  })
  ipc.handle(ipcChannels.getWatchedFiles, (event, ...args) => {
    trusted(event)
    if (args.length !== 0) throw new Error('Watched files does not accept arguments.')
    return dependencies.watcher.getFiles()
  })
}
