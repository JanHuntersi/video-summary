import { parentPort, workerData } from 'node:worker_threads';
import { transcribe } from './whisper';

interface WorkerInput {
  modelPath: string;
  audioPath: string;
  language: string;
}

async function main() {
  const { modelPath, audioPath, language } = workerData as WorkerInput;
  try {
    const segments = await transcribe(modelPath, {
      audioPath,
      language: language === 'auto' ? undefined : language,
      onProgress: (segIdx, partial) => {
        parentPort?.postMessage({ type: 'progress', segIdx, partial });
      }
    });
    parentPort?.postMessage({ type: 'done', segments });
  } catch (e) {
    parentPort?.postMessage({ type: 'error', message: (e as Error).message });
  }
}

void main();
