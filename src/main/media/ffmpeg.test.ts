import { describe, it, expect, vi } from 'vitest';

vi.mock('ffmpeg-static', () => ({ default: '/fake/ffmpeg' }));

const spawnMock = vi.fn();
vi.mock('child_process', () => ({ spawn: (...a: unknown[]) => spawnMock(...a) }));

import { buildProbeArgs, buildThumbnailArgs } from './ffmpeg';

describe('ffmpeg arg builders', () => {
  it('probe args ask only for duration', () => {
    expect(buildProbeArgs('/v.mp4')).toEqual([
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', '/v.mp4'
    ]);
  });
  it('thumbnail args extract single frame at middle', () => {
    expect(buildThumbnailArgs('/v.mp4', 60, '/out.jpg')).toEqual([
      '-ss', '30', '-i', '/v.mp4', '-frames:v', '1', '-q:v', '4', '-y', '/out.jpg'
    ]);
  });
});
