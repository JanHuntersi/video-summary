import ReactMarkdown from 'react-markdown';
import { Button } from './ui/button';

export function SummaryView({ markdown, onRegenerate }: { markdown: string | null; onRegenerate: () => void }) {
  return (
    <div className="p-3 overflow-auto h-full">
      <div className="flex justify-end mb-2">
        <Button variant="outline" onClick={onRegenerate}>Regenerate</Button>
      </div>
      {markdown
        ? <article className="prose prose-sm max-w-none"><ReactMarkdown>{markdown}</ReactMarkdown></article>
        : <div className="text-slate-500 text-sm">No summary yet. Click "Regenerate" to create one.</div>}
    </div>
  );
}
