// src/main/ipc/transcription.ts
// TranscriptionQueue and its IPC handlers have been retired (Task 8).
// This file is kept because @main/sessions/manager imports extractWav from here.
import { join } from 'path';
import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
const ffmpegPath = ffmpegStatic ? ffmpegStatic.replace('app.asar', 'app.asar.unpacked') : null;
import { tmpdir } from 'os';

export async function extractWav(videoPath: string): Promise<string> {
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
