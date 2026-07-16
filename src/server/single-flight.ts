/** Coalesces concurrent work by key and always clears completed operations. */
export class SingleFlight<TKey, TValue> {
  private readonly active = new Map<TKey, Promise<TValue>>();

  run(key: TKey, operation: () => Promise<TValue>): Promise<TValue> {
    const running = this.active.get(key);
    if (running) return running;

    const pending = Promise.resolve().then(operation);
    this.active.set(key, pending);
    void pending.finally(() => {
      if (this.active.get(key) === pending) this.active.delete(key);
    }).catch(() => undefined);
    return pending;
  }
}
