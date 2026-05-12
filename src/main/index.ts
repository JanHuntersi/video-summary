import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { registerAllIpc } from './ipc';
import { loadSettings } from './settings';
import { reconcileLibrary } from './library/reconcile';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true }
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  registerAllIpc();
  const s = await loadSettings();
  await reconcileLibrary(s.libraryPath).catch(() => {});
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
