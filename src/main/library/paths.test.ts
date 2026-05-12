import { describe, it, expect } from 'vitest';
import { slugify, generateId, folderName } from './paths';

describe('paths', () => {
  it('slugifies titles to safe ascii', () => {
    expect(slugify('Predavanje O Reactu!')).toBe('predavanje-o-reactu');
    expect(slugify('  spaces  &  symbols  ')).toBe('spaces-symbols');
    expect(slugify('čšž — hello')).toMatch(/^[a-z0-9-]+$/);
  });

  it('generates 6-char ids', () => {
    const a = generateId();
    expect(a).toMatch(/^[a-z0-9]{6}$/);
    expect(a).not.toBe(generateId());
  });

  it('builds folder name as YYYY-MM-DD_slug_id', () => {
    const f = folderName(new Date('2026-05-12T10:00:00Z'), 'hello-world', 'abc123');
    expect(f).toBe('2026-05-12_hello-world_abc123');
  });
});
