import { describe, it, expect, vi } from 'vitest';

const generateContentStream = vi.fn();
const list = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({ models: { generateContentStream, list, generateContent: vi.fn(async () => ({ text: 'ok' })) } }))
}));

import { GeminiProvider, sortModels } from './gemini';

async function* gen<T>(items: T[]) { for (const i of items) yield i; }

describe('GeminiProvider', () => {
  it('lists live chat models, filtering non-text ones', async () => {
    list.mockResolvedValueOnce(gen([
      { name: 'models/gemini-3-pro', supportedActions: ['generateContent'] },
      { name: 'models/gemini-embedding-001', supportedActions: ['embedContent'] },
      { name: 'models/gemini-3-flash-image', supportedActions: ['generateContent'] },
      { name: 'models/gemma-3-27b-it', supportedActions: ['generateContent'] },
      { name: 'models/gemini-2.5-flash', supportedActions: ['generateContent'] }
    ]));
    expect(await new GeminiProvider('KEY').listModels()).toEqual(['gemini-3-pro', 'gemini-2.5-flash']);
  });

  it('falls back when models.list fails', async () => {
    list.mockRejectedValueOnce(new Error('offline'));
    expect(await new GeminiProvider('KEY').listModels()).toEqual(['gemini-flash-latest', 'gemini-pro-latest']);
  });

  it('sorts latest aliases first, then newest version, stable before preview', () => {
    expect(sortModels(['gemini-2.5-pro', 'gemini-3-pro-preview', 'gemini-3-flash', 'gemini-flash-latest']))
      .toEqual(['gemini-flash-latest', 'gemini-3-flash', 'gemini-3-pro-preview', 'gemini-2.5-pro']);
  });

  it('streams chat tokens with history mapped to model/user roles', async () => {
    generateContentStream.mockResolvedValueOnce(gen([{ text: 'Hi ' }, { text: 'there' }]));
    const tokens: string[] = [];
    const text = await new GeminiProvider('KEY').chat({
      history: [{ role: 'assistant', content: 'prev', createdAt: '' }],
      userMessage: 'hello', systemPrompt: 'sys', transcriptContext: 'ctx',
      model: 'gemini-3-flash', signal: new AbortController().signal, onToken: t => tokens.push(t)
    });
    expect(tokens.join('')).toBe('Hi there');
    expect(text).toBe('Hi there');
    const call = generateContentStream.mock.calls[0][0];
    expect(call.contents.map((c: { role: string }) => c.role)).toEqual(['model', 'user']);
    expect(call.config.systemInstruction).toContain('ctx');
  });
});
