// src/shared/types.ts
export type VideoStatus =
  | 'imported'
  | 'transcribing'
  | 'transcribed'
  | 'summarizing'
  | 'summarized'
  | 'error';

export interface TranscriptSegment {
  start: number; // seconds
  end: number;
  text: string;
}

export interface VideoMeta {
  id: string;
  title: string;
  slug: string;
  folderName: string;
  originalFilename: string;
  sourceRelPath: string;       // relative to library root
  thumbnailRelPath: string;
  durationSec: number;
  createdAt: string;            // ISO
  status: VideoStatus;
  hash?: string;
  transcription?: { model: string; language: string; completedAt: string };
  summary?: { provider: 'ollama' | 'gemini'; model: string; systemPrompt: string; generatedAt: string };
  errorMessage?: string;
  tags?: string[];
  notes?: string;
}

export interface IndexEntry {
  id: string;
  title: string;
  folderName: string;
  thumbnailRelPath: string;
  durationSec: number;
  createdAt: string;
  status: VideoStatus;
  tags?: string[];
}

export interface AppSettings {
  libraryPath: string;
  importMode: 'copy' | 'move';
  whisper: { defaultModel: 'tiny' | 'base' | 'small' | 'medium' | 'turbo' | 'large'; modelsDir: string };
  ollama: { baseUrl: string };
  gemini: { hasKey: boolean };          // actual key in keychain
  prompts: { summary: string; chat: string };
  defaultLlm: { providerId: 'ollama' | 'gemini'; model: string };
  autoTranscribe: boolean;
  autoSummarize: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ChatHistory {
  messages: ChatMessage[];
  systemPromptUsed: string;
}

export interface ChatRecord extends ChatHistory {
  id: string;
  title: string;
  createdAt: string;       // ISO
  lastMessageAt: string;   // ISO
}

export interface ChatSummary {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
}

export type LlmProviderId = 'ollama' | 'gemini';

export interface TranscriptionProgress {
  videoId: string;
  segmentIndex: number;
  totalEstimate: number | null;
  partialText: string;
}

export interface LlmStreamChunk {
  requestId: string;
  token: string;
  done: boolean;
  error?: string;
}

export type SessionStage =
  | 'importing-url'
  | 'importing-local'
  | 'imported'
  | 'transcribing'
  | 'transcribed'
  | 'summarizing'
  | 'summarized'
  | 'error'
  | 'cancelled';

export interface SessionProgress {
  phase: string;
  message: string;
  pct?: number;
}

export interface SessionItem {
  id: string;
  title: string;
  stage: SessionStage;
  videoId: string | null;
  progress: SessionProgress | null;
  startedAt: string;
  error: string | null;
}
