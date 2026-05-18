// src/main/llm/ollama.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaProvider } from './ollama';

const encoder = new TextEncoder();
function makeStreamResponse(chunks: string[]) {
  let i = 0;
  return new Response(new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) { controller.close(); return; }
      controller.enqueue(encoder.encode(chunks[i++] + '\n'));
    }
  }));
}

describe('OllamaProvider', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('lists models from /api/tags', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ models: [{ name: 'llama3:8b' }, { name: 'mistral' }] }))));
    const p = new OllamaProvider('http://x');
    expect(await p.listModels()).toEqual(['llama3:8b', 'mistral']);
  });

  it('filters out embedding-only models', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        models: [
          { name: 'llama3:latest', details: { family: 'llama', families: ['llama'] } },
          { name: 'nomic-embed-text:latest', details: { family: 'nomic-bert', families: ['nomic-bert'] } },
          { name: 'all-minilm', details: { family: 'bert', families: ['bert'] } },
          { name: 'mistral' }
        ]
      }))));
    const p = new OllamaProvider('http://x');
    expect(await p.listModels()).toEqual(['llama3:latest', 'mistral']);
  });

  it('streams chat tokens', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => makeStreamResponse([
      JSON.stringify({ message: { content: 'Hel' } }),
      JSON.stringify({ message: { content: 'lo' }, done: true })
    ])));
    const tokens: string[] = [];
    const p = new OllamaProvider('http://x');
    const text = await p.chat({
      history: [], userMessage: 'hi', systemPrompt: 'sys', transcriptContext: 'ctx',
      model: 'llama3', signal: new AbortController().signal, onToken: t => tokens.push(t)
    });
    expect(tokens.join('')).toBe('Hello');
    expect(text).toBe('Hello');
  });
});
