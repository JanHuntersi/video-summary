import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// In packaged mode ffmpeg-static returns a path inside app.asar — rewrite to the
// unpacked directory so child_process.spawn can execute the actual binary.
const ffmpegPath = ffmpegStatic ? ffmpegStatic.replace('app.asar', 'app.asar.unpacked') : null;

export function buildProbeArgs(input: string): string[] {
  return ['-v', 'error', '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1', input];
}

export function buildThumbnailArgs(input: string, durationSec: number, output: string): string[] {
  const mid = Math.max(0, Math.floor(durationSec / 2));
  return ['-ss', String(mid), '-i', input, '-frames:v', '1', '-q:v', '4', '-y', output];
}

export async function extractDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ffmpeg binary not found'));
    const child = spawn(ffmpegPath, ['-i', videoPath]);
    let stderr = '';
    child.stderr.on('data', (b: Buffer) => { stderr += b.toString(); });
    child.on('close', () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
      if (!m) return reject(new Error('Could not parse duration'));
      const [, hh, mm, ss] = m;
      resolve(parseInt(hh) * 3600 + parseInt(mm) * 60 + parseFloat(ss));
    });
    child.on('error', reject);
  });
}

export async function extractThumbnail(videoPath: string, durationSec: number): Promise<Buffer> {
  if (!ffmpegPath) throw new Error('ffmpeg binary not found');
  const out = join(tmpdir(), `vsw-thumb-${Date.now()}.jpg`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath!, buildThumbnailArgs(videoPath, durationSec, out));
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
    child.on('error', reject);
  });
  const data = await fs.readFile(out);
  await fs.unlink(out).catch(() => {});
  return data;
}

// Stream-copy remux to mp4. Strips edit lists and rewrites timestamps so Chromium's
// FFmpeg demuxer accepts the file (Apple ReplayKit / iOS captures often produce .mov
// files with negative timestamps that Chromium rejects with DEMUXER_ERROR_COULD_NOT_PARSE).
// No re-encode, so it's fast and lossless.
export async function remuxToMp4(inputPath: string, outputPath: string): Promise<void> {
  if (!ffmpegPath) throw new Error('ffmpeg binary not found');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath!, [
      '-y', '-i', inputPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      '-avoid_negative_ts', 'make_zero',
      outputPath
    ]);
    let stderr = '';
    child.stderr.on('data', (b: Buffer) => { stderr += b.toString(); });
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg remux exit ${code}: ${stderr.slice(-500)}`)));
    child.on('error', reject);
  });
}
