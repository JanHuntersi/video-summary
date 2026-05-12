import { join } from 'path';

const MODEL_URLS = {
  tiny:   'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
  base:   'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  small:  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  medium: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
  large:  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin'
} as const;

export type ModelName = keyof typeof MODEL_URLS;

export function modelFilePath(modelsDir: string, model: ModelName): string {
  return join(modelsDir, `ggml-${model}.bin`);
}

export function modelUrl(model: ModelName): string {
  return MODEL_URLS[model];
}

export const SUPPORTED_MODELS = Object.keys(MODEL_URLS) as ModelName[];
