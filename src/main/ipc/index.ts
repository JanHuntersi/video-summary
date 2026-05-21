// src/main/ipc/index.ts
import { registerSettingsIpc } from './settings';
import { registerLibraryIpc } from './library';
import { registerTranscriptionIpc } from './transcription';
import { registerLlmIpc } from './llm';
import { registerYtdlpIpc } from './ytdlp';
import { registerSystemIpc } from './system';
import { registerModelsIpc } from './models';
import { registerSessionsIpc } from './sessions';

export async function registerAllIpc() {
  registerSettingsIpc();
  registerLibraryIpc();
  registerTranscriptionIpc();
  registerLlmIpc();
  registerYtdlpIpc();
  registerSystemIpc();
  registerModelsIpc();
  await registerSessionsIpc();
}
