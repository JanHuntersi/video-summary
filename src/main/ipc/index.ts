// src/main/ipc/index.ts
import { registerSettingsIpc } from './settings';
import { registerLibraryIpc } from './library';
import { registerTranscriptionIpc } from './transcription';
import { registerLlmIpc } from './llm';
import { registerYtdlpIpc } from './ytdlp';
import { registerSystemIpc } from './system';

export function registerAllIpc() {
  registerSettingsIpc();
  registerLibraryIpc();
  registerTranscriptionIpc();
  registerLlmIpc();
  registerYtdlpIpc();
  registerSystemIpc();
}
