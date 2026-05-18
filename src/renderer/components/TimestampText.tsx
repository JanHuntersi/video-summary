import { Fragment, type ReactNode } from 'react';

// Matches mm:ss, m:ss, h:mm:ss with optional bracket/paren wrappers
const TIMESTAMP_RE = /(\[|\()?(\d{1,2}):([0-5]\d)(?::([0-5]\d))?(\]|\))?/g;

function toSeconds(h: string | undefined, m: string, s: string): number {
  if (h !== undefined) return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10);
  return parseInt(m, 10) * 60 + parseInt(s, 10);
}

interface Props {
  text: string;
  onSeek?: (sec: number) => void;
}

export function TimestampText({ text, onSeek }: Props) {
  if (!onSeek) return <>{text}</>;
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TIMESTAMP_RE.lastIndex = 0;
  while ((m = TIMESTAMP_RE.exec(text))) {
    const [full, , p1, p2, p3] = m;
    const start = m.index;
    if (start > last) nodes.push(text.slice(last, start));
    let sec: number;
    if (p3 !== undefined) sec = toSeconds(p1, p2, p3);
    else sec = toSeconds(undefined, p1, p2);
    nodes.push(
      <button
        key={`${start}-${full}`}
        type="button"
        onClick={() => onSeek(sec)}
        className="text-blue-600 hover:text-blue-800 underline decoration-dotted underline-offset-2 font-mono"
        title={`Seek to ${full}`}
      >
        {full}
      </button>
    );
    last = start + full.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes.map((n, i) => <Fragment key={i}>{n}</Fragment>)}</>;
}

// Recursively walks ReactMarkdown children: if string, wrap with TimestampText; else preserve.
export function wrapWithTimestamps(children: ReactNode, onSeek?: (sec: number) => void): ReactNode {
  if (!onSeek) return children;
  if (typeof children === 'string') return <TimestampText text={children} onSeek={onSeek} />;
  if (Array.isArray(children)) {
    return children.map((c, i) =>
      typeof c === 'string'
        ? <TimestampText key={i} text={c} onSeek={onSeek} />
        : <Fragment key={i}>{c}</Fragment>
    );
  }
  return children;
}
