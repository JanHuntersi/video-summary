type Job = () => Promise<void>;

export interface QueueItem {
  videoId: string;
  title: string;
  status: 'queued' | 'running';
  addedAt: string;
}

interface Pending {
  id: string;
  title: string;
  job: Job;
  addedAt: string;
  status: 'queued' | 'running';
  resolve: () => void;
  reject: (e: unknown) => void;
}

export class TranscriptionQueue {
  private q: Pending[] = [];
  private running = false;
  private listeners = new Set<() => void>();

  enqueue(id: string, title: string, job: Job): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.q.push({
        id,
        title,
        job,
        addedAt: new Date().toISOString(),
        status: 'queued',
        resolve,
        reject
      });
      this.emit();
      void this.tick();
    });
  }

  getState(): QueueItem[] {
    return this.q.map(p => ({
      videoId: p.id,
      title: p.title,
      status: p.status,
      addedAt: p.addedAt
    }));
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit() {
    for (const cb of this.listeners) {
      try { cb(); } catch { /* ignore */ }
    }
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    while (this.q.length) {
      const next = this.q[0];
      next.status = 'running';
      this.emit();
      try {
        await next.job();
        this.q.shift();
        this.emit();
        next.resolve();
      } catch (e) {
        this.q.shift();
        this.emit();
        next.reject(e);
      }
    }
    this.running = false;
  }
}
