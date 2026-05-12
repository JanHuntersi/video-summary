import { app, BrowserWindow, protocol } from 'electron';
import { createReadStream, promises as fs } from 'fs';
import { join } from 'path';
import { lookup as lookupMime } from 'mime-types';
import { Readable } from 'stream';
import { registerAllIpc } from './ipc';
import { loadSettings } from './settings';
import { reconcileLibrary } from './library/reconcile';

protocol.registerSchemesAsPrivileged([
  { scheme: 'vswfile', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } }
]);

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
  protocol.handle('vswfile', async (req) => {
    try {
      const url = new URL(req.url);
      const absPath = decodeURIComponent(url.pathname);
      const stat = await fs.stat(absPath);
      const size = stat.size;
      const mime = (lookupMime(absPath) as string) || 'application/octet-stream';
      const range = req.headers.get('range');
      if (range) {
        const m = /bytes=(\d+)-(\d*)/.exec(range);
        if (m) {
          const start = parseInt(m[1], 10);
          const end = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
          const stream = createReadStream(absPath, { start, end });
          return new Response(Readable.toWeb(stream) as ReadableStream, {
            status: 206,
            headers: {
              'Content-Type': mime,
              'Content-Length': String(end - start + 1),
              'Content-Range': `bytes ${start}-${end}/${size}`,
              'Accept-Ranges': 'bytes'
            }
          });
        }
      }
      const stream = createReadStream(absPath);
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 200,
        headers: { 'Content-Type': mime, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' }
      });
    } catch (e) {
      return new Response(`Not found: ${(e as Error).message}`, { status: 404 });
    }
  });
  registerAllIpc();
  const s = await loadSettings();
  await reconcileLibrary(s.libraryPath).catch(() => {});
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
