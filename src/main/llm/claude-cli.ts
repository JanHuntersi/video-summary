// src/main/llm/claude-cli.ts
// Uses the locally installed Claude Code CLI (`claude -p`) so the user's own Claude
// Pro/Max subscription login is used — no API key stored in this app.
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import os from 'os';
import path from 'path';
import type { ChatCallOpts, LlmProvider, SummarizeCallOpts } from './types';

// Aliases always resolve to the newest model of each tier.
const MODELS = ['sonnet', 'opus', 'haiku'];

/** GUI apps on macOS don't inherit the shell PATH, so probe the usual install locations too. */
export function resolveClaudeBinary(): string {
  const home = os.homedir();
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const candidates = [
    path.join(home, '.local', 'bin', exe),
    path.join(home, '.claude', 'local', exe),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    ...(process.env.PATH ?? '').split(path.delimiter).filter(Boolean).map(d => path.join(d, exe))
  ];
  return candidates.find(p => existsSync(p)) ?? exe;
}

export class ClaudeCliProvider implements LlmProvider {
  readonly id = 'claude-cli' as const;
  constructor(private bin: string = resolveClaudeBinary()) {}

  async listModels(): Promise<string[]> { return MODELS.slice(); }

  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      const out = await this.run({
        model: 'haiku', systemPrompt: 'Reply with the single word: ok', prompt: 'ping',
        signal: new AbortController().signal, onToken: () => {}
      });
      return { ok: true, detail: `Claude Code CLI ready (${out.trim().slice(0, 20)})` };
    } catch (e) { return { ok: false, detail: (e as Error).message }; }
  }

  summarize(opts: SummarizeCallOpts): Promise<string> {
    return this.run({
      model: opts.model, systemPrompt: opts.systemPrompt, signal: opts.signal, onToken: opts.onToken,
      prompt: `Transcript:\n\n${opts.transcript}`
    });
  }

  chat(opts: ChatCallOpts): Promise<string> {
    // The CLI is single-shot, so prior turns are replayed inside the prompt.
    const history = opts.history
      .map(m => `<${m.role}>\n${m.content}\n</${m.role}>`)
      .join('\n\n');
    const prompt = [
      `<video_context>\n${opts.transcriptContext}\n</video_context>`,
      history && `<conversation_so_far>\n${history}\n</conversation_so_far>`,
      `Answer the user's new message:\n${opts.userMessage}`
    ].filter(Boolean).join('\n\n');
    return this.run({
      model: opts.model, systemPrompt: opts.systemPrompt, signal: opts.signal, onToken: opts.onToken, prompt
    });
  }

  private run(args: {
    model: string; systemPrompt: string; prompt: string;
    signal: AbortSignal; onToken: (t: string) => void;
  }): Promise<string> {
    return new Promise((resolve, reject) => {
      const cliArgs = [
        '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
        '--model', args.model,
        '--system-prompt', args.systemPrompt || 'You are a helpful assistant.',
        '--tools', '', '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence'
      ];
      let child;
      try {
        // Run from tmpdir so no project CLAUDE.md gets pulled into the context.
        child = spawn(this.bin, cliArgs, { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      } catch (e) {
        return reject(notFound(e as Error));
      }
      const onAbort = () => child.kill();
      args.signal.addEventListener('abort', onAbort, { once: true });

      let out = '';
      let buf = '';
      let stderr = '';
      let resultError: string | null = null;

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (d: string) => {
        buf += d;
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try {
            const ev = JSON.parse(line) as {
              type?: string; is_error?: boolean; result?: string;
              event?: { type?: string; delta?: { type?: string; text?: string } };
            };
            if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta'
                && ev.event.delta?.type === 'text_delta' && ev.event.delta.text) {
              args.onToken(ev.event.delta.text);
              out += ev.event.delta.text;
            } else if (ev.type === 'result' && ev.is_error) {
              resultError = ev.result || 'Claude CLI returned an error';
            }
          } catch { /* skip non-JSON line */ }
        }
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (d: string) => { stderr += d; });

      child.on('error', (e) => {
        args.signal.removeEventListener('abort', onAbort);
        reject(notFound(e));
      });
      child.on('close', (code) => {
        args.signal.removeEventListener('abort', onAbort);
        if (args.signal.aborted) return resolve(out);
        if (resultError) return reject(new Error(`Claude: ${resultError}`));
        if (code !== 0) {
          const detail = stderr.trim().slice(0, 300) || `exit code ${code}`;
          return reject(new Error(`Claude CLI failed: ${detail}. Is Claude Code installed and logged in (run \`claude\` once)?`));
        }
        resolve(out);
      });

      child.stdin.end(args.prompt);
    });
  }
}

function notFound(e: Error): Error {
  return (e as NodeJS.ErrnoException).code === 'ENOENT'
    ? new Error('Claude Code CLI not found. Install it (https://claude.com/claude-code) and log in with your Claude subscription.')
    : e;
}
