import { describe, it, expect } from 'vitest';
import { SessionManager } from './manager';

describe('SessionManager — state store', () => {
  it('creates an empty list', () => {
    const m = new SessionManager();
    expect(m.getAll()).toEqual([]);
  });

  it('adds and retrieves a session by id', () => {
    const m = new SessionManager();
    const id = m.createForTest({ title: 'Hello', stage: 'imported' });
    expect(m.get(id)?.title).toBe('Hello');
    expect(m.getAll().length).toBe(1);
  });

  it('emits change events on create', () => {
    const m = new SessionManager();
    let calls = 0;
    m.onChange(() => calls++);
    m.createForTest({ title: 'A', stage: 'imported' });
    expect(calls).toBe(1);
  });

  it('stops firing after unsubscribe', () => {
    const m = new SessionManager();
    let calls = 0;
    const off = m.onChange(() => calls++);
    off();
    m.createForTest({ title: 'X', stage: 'imported' });
    expect(calls).toBe(0);
  });
});
