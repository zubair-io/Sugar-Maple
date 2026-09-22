/** Browser-only checkpoint store. Resolve writes only after the IndexedDB transaction commits. */
export class RecoveryStore {
  private database: Promise<IDBDatabase>;
  constructor() {
    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open('sugar-maple', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('checkpoints');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(Error('Close other Sugar Maple tabs to upgrade recovery storage'));
    });
  }
  async read(): Promise<any> {
    const db = await this.database;
    return new Promise((resolve, reject) => {
      const request = db.transaction('checkpoints').objectStore('checkpoints').get('active');
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }
  async write(value: { document: { id: string } }): Promise<void> {
    const db = await this.database;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('checkpoints', 'readwrite', { durability: 'strict' });
      const store = transaction.objectStore('checkpoints');
      store.put(value, 'document:' + value.document.id);
      store.put(value, 'active');
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? Error('Recovery write aborted'));
      transaction.onerror = () => reject(transaction.error);
    });
  }
}
