// src/main/llm/gemini.test.ts
import { describe, it, expect, vi } from 'vitest';

const sendMessageStream = vi.fn();
const startChat = vi.fn(() => ({ sendMessageStream }));
const getGenerativeModel = vi.fn(() => ({ startChat, generateContent: vi.fn(async () => ({ response: { text: () => 'ok' } })) }));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({ getGenerativeModel }))
}));

import { GeminiProvider } from './gemini';

describe('GeminiProvider', () => {
  it('lists hardcoded models', async () => {
    const p = new GeminiProvider('KEY');
    expect(await p.listModels()).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro']);
  });

  it('streams chat tokens via sendMessageStream', async () => {
    sendMessageStream.mockResolvedValueOnce({
      stream: (async function*() {
        yield { text: () => 'Hi ' };
        yield { text: () => 'there' };
      })()
    });
    const tokens: string[] = [];
    const p = new GeminiProvider('KEY');
    const text = await p.chat({
      history: [], userMessage: 'hello', systemPrompt: 'sys', transcriptContext: 'ctx',
      model: 'gemini-2.5-flash', signal: new AbortController().signal, onToken: t => tokens.push(t)
    });
    expect(tokens.join('')).toBe('Hi there');
    expect(text).toBe('Hi there');
  });
});
