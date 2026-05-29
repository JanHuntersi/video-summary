import { ipcMain, BrowserWindow } from 'electron';
import { playerWindow } from '@main/player/window';
import type { PlayerCommand, PlayerContext, PlayerState } from '@shared/types';

export function registerPlayerIpc(): void {
  ipcMain.handle('player:open', (e, args: { id: string; context: PlayerContext }) => {
    const owner = BrowserWindow.fromWebContents(e.sender);
    if (!owner) return;
    playerWindow.open(owner, args.id, args.context);
  });

  ipcMain.handle('player:close', () => {
    playerWindow.close();
  });

  ipcMain.handle('player:getContext', (): PlayerContext | null => {
    return playerWindow.getContext();
  });

  // Owner window → player window.
  ipcMain.on('player:command', (_e, cmd: PlayerCommand) => {
    playerWindow.command(cmd);
  });

  // Player window → owner window.
  ipcMain.on('player:report', (_e, state: PlayerState) => {
    playerWindow.reportState(state);
  });
}
