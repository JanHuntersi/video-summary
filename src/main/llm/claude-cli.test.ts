import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

const spawn = vi.fn();
vi.mock('child_process', () => ({ spawn: (...a: unknown[]) => spawn(...a) }));

import { ClaudeCliProvider } from './claude-cli';

function fakeChild(lines: object[], code = 0) {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill: vi.fn()
  });
  let stdinText = '';
  child.stdin.on('data', d => { stdinText += d; });
  setImmediate(() => {
    for (const l of lines) child.stdout.write(JSON.stringify(l) + '\n');
    child.stdout.end();
    setImmediate(() => child.emit('close', code));
  });
  return Object.assign(child, { stdinText: () => stdinText });
}

const delta = (text: string) => ({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });

describe('ClaudeCliProvider', () => {
  beforeEach(() => spawn.mockReset());

  it('streams text deltas and sends the prompt on stdin', async () => {
    const child = fakeChild([{ type: 'system' }, delta('Hello'), delta(' world'), { type: 'result', is_error: false }]);
    spawn.mockReturnValueOnce(child);
    const tokens: string[] = [];
    const out = await new ClaudeCliProvider('claude').summarize({
      transcript: 'TRANSCRIPT', systemPrompt: 'sys', model: 'sonnet',
      signal: new AbortController().signal, onToken: t => tokens.push(t)
    });
    expect(out).toBe('Hello world');
    expect(tokens).toEqual(['Hello', ' world']);
    expect(child.stdinText()).toContain('TRANSCRIPT');
    const args = spawn.mock.calls[0][1] as string[];
    expect(args).toContain('-p');
    expect(args[args.indexOf('--model') + 1]).toBe('sonnet');
    expect(args[args.indexOf('--tools') + 1]).toBe('');
  });

  it('rejects with the CLI result error', async () => {
    spawn.mockReturnValueOnce(fakeChild([{ type: 'result', is_error: true, result: 'Not logged in' }], 1));
    await expect(new ClaudeCliProvider('claude').chat({
      history: [], userMessage: 'q', systemPrompt: 's', transcriptContext: 'c', model: 'haiku',
      signal: new AbortController().signal, onToken: () => {}
    })).rejects.toThrow('Not logged in');
  });

  it('replays chat history inside the prompt', async () => {
    const child = fakeChild([delta('ok')]);
    spawn.mockReturnValueOnce(child);
    await new ClaudeCliProvider('claude').chat({
      history: [{ role: 'user', content: 'first q', createdAt: '' }, { role: 'assistant', content: 'first a', createdAt: '' }],
      userMessage: 'second q', systemPrompt: 's', transcriptContext: 'CTX', model: 'sonnet',
      signal: new AbortController().signal, onToken: () => {}
    });
    const p = child.stdinText();
    expect(p).toContain('CTX');
    expect(p).toContain('first a');
    expect(p.indexOf('first q')).toBeLessThan(p.indexOf('second q'));
  });
});
