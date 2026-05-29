# Pop-out synced video window — design

Date: 2026-05-29
Status: approved (structure), implementing

## Goal

Add a button in the video panel (`VideoDetail`) that pops the video out into a
separate, resizable Electron window. The pop-out stays **fully synced** with the
main window: clicking a timestamp (transcript / summary / chat / notes) seeks the
pop-out, and playback in the pop-out keeps `currentTime` flowing back so transcript
highlighting and the `j`/`k` segment-navigation shortcuts keep working.

## Approach (A): second instance of the same renderer in "player mode"

The pop-out is a second `BrowserWindow` loading the **same renderer bundle** at hash
route `#/player/:id`, reusing the existing preload and the `vswfile://` protocol.
The two windows never talk directly — the **main process relays** between them.

```
Main window (VideoDetail)            Player window (#/player/:id)
  usePlayback (remote mode)            PlayerWindow.tsx
   seek/play/pause  ───────►            <video controls vswfile://>
   currentTime      ◄───────            reports timeupdate
        │                                     │
        └────────► Main: PlayerWindowManager ◄┘
                   (owns the window, relays both ways)
```

## Units

| Unit | File | Responsibility |
|------|------|----------------|
| `PlayerWindowManager` | `src/main/player/window.ts` | Owns the single pop-out `BrowserWindow`; tracks owner window; relays commands↔state; notifies owner on close. |
| Player IPC | `src/main/ipc/player.ts` | `player:open`, `player:close`, `player:getContext`, `player:command`, `player:report` handlers. Registered in `ipc/index.ts`. |
| Preload namespace | `src/preload/index.ts` | `window.api.player.{ open, close, getContext, sendCommand, reportState, onCommand, onState, onClosed }`. |
| Shared types | `src/shared/types.ts` | `PlayerCommand`, `PlayerState`, `PlayerContext`. |
| `PlayerWindow` route | `src/renderer/routes/PlayerWindow.tsx` | Full-bleed `<video>`; runs received commands; reports state (throttled). |
| `usePlayback` hook | `src/renderer/hooks/usePlayback.ts` | Exposes `currentTime`, `isPopped`, `seek/play/pause/nudge`, `popOut/closePop`; targets local `videoRef` or remote. |
| `VideoDetail` wiring | `src/renderer/routes/VideoDetail.tsx` | "Open in external window" button; hide `<video>` + placeholder when popped; route `onSeek` + keyboard through `usePlayback`. |
| App shell | `src/renderer/App.tsx` | Render `PlayerWindow` bare (no sidebar/banner) for `/player/:id`; everything else in the normal shell. |

## Data flow / IPC channels

- **Open**: VideoDetail → `player.open({ videoId, videoUrl, title, startTime })` → Manager
  creates window, loads `#/player/:id`, remembers owner = `event.sender`. Local `<video>`
  is paused and hidden; placeholder shown.
- **getContext**: PlayerWindow on mount → `player.getContext()` → `{ videoUrl, title, startTime }`.
- **Main → player** (commands): `usePlayback.seek/play/pause` → `player.sendCommand(cmd)` →
  main → `playerWin.webContents.send('player:command', cmd)`.
  `PlayerCommand = { type: 'seek', t: number, play?: boolean } | { type: 'play' } | { type: 'pause' }`.
- **Player → main** (state): `<video>` `onTimeUpdate` (throttled ~250 ms) → `player.reportState(state)` →
  main → `ownerWin.webContents.send('player:state', state)`.
  `PlayerState = { currentTime: number, duration: number, paused: boolean }`.
- **Close**: placeholder button or window `closed` event → owner gets `player:closed` →
  `usePlayback` sets `isPopped=false`, re-mounts local `<video>`, seeks to last `currentTime` (paused).

## Edge cases

- One pop-out at a time; re-open focuses the existing window.
- Navigating away from `VideoDetail` (route change / unmount) closes the pop-out.
- Main window reload/close closes the pop-out (Manager listens; window is not a hard child).
- `nudge(delta)` and prev/next-segment are computed in the renderer from the latest
  `currentTime`, then dispatched as a `seek` — no extra command types.
- Player load/playback errors reuse the same `MediaError` → toast handling as inline.

## Testing

- `isNewerVersion`-style pure logic: none new here.
- `PlayerWindowManager` relay is Electron-bound; covered by manual verification
  (open, seek from transcript, watch highlight track, close → inline resumes at time).
- Typecheck + existing vitest suite must stay green.
