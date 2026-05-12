import { useEffect, useState } from 'react';
import type { ChatHistory, TranscriptSegment, VideoMeta } from '@shared/types';

export function useVideo(id: string | undefined) {
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [transcript, setTranscript] = useState<TranscriptSegment[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatHistory | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setMeta(await window.api.library.getMeta(id));
      setVideoUrl(await window.api.library.videoFileUrl(id));
      setTranscript(await window.api.library.readTranscript(id));
      setSummary(await window.api.library.readSummary(id));
      setChat(await window.api.library.readChat(id));
    })();
  }, [id]);

  return { meta, videoUrl, transcript, summary, chat, setSummary, setChat };
}
