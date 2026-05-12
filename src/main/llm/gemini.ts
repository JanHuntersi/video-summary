// src/main/llm/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ChatCallOpts, LlmProvider, SummarizeCallOpts } from './types';

const HARDCODED_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro'];

export class GeminiProvider implements LlmProvider {
  readonly id = 'gemini' as const;
  private client: GoogleGenerativeAI;
  constructor(apiKey: string) { this.client = new GoogleGenerativeAI(apiKey); }

  async listModels(): Promise<string[]> { return HARDCODED_MODELS.slice(); }

  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      const m = this.client.getGenerativeModel({ model: 'gemini-2.5-flash' });
      await m.generateContent('ping');
      return { ok: true, detail: 'API key valid' };
    } catch (e) { return { ok: false, detail: (e as Error).message }; }
  }

  async summarize(opts: SummarizeCallOpts): Promise<string> {
    const model = this.client.getGenerativeModel({ model: opts.model, systemInstruction: opts.systemPrompt });
    const stream = await model.generateContentStream(`Transcript:\n\n${opts.transcript}`);
    let out = '';
    for await (const chunk of stream.stream) {
      if (opts.signal.aborted) break;
      const t = chunk.text();
      if (t) { opts.onToken(t); out += t; }
    }
    return out;
  }

  async chat(opts: ChatCallOpts): Promise<string> {
    const model = this.client.getGenerativeModel({
      model: opts.model,
      systemInstruction: `${opts.systemPrompt}\n\nVideo context:\n${opts.transcriptContext}`
    });
    const chat = model.startChat({
      history: opts.history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    });
    const result = await chat.sendMessageStream(opts.userMessage);
    let out = '';
    for await (const chunk of result.stream) {
      if (opts.signal.aborted) break;
      const t = chunk.text();
      if (t) { opts.onToken(t); out += t; }
    }
    return out;
  }
}
