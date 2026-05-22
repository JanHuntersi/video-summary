import { useEffect, useRef } from 'react';

export function useLlmStream(onChunk: (c: { requestId: string; token: string; done: boolean; error?: string }) => void) {
  const ref = useRef(onChunk);
  ref.current = onChunk;
  useEffect(() => {
    const off = window.api.llm.onChunk(c => ref.current(c));
    return () => { off(); };
  }, []);
}
