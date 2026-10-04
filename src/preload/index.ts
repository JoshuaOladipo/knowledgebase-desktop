import { contextBridge, ipcRenderer } from 'electron'
import type { FileEvent, PcAgentApi, WatcherState } from '../shared/contracts'
import { ipcChannels } from '../shared/contracts'

const api: PcAgentApi = {
  selectFolders: () => ipcRenderer.invoke(ipcChannels.selectFolders),
  startWatching: (folders) => ipcRenderer.invoke(ipcChannels.startWatching, folders),
  stopWatching: () => ipcRenderer.invoke(ipcChannels.stopWatching),
  getWatcherState: () => ipcRenderer.invoke(ipcChannels.getWatcherState),
  getWatchedFiles: () => ipcRenderer.invoke(ipcChannels.getWatchedFiles),
  getGenerationServerSettings: () => ipcRenderer.invoke(ipcChannels.getGenerationServerSettings),
  updateGenerationServerSettings: (settings) =>
    ipcRenderer.invoke(ipcChannels.updateGenerationServerSettings, settings),
  askQuestion: (request) => ipcRenderer.invoke(ipcChannels.askQuestion, request),
  cancelQuestion: (requestId) => ipcRenderer.invoke(ipcChannels.cancelQuestion, requestId),
  listConversations: () => ipcRenderer.invoke(ipcChannels.listConversations),
  readConversation: (id) => ipcRenderer.invoke(ipcChannels.readConversation, id),
  deleteConversation: (id) => ipcRenderer.invoke(ipcChannels.deleteConversation, id),
  getIndexStatus: () => ipcRenderer.invoke(ipcChannels.getIndexStatus),
  reindexAll: () => ipcRenderer.invoke(ipcChannels.reindexAll),
  retryDocument: (id) => ipcRenderer.invoke(ipcChannels.retryDocument, id),
  revealCitation: (documentPath) => ipcRenderer.invoke(ipcChannels.revealCitation, documentPath),
  clearDiagnostics: () => ipcRenderer.invoke(ipcChannels.clearDiagnostics),
  exportDiagnostics: () => ipcRenderer.invoke(ipcChannels.exportDiagnostics),
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
