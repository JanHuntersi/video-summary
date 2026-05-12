// src/main/llm/ollama.ts
import type { ChatCallOpts, LlmProvider, SummarizeCallOpts } from './types';

export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama' as const;
  constructor(private baseUrl: string) {}

  async listModels(): Promise<string[]> {
    const r = await fetch(`${this.baseUrl}/api/tags`);
    if (!r.ok) throw new Error(`Ollama /api/tags ${r.status}`);
    const data = await r.json() as { models?: { name: string }[] };
    return (data.models ?? []).map(m => m.name);
  }

  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      const r = await fetch(`${this.baseUrl}/api/tags`);
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      const data = await r.json() as { models?: unknown[] };
      return { ok: true, detail: `${data.models?.length ?? 0} models available` };
    } catch (e) { return { ok: false, detail: (e as Error).message }; }
  }

  summarize(opts: SummarizeCallOpts): Promise<string> {
    return this.streamChat({
      model: opts.model, signal: opts.signal, onToken: opts.onToken,
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: `Transcript:\n\n${opts.transcript}` }
      ]
    });
  }

  chat(opts: ChatCallOpts): Promise<string> {
    return this.streamChat({
      model: opts.model, signal: opts.signal, onToken: opts.onToken,
      messages: [
        { role: 'system', content: `${opts.systemPrompt}\n\nVideo context:\n${opts.transcriptContext}` },
        ...opts.history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: opts.userMessage }
      ]
    });
  }

  private async streamChat(args: {
    model: string;
    messages: { role: string; content: string }[];
    signal: AbortSignal;
    onToken: (t: string) => void;
  }): Promise<string> {
    const r = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: args.model, messages: args.messages, stream: true }),
      signal: args.signal
    });
    if (!r.ok || !r.body) throw new Error(`Ollama /api/chat ${r.status}`);
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let out = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value);
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const parsed = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
          const chunk = parsed.message?.content ?? '';
          if (chunk) { args.onToken(chunk); out += chunk; }
        } catch { /* skip malformed line */ }
      }
    }
    return out;
  }
}
