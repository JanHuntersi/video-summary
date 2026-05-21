import { Worker } from 'node:worker_threads';
import type { TranscriptSegment } from '@shared/types';

export interface RunOpts {
  modelPath: string;
  audioPath: string;
  language: string;
  onProgress?: (segIdx: number, partial: string) => void;
}

export interface RunHandle {
  result: Promise<TranscriptSegment[]>;
  cancel: () => void;
  // Exposed for white-box testing. The host owns this Worker; do not call .terminate() directly.
  worker: Worker;
}

export function runTranscription(opts: RunOpts): RunHandle {
  // electron-vite emits the bundled worker next to the main bundle.
  // The bundled filename is `transcribe-worker.js`; URL resolution finds it
  // relative to the host's own emitted location at runtime.
  const workerPath = new URL('./transcribe-worker.js', import.meta.url).pathname;
  const worker = new Worker(workerPath, {
    workerData: {
      modelPath: opts.modelPath,
      audioPath: opts.audioPath,
      language: opts.language
    }
  });
  let cancelled = false;
  const result = new Promise<TranscriptSegment[]>((resolve, reject) => {
    worker.on('message', (msg: { type: string;[k: string]: unknown }) => {
      if (msg.type === 'progress') {
        opts.onProgress?.(msg.segIdx as number, msg.partial as string);
      } else if (msg.type === 'done') {
        resolve(msg.segments as TranscriptSegment[]);
      } else if (msg.type === 'error') {
        reject(new Error(msg.message as string));
      }
    });
    worker.on('error', reject);
    worker.on('exit', () => {
      if (cancelled) reject(new Error('Cancelled'));
    });
  });
  return {
    worker,
    result,
    cancel: () => { cancelled = true; void worker.terminate(); }
  };
}
