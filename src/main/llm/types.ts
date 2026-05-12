// src/main/llm/types.ts
import type { ChatMessage, LlmProviderId } from '@shared/types';

export interface ChatCallOpts {
  history: ChatMessage[];
  userMessage: string;
  systemPrompt: string;
  transcriptContext: string;
  model: string;
  signal: AbortSignal;
  onToken: (t: string) => void;
}

export interface SummarizeCallOpts {
  transcript: string;
  systemPrompt: string;
  model: string;
  signal: AbortSignal;
  onToken: (t: string) => void;
}

export interface LlmProvider {
  id: LlmProviderId;
  listModels(): Promise<string[]>;
  summarize(opts: SummarizeCallOpts): Promise<string>;
  chat(opts: ChatCallOpts): Promise<string>;
  testConnection(): Promise<{ ok: boolean; detail: string }>;
}
