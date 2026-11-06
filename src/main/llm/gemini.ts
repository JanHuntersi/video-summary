// src/main/llm/gemini.ts
import { GoogleGenAI } from '@google/genai';
import type { ChatCallOpts, LlmProvider, SummarizeCallOpts } from './types';

// Used only when the live models.list call fails (offline, quota, …).
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-pro-latest'];

// Text-chat models only: drop embeddings, image/video/audio/TTS/live variants, Gemma etc.
const NON_CHAT = /embed|image|imagen|veo|tts|audio|live|native|aqa|vision|robotics|computer-use/i;

export class GeminiProvider implements LlmProvider {
  readonly id = 'gemini' as const;
  private client: GoogleGenAI;
  constructor(apiKey: string) { this.client = new GoogleGenAI({ apiKey }); }

  async listModels(): Promise<string[]> {
    try {
      const out: string[] = [];
      const pager = await this.client.models.list({ config: { pageSize: 100 } });
      for await (const m of pager) {
        const id = (m.name ?? '').replace(/^models\//, '');
        if (!id.startsWith('gemini-') || NON_CHAT.test(id)) continue;
        if (m.supportedActions && !m.supportedActions.includes('generateContent')) continue;
        out.push(id);
      }
      return out.length ? sortModels(out) : FALLBACK_MODELS.slice();
    } catch {
      return FALLBACK_MODELS.slice();
    }
  }

  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      const models = await this.listModels();
      await this.client.models.generateContent({ model: models[0], contents: 'ping' });
      return { ok: true, detail: `API key valid — ${models.length} models` };
    } catch (e) { return { ok: false, detail: (e as Error).message }; }
  }

  summarize(opts: SummarizeCallOpts): Promise<string> {
    return this.stream({
      model: opts.model, systemInstruction: opts.systemPrompt, signal: opts.signal, onToken: opts.onToken,
      contents: [{ role: 'user', parts: [{ text: `Transcript:\n\n${opts.transcript}` }] }]
    });
  }

  chat(opts: ChatCallOpts): Promise<string> {
    return this.stream({
      model: opts.model, signal: opts.signal, onToken: opts.onToken,
      systemInstruction: `${opts.systemPrompt}\n\nVideo context:\n${opts.transcriptContext}`,
      contents: [
        ...opts.history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        { role: 'user', parts: [{ text: opts.userMessage }] }
      ]
    });
  }

  private async stream(args: {
    model: string;
    systemInstruction: string;
    contents: { role: string; parts: { text: string }[] }[];
    signal: AbortSignal;
    onToken: (t: string) => void;
  }): Promise<string> {
    const stream = await this.client.models.generateContentStream({
      model: args.model,
      contents: args.contents,
      config: { systemInstruction: args.systemInstruction, abortSignal: args.signal }
    });
    let out = '';
    for await (const chunk of stream) {
      if (args.signal.aborted) break;
      const t = chunk.text;
      if (t) { args.onToken(t); out += t; }
    }
    return out;
  }
}

/** Newest version first; "-latest" aliases on top; previews/experimental after stable within a version. */
export function sortModels(ids: string[]): string[] {
  const version = (id: string) => parseFloat(/gemini-(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? '0');
  const rank = (id: string) => (id.endsWith('-latest') ? 0 : /preview|exp/.test(id) ? 2 : 1);
  return [...new Set(ids)].sort((a, b) =>
    rank(a) === 0 || rank(b) === 0 ? rank(a) - rank(b)
      : version(b) - version(a) || rank(a) - rank(b) || a.localeCompare(b));
}
