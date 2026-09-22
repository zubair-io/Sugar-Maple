/** Serialize autosave and explicit save so an older write cannot finish last. */
export class PersistenceQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(write: () => Promise<T>): Promise<T> {
    const next = this.tail.catch(() => undefined).then(write);
    this.tail = next;
    return next;
  }
  async idle() {
    await this.tail.catch(() => undefined);
  }
}
