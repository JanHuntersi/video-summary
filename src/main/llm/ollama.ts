// src/main/llm/ollama.ts
import type { ChatCallOpts, LlmProvider, SummarizeCallOpts } from './types';

export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama' as const;
  constructor(private baseUrl: string) {}

  async listModels(): Promise<string[]> {
    const r = await fetch(`${this.baseUrl}/api/tags`);
    if (!r.ok) throw new Error(`Ollama /api/tags ${r.status}`);
    const data = await r.json() as {
      models?: { name: string; details?: { family?: string; families?: string[] } }[]
    };
    // Drop embedding-only models — they 400 on /api/chat. Filter by name substring and known
    // embedding families (bert / nomic-bert), since /api/tags doesn't expose a "supports chat" flag.
    const isEmbedding = (m: { name: string; details?: { family?: string; families?: string[] } }) => {
      if (/embed/i.test(m.name)) return true;
      const fam = m.details?.family?.toLowerCase() ?? '';
      const families = (m.details?.families ?? []).map(f => f.toLowerCase());
      const isBert = (s: string) => s === 'bert' || s.endsWith('-bert');
      return isBert(fam) || families.some(isBert);
    };
    return (data.models ?? []).filter(m => !isEmbedding(m)).map(m => m.name);
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
    if (!r.ok || !r.body) {
      let detail = `HTTP ${r.status}`;
      try {
        const body = await r.text();
        const parsed = JSON.parse(body) as { error?: string };
        if (parsed.error) detail = parsed.error;
        else if (body.trim()) detail = `${detail}: ${body.trim().slice(0, 200)}`;
      } catch { /* keep status-only detail */ }
      throw new Error(`Ollama /api/chat: ${detail}`);
    }
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
