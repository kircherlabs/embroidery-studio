// Keep one reusable worker while idle, replace obsolete synchronous work rather
// than queueing expensive designs behind it. App generation IDs remain authoritative.
export class LatestGenerationWorker {
  constructor(create) {
    this.create = create;
    this.start();
  }
  start() {
    const w = (this.worker = this.create());
    w.onmessage = (e) => {
      if (w !== this.worker || e.data.id !== this.id) return;
      this.busy = false;
      this.onmessage?.(e);
    };
    w.onerror = (e) => {
      if (w !== this.worker) return;
      this.busy = false;
      this.onerror?.(e);
    };
  }
  postMessage(data) {
    if (this.busy) {
      this.worker.terminate();
      this.start();
    }
    this.id = data.id;
    this.busy = true;
    this.worker.postMessage(data);
  }
  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.busy = false;
  }
}
