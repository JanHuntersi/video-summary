// src/main/llm/context.test.ts
import { describe, it, expect } from 'vitest';
import { buildChatContext } from './context';

describe('buildChatContext', () => {
  const short = 'short transcript'.repeat(10);
  const long = 'x'.repeat(800_000); // ~200k tokens

  it('uses transcript when within limit', () => {
    const r = buildChatContext({ transcript: short, summary: 'sum', tokenLimit: 100_000 });
    expect(r.source).toBe('transcript');
    expect(r.text).toBe(short);
  });

  it('falls back to summary when transcript too long', () => {
    const r = buildChatContext({ transcript: long, summary: 'sum', tokenLimit: 8_000 });
    expect(r.source).toBe('summary');
    expect(r.text).toBe('sum');
  });

  it('truncates transcript when no summary exists', () => {
    const r = buildChatContext({ transcript: long, summary: null, tokenLimit: 1_000 });
    expect(r.source).toBe('truncated-transcript');
    expect(r.text.length).toBeLessThan(long.length);
  });
});
