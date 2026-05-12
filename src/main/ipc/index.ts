// src/main/ipc/index.ts
import { registerSettingsIpc } from './settings';
import { registerLibraryIpc } from './library';
import { registerTranscriptionIpc } from './transcription';
import { registerLlmIpc } from './llm';

export function registerAllIpc() {
  registerSettingsIpc();
  registerLibraryIpc();
  registerTranscriptionIpc();
  registerLlmIpc();
}
