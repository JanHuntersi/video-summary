// src/main/llm/context.ts
const CHARS_PER_TOKEN = 4;

interface BuildOpts {
  transcript: string;
  summary: string | null;
  tokenLimit: number;             // total context budget
}

export interface BuildResult {
  text: string;
  source: 'transcript' | 'summary' | 'truncated-transcript';
}

export function buildChatContext({ transcript, summary, tokenLimit }: BuildOpts): BuildResult {
  const headroom = Math.floor(tokenLimit * 0.25);
  const contextBudgetChars = (tokenLimit - headroom) * CHARS_PER_TOKEN;
  if (transcript.length <= contextBudgetChars) return { text: transcript, source: 'transcript' };
  if (summary) return { text: summary, source: 'summary' };
  return { text: transcript.slice(0, contextBudgetChars), source: 'truncated-transcript' };
}
