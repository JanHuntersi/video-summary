import { ipcMain, app, shell } from 'electron';
import { promises as fs, createWriteStream } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { checkLatestRelease } from '@main/system';

interface DownloadProgress {
  bytesDownloaded: number;
  bytesTotal: number;
}

/** Pick the asset whose name matches the current platform + arch. Falls back to
 *  the first .dmg / .exe / .AppImage if no perfect match. */
function pickAsset(assets: Array<{ name: string; browser_download_url: string }>): string | null {
  if (!assets.length) return null;
  const plat = process.platform;
  const arch = process.arch;
  if (plat === 'darwin') {
    if (arch === 'arm64') {
      const a = assets.find(x => /arm64\.dmg$/i.test(x.name));
      if (a) return a.browser_download_url;
    }
    const a = assets.find(x => /\.dmg$/i.test(x.name));
    return a?.browser_download_url ?? null;
  }
  if (plat === 'win32') {
    const a = assets.find(x => /\.exe$/i.test(x.name));
    return a?.browser_download_url ?? null;
  }
  if (plat === 'linux') {
    const a = assets.find(x => /\.AppImage$/i.test(x.name));
    return a?.browser_download_url ?? null;
  }
  return null;
}

export function registerSystemIpc() {
  ipcMain.handle('system:getVersion', () => app.getVersion());

  ipcMain.handle('system:checkLatest', async (_e, force?: boolean) => {
    return checkLatestRelease(!!force);
  });

  ipcMain.handle('system:downloadUpdate', async (e) => {
    const info = await checkLatestRelease(true);
    if (!info.isNewer || !info.latest) {
      throw new Error('No newer version available');
    }
    // Fetch the release detail with asset list (checkLatestRelease only returns summary).
    const r = await fetch(`https://api.github.com/repos/JanHuntersi/video-summary/releases/tags/v${info.latest}`, {
      headers: { 'accept': 'application/vnd.github+json', 'user-agent': `VideoSummary/${app.getVersion()}` }
    });
    if (!r.ok) throw new Error(`GitHub API ${r.status}`);
    const data = await r.json() as { assets: Array<{ name: string; browser_download_url: string }> };
    const url = pickAsset(data.assets);
    if (!url) throw new Error('No matching binary for this platform in the latest release');

    // Save into ~/Downloads so the user can find it easily. Files written via
    // fs from the main process do NOT inherit the com.apple.quarantine attribute
    // (that's only added by browsers), so the dragged .app stays trusted.
    const downloadsDir = app.getPath('downloads');
    await fs.mkdir(downloadsDir, { recursive: true });
    const filename = url.split('/').pop() ?? `VideoSummary-${info.latest}.bin`;
    const destPath = join(downloadsDir, filename);

    const send = (p: DownloadProgress) => e.sender.send('system:downloadProgress', p);

    const dlRes = await fetch(url, { headers: { 'user-agent': `VideoSummary/${app.getVersion()}` } });
    if (!dlRes.ok || !dlRes.body) throw new Error(`Download failed: HTTP ${dlRes.status}`);

    const total = Number(dlRes.headers.get('content-length') ?? 0);
    let downloaded = 0;
    const nodeStream = Readable.fromWeb(dlRes.body as never);
    const reporter = new Readable({
      read() { /* passive — driven by piping */ }
    });
    // Simple tee: stream the body to disk, reporting bytes as we go.
    const out = createWriteStream(destPath);
    nodeStream.on('data', (chunk: Buffer) => {
      downloaded += chunk.length;
      send({ bytesDownloaded: downloaded, bytesTotal: total });
    });
    await pipeline(nodeStream, out);
    void reporter; // silence unused

    return { path: destPath, filename };
  });

  ipcMain.handle('system:revealInFinder', async (_e, absPath: string) => {
    await shell.showItemInFolder(absPath);
  });

  ipcMain.handle('system:openExternal', async (_e, url: string) => {
    await shell.openExternal(url);
  });
}
