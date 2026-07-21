import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { ipcChannels } from '../shared/contracts'
import { WatcherService } from './watcher'

let tray: Tray | null = null
let watcherService: WatcherService

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
  try {
    const settings = JSON.parse(await readFile(settingsPath(), 'utf8')) as {
      watchedFolders?: unknown
    }
    return Array.isArray(settings.watchedFolders)
      ? settings.watchedFolders.filter((value): value is string => typeof value === 'string')
      : []
  } catch {
    return []
  }
}

/** Persists the active folder list in Electron's user-data directory. */
async function saveFolders(folders: string[]): Promise<void> {
  await writeFile(settingsPath(), JSON.stringify({ watchedFolders: folders }, null, 2), 'utf8')
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
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const protocol = new URL(url).protocol
      if (protocol === 'https:' || protocol === 'http:') void shell.openExternal(url)
    } catch {
      // Invalid and non-web URLs stay inside the application boundary.
    }
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

/** Registers the IPC handlers exposed through the preload bridge. */
function registerIpcHandlers(): void {
  ipcMain.handle(ipcChannels.selectFolders, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose folders to watch',
      properties: ['openDirectory', 'multiSelections']
    })
    return result.canceled ? [] : result.filePaths
  })
  ipcMain.handle(ipcChannels.startWatching, async (_event, folders: string[]) => {
    const state = await watcherService.start(folders)
    await saveFolders(state.folders)
    return state
  })
  ipcMain.handle(ipcChannels.stopWatching, async () => {
    const state = await watcherService.stop()
    await saveFolders([])
    return state
  })
  ipcMain.handle(ipcChannels.getWatcherState, () => watcherService.getState())
  ipcMain.handle(ipcChannels.getWatchedFiles, () => watcherService.getFiles())
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.joshuaoladipo.pc-agent')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  watcherService = new WatcherService(
    (event) => broadcast(ipcChannels.fileEvent, event),
    (state) => broadcast(ipcChannels.watcherState, state)
  )
  registerIpcHandlers()
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
})

app.on('before-quit', () => {
  if (watcherService) void watcherService.stop()
})

app.on('window-all-closed', () => {
  // The tray keeps PC Agent running until the user explicitly quits.
})
