import ReactMarkdown, { type Components } from 'react-markdown';
import { Button } from './ui/button';
import { wrapWithTimestamps } from './TimestampText';

interface Props {
  markdown: string | null;
  onRegenerate: () => void;
  onSeek?: (sec: number) => void;
}

export function SummaryView({ markdown, onRegenerate, onSeek }: Props) {
  const components: Components = {
    p: ({ children }) => <p>{wrapWithTimestamps(children, onSeek)}</p>,
    li: ({ children }) => <li>{wrapWithTimestamps(children, onSeek)}</li>,
    h1: ({ children }) => <h1>{wrapWithTimestamps(children, onSeek)}</h1>,
    h2: ({ children }) => <h2>{wrapWithTimestamps(children, onSeek)}</h2>,
    h3: ({ children }) => <h3>{wrapWithTimestamps(children, onSeek)}</h3>,
    strong: ({ children }) => <strong>{wrapWithTimestamps(children, onSeek)}</strong>,
    em: ({ children }) => <em>{wrapWithTimestamps(children, onSeek)}</em>
  };

  return (
    <div className="p-3 overflow-auto h-full">
      <div className="flex justify-end mb-2">
        <Button variant="outline" onClick={onRegenerate}>Regenerate</Button>
      </div>
      {markdown
        ? <article className="prose prose-sm max-w-none"><ReactMarkdown components={components}>{markdown}</ReactMarkdown></article>
        : <div className="text-slate-500 text-sm">No summary yet. Click "Regenerate" to create one.</div>}
    </div>
  );
}
