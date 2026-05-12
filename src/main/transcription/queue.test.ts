import { describe, it, expect } from 'vitest';
import { TranscriptionQueue } from './queue';

describe('TranscriptionQueue', () => {
  it('runs jobs serially', async () => {
    const q = new TranscriptionQueue();
    const order: string[] = [];
    const make = (name: string, ms: number) => () =>
      new Promise<void>(res => setTimeout(() => { order.push(name); res(); }, ms));
    await Promise.all([q.enqueue('a', make('a', 30)), q.enqueue('b', make('b', 10))]);
    expect(order).toEqual(['a', 'b']);
  });

  it('returns rejected promise on job error', async () => {
    const q = new TranscriptionQueue();
    await expect(q.enqueue('x', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
  });
});
