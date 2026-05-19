import { app } from 'electron';

const RELEASES_API = 'https://api.github.com/repos/JanHuntersi/video-summary/releases/latest';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 h

interface LatestResult {
  current: string;
  latest: string | null;
  isNewer: boolean;
  htmlUrl: string | null;
  publishedAt: string | null;
  error?: string;
}

let cached: { at: number; result: LatestResult } | null = null;

/** Returns true if `latest` is strictly newer than `current` using a simple
 *  semver-ish compare (works for "0.1.X" / "1.2.3" / "1.0.0-beta.1" → ignores pre-release tags). */
function isNewerVersion(current: string, latest: string): boolean {
  const norm = (v: string) => v.replace(/^v/, '').split('-')[0].split('.').map(p => parseInt(p, 10) || 0);
  const a = norm(current);
  const b = norm(latest);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (y > x) return true;
    if (y < x) return false;
  }
  return false;
}

export async function checkLatestRelease(force = false): Promise<LatestResult> {
  const current = app.getVersion();
  if (!force && cached && (Date.now() - cached.at) < CACHE_TTL_MS) return cached.result;

  try {
    const r = await fetch(RELEASES_API, {
      headers: { 'accept': 'application/vnd.github+json', 'user-agent': `VideoSummary/${current}` }
    });
    if (!r.ok) throw new Error(`GitHub API ${r.status}`);
    const data = await r.json() as { tag_name?: string; html_url?: string; published_at?: string };
    const tag = data.tag_name ?? '';
    const latest = tag.replace(/^v/, '');
    const result: LatestResult = {
      current,
      latest: latest || null,
      isNewer: !!latest && isNewerVersion(current, latest),
      htmlUrl: data.html_url ?? null,
      publishedAt: data.published_at ?? null
    };
    cached = { at: Date.now(), result };
    return result;
  } catch (e) {
    const result: LatestResult = {
      current, latest: null, isNewer: false, htmlUrl: null, publishedAt: null,
      error: (e as Error).message
    };
    // Don't cache failures — let the next call retry.
    return result;
  }
}
