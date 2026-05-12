import { describe, it, expect } from 'vitest';
import { TranscriptionQueue } from './queue';

describe('TranscriptionQueue', () => {
  it('runs jobs serially', async () => {
    const q = new TranscriptionQueue();
    const order: string[] = [];
    const make = (name: string, ms: number) => () =>
      new Promise<void>(res => setTimeout(() => { order.push(name); res(); }, ms));
    await Promise.all([
      q.enqueue('a', 'A', make('a', 30)),
      q.enqueue('b', 'B', make('b', 10))
    ]);
    expect(order).toEqual(['a', 'b']);
  });

  it('returns rejected promise on job error', async () => {
    const q = new TranscriptionQueue();
    await expect(q.enqueue('x', 'X', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
  });

  it('exposes queue state with queued and running items', async () => {
    const q = new TranscriptionQueue();
    const seen: Array<{ count: number; statuses: string[] }> = [];
    q.onChange(() => {
      const s = q.getState();
      seen.push({ count: s.length, statuses: s.map(i => i.status) });
    });

    let releaseA: () => void = () => {};
    const aDone = new Promise<void>(res => { releaseA = res; });
    const pA = q.enqueue('a', 'Video A', () => aDone);
    const pB = q.enqueue('b', 'Video B', async () => {});

    // Wait a tick for the queue to start processing.
    await new Promise(r => setImmediate(r));

    const mid = q.getState();
    expect(mid.length).toBe(2);
    expect(mid[0]).toMatchObject({ videoId: 'a', title: 'Video A', status: 'running' });
    expect(mid[1]).toMatchObject({ videoId: 'b', title: 'Video B', status: 'queued' });

    releaseA();
    await Promise.all([pA, pB]);
    expect(q.getState()).toEqual([]);
    // At least one notification fired.
    expect(seen.length).toBeGreaterThan(0);
  });
});
