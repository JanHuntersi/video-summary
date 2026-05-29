import { BrowserWindow } from 'electron';
import { join } from 'path';
import type { PlayerCommand, PlayerContext, PlayerState } from '@shared/types';

/**
 * Owns the single pop-out video window and relays commands/state between it and
 * the main (owner) window. The two renderer windows never talk directly — every
 * message hops through the main process so each side only depends on the preload
 * `window.api.player` surface.
 */
class PlayerWindowManager {
  private win: BrowserWindow | null = null;
  private owner: BrowserWindow | null = null;
  private context: PlayerContext | null = null;

  open(owner: BrowserWindow, id: string, context: PlayerContext): void {
    this.owner = owner;
    this.context = context;

    if (this.win && !this.win.isDestroyed()) {
      this.win.focus();
      // Re-seek the already-open window to the freshly requested start point.
      this.command({ type: 'seek', t: context.startTime, play: false });
      return;
    }

    const win = new BrowserWindow({
      width: 960,
      height: 600,
      title: context.title,
      backgroundColor: '#000000',
      webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true }
    });
    this.win = win;

    if (process.env.ELECTRON_RENDERER_URL) {
      win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/player/${id}`);
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'), { hash: `/player/${id}` });
    }

    win.on('closed', () => {
      this.win = null;
      this.context = null;
      if (this.owner && !this.owner.isDestroyed()) {
        this.owner.webContents.send('player:closed');
      }
      this.owner = null;
    });
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.close();
  }

  getContext(): PlayerContext | null {
    return this.context;
  }

  /** Owner → player. */
  command(cmd: PlayerCommand): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('player:command', cmd);
    }
  }

  /** Player → owner. */
  reportState(state: PlayerState): void {
    if (this.owner && !this.owner.isDestroyed()) {
      this.owner.webContents.send('player:state', state);
    }
  }
}

export const playerWindow = new PlayerWindowManager();
