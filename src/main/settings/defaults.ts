// src/main/settings/defaults.ts
import { app } from 'electron';
import { join } from 'path';
import { homedir } from 'os';
import type { AppSettings } from '@shared/types';

export const DEFAULT_SUMMARY_PROMPT =
  'You are a helpful assistant that produces a concise structured summary of a video transcript. ' +
  'Include: (1) one-paragraph TL;DR, (2) key bullet points, (3) chapters with timestamps.';

export const DEFAULT_CHAT_PROMPT =
  'You are a helpful assistant answering questions about a specific video. ' +
  'The transcript is provided as context. Cite timestamps (mm:ss) when relevant.';

export function defaultSettings(): AppSettings {
  const userData = app?.getPath ? app.getPath('userData') : join(homedir(), '.video-summary');
  return {
    libraryPath: join(homedir(), 'Videos', 'VideoSummary'),
    importMode: 'copy',
    whisper: { defaultModel: 'base', modelsDir: join(userData, 'whisper-models') },
    ollama: { baseUrl: 'http://localhost:11434' },
    gemini: { hasKey: false },
    prompts: { summary: DEFAULT_SUMMARY_PROMPT, chat: DEFAULT_CHAT_PROMPT },
    defaultLlm: { providerId: 'ollama', model: '' },
    autoTranscribe: true,
    autoSummarize: false
  };
}
