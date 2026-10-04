import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { ipcChannels } from '../shared/contracts'
import { WatcherService } from './watcher'
import { DatabaseService } from './database/database'
import { createEmbeddingProvider } from './config/aiSettings'
import { IngestionCoordinator } from './ingestion/ingestionCoordinator'
import { installNavigationPolicy, registerWatcherIpcHandlers } from './ipc'
import {
  loadLocalGenerationSettings,
  loadWatchedFolders,
  saveLocalGenerationSettings,
  saveWatchedFolders
} from './settings'
import { registerChatIpcHandlers } from './chatIpc'
import { LocalDiagnostics } from './diagnostics'
import { registerIndexIpcHandlers } from './indexIpc'
import { shutdownApplicationServices } from './shutdown'

let tray: Tray | null = null
let watcherService: WatcherService
let databaseService: DatabaseService
let ingestionCoordinator: IngestionCoordinator
let diagnostics: LocalDiagnostics
let shuttingDown = false

function rendererUrl(): string {
  return (
    process.env['ELECTRON_RENDERER_URL'] ??
    pathToFileURL(join(__dirname, '../renderer/index.html')).href
  )
}

/** Sends an event payload to every open renderer window. */
function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload)
}

/** Resolves the per-user settings file managed by the main process. */
function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

/** Loads saved folders, falling back to an empty list for invalid settings. */
async function loadSavedFolders(): Promise<string[]> {
  return loadWatchedFolders(settingsPath())
}

/** Persists the active folder list in Electron's user-data directory. */
async function saveFolders(folders: string[]): Promise<void> {
  await saveWatchedFolders(settingsPath(), folders)
}

/** Creates and configures the sandboxed application browser window. */
function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  installNavigationPolicy(mainWindow.webContents, rendererUrl(), (url) => shell.openExternal(url))

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

/** Registers the IPC handlers exposed through the preload bridge. */
function registerIpcHandlers(
  database: Awaited<ReturnType<DatabaseService['open']>>,
  embeddings: ReturnType<typeof createEmbeddingProvider>
): void {
  registerWatcherIpcHandlers(ipcMain, {
    watcher: watcherService,
    trustedRendererUrl: rendererUrl(),
    selectFolders: async () => {
      const result = await dialog.showOpenDialog({
        title: 'Choose folders to watch',
        properties: ['openDirectory', 'multiSelections']
      })
      return result.canceled ? [] : result.filePaths
    },
    saveFolders
  })
  registerChatIpcHandlers(ipcMain, {
    database,
    embeddings,
    trustedRendererUrl: rendererUrl(),
    watchedRoots: () => watcherService.getState().folders,
    loadGenerationSettings: () => loadLocalGenerationSettings(settingsPath()),
    saveGenerationSettings: (settings) => saveLocalGenerationSettings(settingsPath(), settings),
    metrics: diagnostics
  })
  registerIndexIpcHandlers(ipcMain, {
    database,
    ingestion: ingestionCoordinator,
    watcher: watcherService,
    diagnostics,
    trustedRendererUrl: rendererUrl(),
    revealFile: (path) => shell.showItemInFolder(path),
    exportDiagnostics: async (snapshot) => {
      const result = await dialog.showSaveDialog({
        title: 'Export privacy-safe diagnostics',
        defaultPath: `pc-agent-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (result.canceled || !result.filePath) return false
      await writeFile(
        result.filePath,
        JSON.stringify({ exportedAt: new Date().toISOString(), ...snapshot }, null, 2),
        'utf8'
      )
      return true
    }
  })
}

async function bootstrap(): Promise<void> {
  electronApp.setAppUserModelId('com.joshuaoladipo.pc-agent')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  databaseService = new DatabaseService(join(app.getPath('userData'), 'knowledge-base.db'))
  const database = await databaseService.open()
  diagnostics = new LocalDiagnostics()
  const embeddings = createEmbeddingProvider()
  ingestionCoordinator = new IngestionCoordinator(database, embeddings, { metrics: diagnostics })
  watcherService = new WatcherService(
    (event) => {
      ingestionCoordinator.handleFileEvent(event)
      broadcast(ipcChannels.fileEvent, event)
    },
    (state) => {
      ingestionCoordinator.setActiveRoots(state.folders)
      if (state.phase === 'watching') {
        void ingestionCoordinator.reconcile(state.folders, watcherService.getFiles())
      }
      broadcast(ipcChannels.watcherState, state)
    }
  )
  registerIpcHandlers(database, embeddings)
  const mainWindow = createWindow()

  await new Promise<void>((resolve) => {
    if (mainWindow.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', resolve)
    else resolve()
  })

  const savedFolders = await loadSavedFolders()
  if (savedFolders.length > 0) {
    try {
      await watcherService.start(savedFolders)
    } catch (error) {
      broadcast(ipcChannels.watcherState, {
        folders: savedFolders,
        phase: 'error',
        error: `Could not restore watched folders: ${String(error)}`
      })
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
  tray.setToolTip('PC Agent')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open PC Agent',
        click: () => {
          const window = BrowserWindow.getAllWindows()[0] ?? createWindow()
          window.show()
          window.focus()
        }
      },
      { role: 'quit' }
    ])
  )
}

void app
  .whenReady()
  .then(bootstrap)
  .catch((error) => {
    dialog.showErrorBox(
      'PC Agent could not start',
      error instanceof Error ? error.message : String(error)
    )
    app.quit()
  })

app.on('before-quit', (event) => {
  if (shuttingDown) return
  event.preventDefault()
  shuttingDown = true
  void shutdownApplicationServices({
    watcher: watcherService,
    ingestion: ingestionCoordinator,
    database: databaseService
  })
    .catch(() => {
      dialog.showErrorBox(
        'PC Agent shutdown warning',
        'One or more background services could not close cleanly.'
      )
    })
    .finally(() => app.quit())
})

app.on('window-all-closed', () => {
  // The tray keeps PC Agent running until the user explicitly quits.
})
