import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

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
