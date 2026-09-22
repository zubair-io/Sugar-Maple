import { expect, test } from 'bun:test';
import { PersistenceQueue } from '../src/app/model/persistence-queue';
test('serialized saves retain order through delay and failure', async () => {
  const queue = new PersistenceQueue();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const writes: string[] = [];
  const first = queue.run(async () => {
    await gate;
    writes.push('old');
  });
  const failed = queue.run(async () => {
    writes.push('failed');
    throw Error('Disk full');
  });
  const caught = failed.catch(() => undefined);
  const newest = queue.run(async () => {
    writes.push('new');
  });
  await Promise.resolve();
  expect(writes).toEqual([]);
  release();
  await Promise.all([first, caught, newest]);
  await queue.idle();
  expect(writes).toEqual(['old', 'failed', 'new']);
});
