import type { TranscriptSegment } from '@shared/types';

export function fmtTimestamp(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatTranscriptForLlm(segments: TranscriptSegment[]): string {
  return segments.map(s => `[${fmtTimestamp(s.start)}] ${s.text}`).join('\n');
}
