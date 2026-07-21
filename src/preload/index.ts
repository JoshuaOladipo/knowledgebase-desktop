import { contextBridge, ipcRenderer } from 'electron'
import type { FileEvent, PcAgentApi, WatcherState } from '../shared/contracts'
import { ipcChannels } from '../shared/contracts'

const api: PcAgentApi = {
  selectFolders: () => ipcRenderer.invoke(ipcChannels.selectFolders),
  startWatching: (folders) => ipcRenderer.invoke(ipcChannels.startWatching, folders),
  stopWatching: () => ipcRenderer.invoke(ipcChannels.stopWatching),
  getWatcherState: () => ipcRenderer.invoke(ipcChannels.getWatcherState),
  getWatchedFiles: () => ipcRenderer.invoke(ipcChannels.getWatchedFiles),
  onFileEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: FileEvent): void =>
      listener(payload)
    ipcRenderer.on(ipcChannels.fileEvent, handler)
    return () => ipcRenderer.removeListener(ipcChannels.fileEvent, handler)
  },
  onWatcherState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: WatcherState): void =>
      listener(payload)
    ipcRenderer.on(ipcChannels.watcherState, handler)
    return () => ipcRenderer.removeListener(ipcChannels.watcherState, handler)
  }
}

contextBridge.exposeInMainWorld('pcAgent', api)
