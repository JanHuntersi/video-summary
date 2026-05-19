// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, ChatHistory, ChatMessage, ChatRecord, ChatSummary, IndexEntry, LlmProviderId, TranscriptSegment, VideoMeta } from '../shared/types';

const api = {
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    save: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:save', patch),
    setGeminiKey: (k: string) => ipcRenderer.invoke('settings:setGeminiKey', k),
    clearGeminiKey: () => ipcRenderer.invoke('settings:clearGeminiKey'),
    checkGeminiKey: (): Promise<boolean> => ipcRenderer.invoke('settings:checkGeminiKey')
  },
  library: {
    reconcile: () => ipcRenderer.invoke('library:reconcile'),
    list: (): Promise<IndexEntry[]> => ipcRenderer.invoke('library:list'),
    getMeta: (id: string): Promise<VideoMeta> => ipcRenderer.invoke('library:getMeta', id),
    updateMeta: (id: string, patch: Partial<VideoMeta>): Promise<VideoMeta> => ipcRenderer.invoke('library:updateMeta', id, patch),
    delete: (id: string) => ipcRenderer.invoke('library:delete', id),
    pickFile: (): Promise<string | null> => ipcRenderer.invoke('library:pickFile'),
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke('library:pickFolder'),
    import: (sourceAbsPath: string, title: string): Promise<VideoMeta> =>
      ipcRenderer.invoke('library:import', { sourceAbsPath, title }),
    readTranscript: (id: string): Promise<TranscriptSegment[] | null> => ipcRenderer.invoke('library:readTranscript', id),
    readSummary: (id: string): Promise<string | null> => ipcRenderer.invoke('library:readSummary', id),
    writeSummary: (id: string, markdown: string) => ipcRenderer.invoke('library:writeSummary', id, markdown),
    readNotes: (id: string): Promise<string> => ipcRenderer.invoke('library:readNotes', id),
    writeNotes: (id: string, markdown: string) => ipcRenderer.invoke('library:writeNotes', id, markdown),
    appendNotes: (id: string, fragment: string) => ipcRenderer.invoke('library:appendNotes', id, fragment),
    readChat: (id: string): Promise<ChatHistory | null> => ipcRenderer.invoke('library:readChat', id),
    writeChat: (id: string, history: ChatHistory) => ipcRenderer.invoke('library:writeChat', id, history),
    listChats: (videoId: string): Promise<ChatSummary[]> => ipcRenderer.invoke('library:listChats', videoId),
    readChatById: (videoId: string, chatId: string): Promise<ChatRecord | null> => ipcRenderer.invoke('library:readChatById', videoId, chatId),
    writeChatById: (videoId: string, record: ChatRecord): Promise<void> => ipcRenderer.invoke('library:writeChatById', videoId, record),
    createChat: (videoId: string, title?: string): Promise<ChatRecord> => ipcRenderer.invoke('library:createChat', videoId, title),
    deleteChat: (videoId: string, chatId: string): Promise<void> => ipcRenderer.invoke('library:deleteChat', videoId, chatId),
    renameChat: (videoId: string, chatId: string, title: string): Promise<ChatRecord> => ipcRenderer.invoke('library:renameChat', videoId, chatId, title),
    videoFileUrl: (id: string): Promise<string> => ipcRenderer.invoke('library:videoFileUrl', id),
    getPaths: (id: string): Promise<{ videoUrl: string; thumbnailUrl: string; absSourcePath: string; absFolder: string }> =>
      ipcRenderer.invoke('library:getPaths', id),
    revealInFinder: (absPath: string): Promise<void> => ipcRenderer.invoke('library:revealInFinder', absPath),
    searchAll: (query: string): Promise<Array<{ videoId: string; title: string; matches: Array<{ segmentStart: number; snippet: string }> }>> =>
      ipcRenderer.invoke('library:searchAll', query),
    probeUrl: (url: string): Promise<{ title: string; durationSec: number; thumbnailUrl?: string }> =>
      ipcRenderer.invoke('library:probeUrl', url),
    startUrlImport: (url: string, titleOverride?: string): Promise<{ requestId: string }> =>
      ipcRenderer.invoke('library:startUrlImport', { url, titleOverride })
  },
  ytdlp: {
    cancel: (requestId: string): Promise<void> => ipcRenderer.invoke('ytdlp:cancel', requestId),
    onProgress: (fn: (p: { requestId: string; phase: string; message: string }) => void) => {
      const listener = (_: unknown, p: any) => fn(p);
      ipcRenderer.on('ytdlp:progress', listener);
      return () => ipcRenderer.removeListener('ytdlp:progress', listener);
    },
    onDone: (fn: (p: { requestId: string; meta: VideoMeta }) => void) => {
      const listener = (_: unknown, p: any) => fn(p);
      ipcRenderer.on('ytdlp:done', listener);
      return () => ipcRenderer.removeListener('ytdlp:done', listener);
    },
    onError: (fn: (p: { requestId: string; message: string }) => void) => {
      const listener = (_: unknown, p: any) => fn(p);
      ipcRenderer.on('ytdlp:error', listener);
      return () => ipcRenderer.removeListener('ytdlp:error', listener);
    }
  },
  transcription: {
    start: (videoId: string, model: string, language: string) =>
      ipcRenderer.invoke('transcription:start', { videoId, model, language }),
    onProgress: (fn: (p: { videoId: string; segmentIndex: number; partialText: string }) => void) => {
      const listener = (_: unknown, p: any) => fn(p);
      ipcRenderer.on('transcription:progress', listener);
      return () => ipcRenderer.removeListener('transcription:progress', listener);
    },
    onDone: (fn: (p: { videoId: string }) => void) => {
      const listener = (_: unknown, p: any) => fn(p);
      ipcRenderer.on('transcription:done', listener);
      return () => ipcRenderer.removeListener('transcription:done', listener);
    },
    onError: (fn: (p: { videoId: string; message: string }) => void) => {
      const listener = (_: unknown, p: any) => fn(p);
      ipcRenderer.on('transcription:error', listener);
      return () => ipcRenderer.removeListener('transcription:error', listener);
    },
    getQueue: (): Promise<Array<{ videoId: string; title: string; status: 'queued' | 'running'; addedAt: string }>> =>
      ipcRenderer.invoke('transcription:getQueue'),
    onQueueChanged: (fn: (items: Array<{ videoId: string; title: string; status: 'queued' | 'running'; addedAt: string }>) => void) => {
      const listener = (_: unknown, p: { items: Array<{ videoId: string; title: string; status: 'queued' | 'running'; addedAt: string }> }) => fn(p.items);
      ipcRenderer.on('transcription:queueChanged', listener);
      return () => ipcRenderer.removeListener('transcription:queueChanged', listener);
    }
  },
  llm: {
    listModels: (providerId: LlmProviderId): Promise<string[]> => ipcRenderer.invoke('llm:listModels', providerId),
    testConnection: (providerId: LlmProviderId): Promise<{ ok: boolean; detail: string }> =>
      ipcRenderer.invoke('llm:testConnection', providerId),
    summarize: (args: { providerId: LlmProviderId; model: string; transcript: string; systemPrompt: string }): Promise<string> =>
      ipcRenderer.invoke('llm:summarize', args),
    chat: (args: { providerId: LlmProviderId; model: string; history: ChatMessage[]; userMessage: string;
                   systemPrompt: string; transcript: string; summary: string | null }): Promise<string> =>
      ipcRenderer.invoke('llm:chat', args),
    cancel: (requestId: string) => ipcRenderer.invoke('llm:cancel', requestId),
    onChunk: (fn: (chunk: { requestId: string; token: string; done: boolean; error?: string }) => void) => {
      const listener = (_: unknown, c: any) => fn(c);
      ipcRenderer.on('llm:chunk', listener);
      return () => ipcRenderer.removeListener('llm:chunk', listener);
    }
  },
  system: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('system:getVersion'),
    checkLatest: (force?: boolean): Promise<{
      current: string; latest: string | null; isNewer: boolean;
      htmlUrl: string | null; publishedAt: string | null; error?: string;
    }> => ipcRenderer.invoke('system:checkLatest', force),
    downloadUpdate: (): Promise<{ path: string; filename: string }> => ipcRenderer.invoke('system:downloadUpdate'),
    onDownloadProgress: (fn: (p: { bytesDownloaded: number; bytesTotal: number }) => void) => {
      const listener = (_: unknown, p: any) => fn(p);
      ipcRenderer.on('system:downloadProgress', listener);
      return () => ipcRenderer.removeListener('system:downloadProgress', listener);
    },
    revealInFinder: (absPath: string): Promise<void> => ipcRenderer.invoke('system:revealInFinder', absPath),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('system:openExternal', url)
  }
};

contextBridge.exposeInMainWorld('api', api);

declare global { interface Window { api: typeof api; } }
export type Api = typeof api;
