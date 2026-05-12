type Job = () => Promise<void>;
interface Pending { id: string; job: Job; resolve: () => void; reject: (e: unknown) => void; }

export class TranscriptionQueue {
  private q: Pending[] = [];
  private running = false;

  enqueue(id: string, job: Job): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.q.push({ id, job, resolve, reject });
      void this.tick();
    });
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    while (this.q.length) {
      const next = this.q.shift()!;
      try { await next.job(); next.resolve(); }
      catch (e) { next.reject(e); }
    }
    this.running = false;
  }
}
