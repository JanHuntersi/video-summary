import { describe, it, expect, vi } from 'vitest';

const { FakeWorker } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('node:events') as typeof import('node:events');
  class FakeWorker extends EventEmitter {
    public terminated = false;
    // Constructor signature matches Worker but ignores args; test code emits manually.
    constructor(_path: string, _opts: { workerData: unknown }) { super(); }
    terminate() {
      this.terminated = true;
      this.emit('exit', 1);
      return Promise.resolve(1);
    }
  }
  return { FakeWorker };
});

vi.mock('node:worker_threads', () => ({ Worker: FakeWorker }));

import { runTranscription } from './transcribe-host';

describe('runTranscription host', () => {
  it('resolves with segments on worker done message', async () => {
    const handle = runTranscription({ modelPath: '/m', audioPath: '/a', language: 'en' });
    handle.worker.emit('message', { type: 'progress', segIdx: 0, partial: 'hi' });
    handle.worker.emit('message', { type: 'done', segments: [{ start: 0, end: 1, text: 'hi' }] });
    const segs = await handle.result;
    expect(segs).toEqual([{ start: 0, end: 1, text: 'hi' }]);
  });

  it('rejects on error message', async () => {
    const handle = runTranscription({ modelPath: '/m', audioPath: '/a', language: 'auto' });
    handle.worker.emit('message', { type: 'error', message: 'boom' });
    await expect(handle.result).rejects.toThrow('boom');
  });

  it('cancel() calls worker.terminate and rejects the result', async () => {
    const handle = runTranscription({ modelPath: '/m', audioPath: '/a', language: 'auto' });
    handle.cancel();
    await expect(handle.result).rejects.toThrow(/cancel/i);
    expect((handle.worker as unknown as typeof FakeWorker.prototype).terminated).toBe(true);
  });

  it('forwards progress to onProgress callback', async () => {
    const onProgress = vi.fn();
    const handle = runTranscription({ modelPath: '/m', audioPath: '/a', language: 'auto', onProgress });
    handle.worker.emit('message', { type: 'progress', segIdx: 2, partial: 'hello world' });
    handle.worker.emit('message', { type: 'done', segments: [] });
    await handle.result;
    expect(onProgress).toHaveBeenCalledWith(2, 'hello world');
  });
});
