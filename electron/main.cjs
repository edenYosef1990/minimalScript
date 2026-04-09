const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const DIST_INDEX = path.join(__dirname, '..', 'dist', 'eden-script-desktop', 'index.html');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#0b1020',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  win.loadFile(DIST_INDEX);
}

ipcMain.handle('eden:open-script', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open EdenScript file',
    properties: ['openFile'],
    filters: [
      { name: 'EdenScript', extensions: ['eden', 'edenscript', 'txt'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, 'utf8');

  return { filePath, content };
});

ipcMain.handle('eden:save-script', async (_event, payload) => {
  const currentPath = payload?.currentPath ?? null;
  const defaultPath = currentPath ?? path.join(app.getPath('documents'), 'scene.eden');

  const result = await dialog.showSaveDialog({
    title: 'Save EdenScript file',
    defaultPath,
    filters: [
      { name: 'EdenScript', extensions: ['eden', 'edenscript', 'txt'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  await fs.writeFile(result.filePath, payload?.content ?? '', 'utf8');
  return { filePath: result.filePath };
});

ipcMain.handle('eden:choose-asset', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose sprite asset',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  return {
    filePath,
    fileName: path.basename(filePath)
  };
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

