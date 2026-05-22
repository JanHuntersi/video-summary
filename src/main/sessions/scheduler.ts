type Job = () => Promise<void>;

interface Pending {
  id: string;
  job: Job;
  resolve: () => void;
  reject: (e: unknown) => void;
  cancelled: boolean;
}

export class TranscriptionScheduler {
  private q: Pending[] = [];
  private running: Pending | null = null;

  submit(id: string, job: Job): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.q.push({ id, job, resolve, reject, cancelled: false });
      void this.tick();
    });
  }

  runningId(): string | null {
    return this.running?.id ?? null;
  }

  /**
   * Cancel a queued (not-yet-running) job. To cancel a running job,
   * the SessionManager must call the worker's own terminate path —
   * the scheduler just gates concurrency, it does not own workers.
   */
  cancel(id: string): boolean {
    const idx = this.q.findIndex(p => p.id === id && !p.cancelled);
    if (idx === -1) return false;
    const p = this.q[idx];
    p.cancelled = true;
    p.reject(new Error('Cancelled before run'));
    this.q.splice(idx, 1);
    return true;
  }

  private async tick() {
    if (this.running) return;
    while (this.q.length) {
      const next = this.q.shift()!;
      if (next.cancelled) continue;
      this.running = next;
      try { await next.job(); next.resolve(); }
      catch (e) { next.reject(e); }
      finally { this.running = null; }
    }
  }
}
