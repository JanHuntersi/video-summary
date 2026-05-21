import { describe, it, expect } from 'vitest';
import { TranscriptionScheduler } from './scheduler';

describe('TranscriptionScheduler', () => {
  it('runs jobs one at a time in FIFO order', async () => {
    const sched = new TranscriptionScheduler();
    const order: string[] = [];
    const job = (name: string, ms: number) => () =>
      new Promise<void>(res => setTimeout(() => { order.push(name); res(); }, ms));
    await Promise.all([
      sched.submit('a', job('a', 30)),
      sched.submit('b', job('b', 10))
    ]);
    expect(order).toEqual(['a', 'b']);
  });

  it('reports current running id', async () => {
    const sched = new TranscriptionScheduler();
    let release: () => void = () => {};
    const blocking = new Promise<void>(res => { release = res; });
    const p = sched.submit('x', () => blocking);
    await new Promise(r => setImmediate(r));
    expect(sched.runningId()).toBe('x');
    release();
    await p;
    expect(sched.runningId()).toBeNull();
  });

  it('cancel(id) of a queued job drops it without running', async () => {
    const sched = new TranscriptionScheduler();
    let aRan = false, bRan = false;
    let releaseA: () => void = () => {};
    const aBlock = new Promise<void>(res => { releaseA = res; });
    const pA = sched.submit('a', async () => { aRan = true; await aBlock; });
    const pB = sched.submit('b', async () => { bRan = true; });
    await new Promise(r => setImmediate(r));
    sched.cancel('b');
    releaseA();
    await pA;
    await expect(pB).rejects.toThrow(/cancel/i);
    expect(aRan).toBe(true);
    expect(bRan).toBe(false);
  });
});
