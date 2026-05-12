import { promises as fs, createWriteStream } from 'fs';
import { dirname } from 'path';
import { Whisper } from 'smart-whisper';
import type { TranscriptSegment } from '@shared/types';
import { modelFilePath, modelUrl, type ModelName } from './models';

export async function ensureModel(modelsDir: string, model: ModelName): Promise<string> {
  const path = modelFilePath(modelsDir, model);
  try { await fs.access(path); return path; } catch { /* needs download */ }
  await fs.mkdir(dirname(path), { recursive: true });
  const url = modelUrl(model);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Model download failed: ${res.status}`);
  const file = createWriteStream(path);
  await new Promise<void>((resolve, reject) => {
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const pump = (): Promise<void> => reader.read().then(({ done, value }) => {
      if (done) { file.end(); return; }
      file.write(Buffer.from(value));
      return pump();
    });
    file.on('finish', resolve);
    file.on('error', reject);
    pump().catch(reject);
  });
  return path;
}

export interface TranscribeOpts {
  /** Mono 16k 16-bit PCM WAV file path (prepared via ffmpeg beforehand). */
  audioPath: string;
  language?: string;
  onProgress?: (segIdx: number, partial: string) => void;
}

/**
 * Read a mono 16k 16-bit PCM WAV file and return a Float32Array of samples
 * (skipping the 44-byte RIFF header, normalized to [-1, 1]).
 */
async function readWavAsFloat32(path: string): Promise<Float32Array> {
  const buf = await fs.readFile(path);
  // Standard PCM WAV header is 44 bytes; for our ffmpeg-produced files this holds.
  const dataOffset = 44;
  const pcm = buf.subarray(dataOffset);
  const samples = new Float32Array(pcm.length / 2);
  for (let i = 0, j = 0; i < pcm.length; i += 2, j++) {
    const s = pcm.readInt16LE(i);
    samples[j] = s / 32768;
  }
  return samples;
}

export async function transcribe(modelPath: string, opts: TranscribeOpts): Promise<TranscriptSegment[]> {
  const whisper = new Whisper(modelPath);
  try {
    const pcm = await readWavAsFloat32(opts.audioPath);
    const params: Record<string, unknown> = {};
    if (opts.language && opts.language !== 'auto') params.language = opts.language;

    const task = await whisper.transcribe(pcm, params);
    const segments: TranscriptSegment[] = [];
    let i = 0;
    task.on('transcribed', (s) => {
      segments.push({ start: s.from / 100, end: s.to / 100, text: s.text.trim() });
      opts.onProgress?.(i++, s.text);
    });
    await task.result;
    return segments;
  } finally {
    await whisper.free();
  }
}
