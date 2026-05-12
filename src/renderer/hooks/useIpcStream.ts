import { useEffect, useRef } from 'react';

export function useLlmStream(onChunk: (c: { requestId: string; token: string; done: boolean; error?: string }) => void) {
  const ref = useRef(onChunk);
  ref.current = onChunk;
  useEffect(() => {
    const off = window.api.llm.onChunk(c => ref.current(c));
    return () => { off(); };
  }, []);
}

export function useTranscriptionEvents(handlers: {
  onProgress?: (p: { videoId: string; segmentIndex: number; partialText: string }) => void;
  onDone?: (p: { videoId: string }) => void;
  onError?: (p: { videoId: string; message: string }) => void;
}) {
  const r = useRef(handlers); r.current = handlers;
  useEffect(() => {
    const offs = [
      window.api.transcription.onProgress(p => r.current.onProgress?.(p)),
      window.api.transcription.onDone(p => r.current.onDone?.(p)),
      window.api.transcription.onError(p => r.current.onError?.(p))
    ];
    return () => offs.forEach(o => o());
  }, []);
}
