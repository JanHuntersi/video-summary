// src/main/settings/defaults.ts
import { app } from 'electron';
import { join } from 'path';
import { homedir } from 'os';
import type { AppSettings } from '@shared/types';

export const DEFAULT_SUMMARY_PROMPT =
  'You are a helpful assistant that produces a concise structured summary of a video transcript. ' +
  'Include: (1) one-paragraph TL;DR, (2) key bullet points, (3) chapters with timestamps. ' +
  'When citing moments, copy the timestamp verbatim from the transcript in [HH:MM:SS] form (e.g. [00:14:31]).';

export const DEFAULT_CHAT_PROMPT =
  'You are a helpful assistant answering questions about a specific video. ' +
  'The transcript is provided as context with each line prefixed by a timestamp in [HH:MM:SS] form. ' +
  'When citing moments, copy that timestamp verbatim (e.g. [00:14:31]) — never reformat or invent timestamps.';

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
