import { Button } from './ui/button';
import { MarkdownWithTimestamps } from './MarkdownWithTimestamps';

interface Props {
  markdown: string | null;
  onRegenerate: () => void;
  onSeek?: (sec: number) => void;
}

export function SummaryView({ markdown, onRegenerate, onSeek }: Props) {
  return (
    <div className="p-3 overflow-auto h-full">
      <div className="flex justify-end mb-2">
        <Button variant="outline" onClick={onRegenerate}>Regenerate</Button>
      </div>
      {markdown
        ? <MarkdownWithTimestamps text={markdown} onSeek={onSeek} />
        : <div className="text-slate-500 text-sm">No summary yet. Click "Regenerate" to create one.</div>}
    </div>
  );
}
