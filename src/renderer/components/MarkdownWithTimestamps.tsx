import ReactMarkdown, { type Components } from 'react-markdown';
import { wrapWithTimestamps } from './TimestampText';

interface Props {
  text: string;
  onSeek?: (sec: number) => void;
  className?: string;
}

export function MarkdownWithTimestamps({ text, onSeek, className }: Props) {
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
    <article className={className ?? 'prose prose-sm max-w-none'}>
      <ReactMarkdown components={components}>{text}</ReactMarkdown>
    </article>
  );
}
