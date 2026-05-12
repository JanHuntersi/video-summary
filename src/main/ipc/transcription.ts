// src/main/ipc/transcription.ts
import { ipcMain, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { tmpdir } from 'os';
import { loadSettings } from '@main/settings';
import { readMeta, updateMeta } from '@main/library/crud';
import { TranscriptionQueue } from '@main/transcription/queue';
import { ensureModel, transcribe } from '@main/transcription/whisper';
import type { ModelName } from '@main/transcription/models';
import type { TranscriptSegment } from '@shared/types';

const queue = new TranscriptionQueue();
let queueSubscribed = false;

function broadcastQueue() {
  const items = queue.getState();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('transcription:queueChanged', { items });
  }
}

function ensureQueueSubscription() {
  if (queueSubscribed) return;
  queueSubscribed = true;
  queue.onChange(broadcastQueue);
}

async function extractWav(videoPath: string): Promise<string> {
  if (!ffmpegPath) throw new Error('ffmpeg not found');
  const out = join(tmpdir(), `vsw-${Date.now()}.wav`);
  await new Promise<void>((resolve, reject) => {
    const c = spawn(ffmpegPath as string, [
      '-i', videoPath,
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      '-y', out
    ]);
    c.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
    c.on('error', reject);
  });
  return out;
}

export function registerTranscriptionIpc() {
  ensureQueueSubscription();

  ipcMain.handle('transcription:getQueue', async () => queue.getState());

  ipcMain.handle(
    'transcription:start',
    async (e, args: { videoId: string; model: ModelName; language: string }) => {
      const win = BrowserWindow.fromWebContents(e.sender);
      const s = await loadSettings();
      const meta = await readMeta(s.libraryPath, args.videoId);
      const videoPath = join(s.libraryPath, meta.sourceRelPath);

      await queue.enqueue(args.videoId, meta.title, async () => {
        try {
          await updateMeta(s.libraryPath, args.videoId, { status: 'transcribing' });
          win?.webContents.send('transcription:progress', {
            videoId: args.videoId,
            segmentIndex: 0,
            totalEstimate: null,
            partialText: 'Preparing audio…'
          });

          const modelPath = await ensureModel(s.whisper.modelsDir, args.model);
          const wav = await extractWav(videoPath);
          const segments: TranscriptSegment[] = await transcribe(modelPath, {
            audioPath: wav,
            language: args.language,
            onProgress: (segIdx, partial) =>
              win?.webContents.send('transcription:progress', {
                videoId: args.videoId,
                segmentIndex: segIdx,
                totalEstimate: null,
                partialText: partial
              })
          });
          await fs.unlink(wav).catch(() => {});

          const folder = join(s.libraryPath, meta.folderName);
          await fs.writeFile(join(folder, 'transcript.json'), JSON.stringify(segments, null, 2));
          await fs.writeFile(join(folder, 'transcript.txt'), segments.map((seg) => seg.text).join('\n'));
          await updateMeta(s.libraryPath, args.videoId, {
            status: 'transcribed',
            transcription: {
              model: args.model,
              language: args.language,
              completedAt: new Date().toISOString()
            }
          });
          win?.webContents.send('transcription:done', { videoId: args.videoId });
        } catch (err) {
          await updateMeta(s.libraryPath, args.videoId, {
            status: 'error',
            errorMessage: (err as Error).message
          });
          win?.webContents.send('transcription:error', {
            videoId: args.videoId,
            message: (err as Error).message
          });
          throw err;
        }
      });
    }
  );
}
