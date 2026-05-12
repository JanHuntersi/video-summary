// src/main/ipc/llm.ts
import { ipcMain, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { loadSettings, getGeminiKey } from '@main/settings';
import { OllamaProvider } from '@main/llm/ollama';
import { GeminiProvider } from '@main/llm/gemini';
import type { LlmProvider } from '@main/llm/types';
import { buildChatContext } from '@main/llm/context';
import type { ChatMessage, LlmProviderId, LlmStreamChunk } from '@shared/types';

const inflight = new Map<string, AbortController>();

async function buildProvider(id: LlmProviderId): Promise<LlmProvider> {
  const s = await loadSettings();
  if (id === 'ollama') return new OllamaProvider(s.ollama.baseUrl);
  const key = await getGeminiKey();
  if (!key) throw new Error('Gemini API key not configured');
  return new GeminiProvider(key);
}

function tokenLimitFor(provider: LlmProviderId, model: string): number {
  if (provider === 'gemini') return 1_000_000;
  if (model.includes('llama3') || model.includes('llama-3')) return 8_192;
  return 4_096;
}

export function registerLlmIpc() {
  ipcMain.handle('llm:listModels', async (_e, providerId: LlmProviderId) => {
    return (await buildProvider(providerId)).listModels();
  });

  ipcMain.handle('llm:testConnection', async (_e, providerId: LlmProviderId) => {
    return (await buildProvider(providerId)).testConnection();
  });

  ipcMain.handle(
    'llm:summarize',
    async (
      e,
      args: { providerId: LlmProviderId; model: string; transcript: string; systemPrompt: string }
    ) => {
      const win = BrowserWindow.fromWebContents(e.sender);
      const requestId = randomUUID();
      const ctrl = new AbortController();
      inflight.set(requestId, ctrl);
      void (async () => {
        try {
          const provider = await buildProvider(args.providerId);
          await provider.summarize({
            transcript: args.transcript,
            systemPrompt: args.systemPrompt,
            model: args.model,
            signal: ctrl.signal,
            onToken: (t) =>
              win?.webContents.send('llm:chunk', {
                requestId,
                token: t,
                done: false
              } satisfies LlmStreamChunk)
          });
          win?.webContents.send('llm:chunk', { requestId, token: '', done: true } satisfies LlmStreamChunk);
        } catch (err) {
          win?.webContents.send('llm:chunk', {
            requestId,
            token: '',
            done: true,
            error: (err as Error).message
          } satisfies LlmStreamChunk);
        } finally {
          inflight.delete(requestId);
        }
      })();
      return requestId;
    }
  );

  ipcMain.handle(
    'llm:chat',
    async (
      e,
      args: {
        providerId: LlmProviderId;
        model: string;
        history: ChatMessage[];
        userMessage: string;
        systemPrompt: string;
        transcript: string;
        summary: string | null;
      }
    ) => {
      const win = BrowserWindow.fromWebContents(e.sender);
      const requestId = randomUUID();
      const ctrl = new AbortController();
      inflight.set(requestId, ctrl);
      void (async () => {
        try {
          const provider = await buildProvider(args.providerId);
          const ctx = buildChatContext({
            transcript: args.transcript,
            summary: args.summary,
            tokenLimit: tokenLimitFor(args.providerId, args.model)
          });
          await provider.chat({
            history: args.history,
            userMessage: args.userMessage,
            systemPrompt: args.systemPrompt,
            transcriptContext: ctx.text,
            model: args.model,
            signal: ctrl.signal,
            onToken: (t) =>
              win?.webContents.send('llm:chunk', {
                requestId,
                token: t,
                done: false
              } satisfies LlmStreamChunk)
          });
          win?.webContents.send('llm:chunk', { requestId, token: '', done: true } satisfies LlmStreamChunk);
        } catch (err) {
          win?.webContents.send('llm:chunk', {
            requestId,
            token: '',
            done: true,
            error: (err as Error).message
          } satisfies LlmStreamChunk);
        } finally {
          inflight.delete(requestId);
        }
      })();
      return requestId;
    }
  );

  ipcMain.handle('llm:cancel', (_e, requestId: string) => {
    inflight.get(requestId)?.abort();
    inflight.delete(requestId);
  });
}
