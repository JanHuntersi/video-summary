import { promises as fs, createWriteStream } from 'fs';
import { dirname } from 'path';
import { Whisper } from 'smart-whisper';
import type { TranscriptSegment } from '@shared/types';
import { modelFilePath, modelUrl, type ModelName } from './models';

interface DownloadOpts {
  onProgress?: (downloaded: number, total: number) => void;
}

export async function ensureModel(modelsDir: string, model: ModelName, opts: DownloadOpts = {}): Promise<string> {
  const path = modelFilePath(modelsDir, model);
  try { await fs.access(path); return path; } catch { /* needs download */ }
  await fs.mkdir(dirname(path), { recursive: true });
  const url = modelUrl(model);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Model download failed: ${res.status}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  let downloaded = 0;
  const file = createWriteStream(path);
  await new Promise<void>((resolve, reject) => {
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const pump = (): Promise<void> => reader.read().then(({ done, value }) => {
      if (done) { file.end(); return; }
      downloaded += value.byteLength;
      opts.onProgress?.(downloaded, total);
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

// Initial prompts in the target language. Whisper uses these as a soft bias —
// crucial for confusable low-resource South Slavic languages where smaller
// models often output the wrong neighbour (e.g. Slovenian → Croatian).
//
// Each prompt packs discourse markers and grammatical patterns that are
// distinctive for the target language vs its neighbours, biasing the decoder
// toward the right token distribution. ~50 tokens each (well under 224 limit).
const INITIAL_PROMPTS: Record<string, string> = {
  // Slovenian markers: "pravzaprav, namreč, sicer, vendar, čeprav, kakorkoli" —
  // discourse particles that are far more frequent in Slovenian than Croatian.
  // Dual forms (sva, sta, ta — "midva, vidva") are uniquely Slovenian.
  sl: 'Pozdravljeni, to je posnetek v slovenščini. Pravzaprav je namreč tako, ' +
      'da govorimo slovensko, in sicer čeprav so si jeziki podobni, midva ' +
      'oziroma vidva razumeta razliko. Hvala, prosim, recimo, kakorkoli, ' +
      'predvsem, zlasti, največkrat, dejansko.',
  // Croatian markers: "naime, naravno, ipak, dakle, međutim" + Croatian
  // orthography (j, lj, nj clusters).
  hr: 'Pozdrav, ovo je snimka na hrvatskom jeziku. Naime, govorimo hrvatski, ' +
      'naravno, i dakle, ipak međutim, što ne, znači, hvala lijepa, ' +
      'molim vas, naime, zapravo.',
  sr: 'Здраво, ово је снимак на српском језику. Наиме, говоримо српски, ' +
      'дакле, ипак међутим, заправо, наравно, хвала, молим.',
  bs: 'Pozdrav, ovo je snimak na bosanskom jeziku. Naime, govorimo bosanski, ' +
      'dakle, šta, kako, ipak, naravno, hvala, molim.',
  mk: 'Здраво, ова е снимка на македонски јазик. Имено, зборуваме македонски, ' +
      'дека, мегу другото, секако, благодарам, молам.'
};

export async function transcribe(modelPath: string, opts: TranscribeOpts): Promise<TranscriptSegment[]> {
  const whisper = new Whisper(modelPath);
  try {
    const pcm = await readWavAsFloat32(opts.audioPath);
    const params: Record<string, unknown> = {};
    if (opts.language && opts.language !== 'auto') {
      params.language = opts.language;
      const prompt = INITIAL_PROMPTS[opts.language];
      if (prompt) params.initial_prompt = prompt;
    }

    const task = await whisper.transcribe(pcm, params);
    const segments: TranscriptSegment[] = [];
    let i = 0;
    task.on('transcribed', (s) => {
      segments.push({ start: s.from / 1000, end: s.to / 1000, text: s.text.trim() });
      opts.onProgress?.(i++, s.text);
    });
    await task.result;
    return segments;
  } finally {
    await whisper.free();
  }
}
