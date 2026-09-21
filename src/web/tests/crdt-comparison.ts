import * as A from '@automerge/automerge';
import * as Y from 'yjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const fixture = Array.from({ length: 1000 }, (_, i) => ({
  id: String(i),
  x: i,
  y: 0,
  text: 'Node ' + i,
}));
const results: any = {
  fixture: '1000 nodes, independent x/y edits, concurrent merge, binary save/load',
  runtime: process.version,
};
let time = performance.now();
let a = A.from({ nodes: fixture });
const ar = A.clone(a);
a = A.change(a, (d) => {
  d.nodes[0].x = 22;
});
const ar2 = A.change(ar, (d) => {
  d.nodes[0].y = 33;
});
a = A.merge(a, ar2);
const as = A.save(a);
const loaded = A.load<any>(as);
if (loaded.nodes[0].x !== 22 || loaded.nodes[0].y !== 33)
  throw Error('Automerge convergence/recovery failed');
results.automerge = {
  milliseconds: performance.now() - time,
  bytes: as.length,
  convergence: true,
  recovery: true,
};
time = performance.now();
const y = new Y.Doc();
const nodes = y.getMap<Y.Map<any>>('nodes');
for (const n of fixture) nodes.set(n.id, new Y.Map(Object.entries(n)));
const yr = new Y.Doc();
Y.applyUpdate(yr, Y.encodeStateAsUpdate(y));
nodes.get('0')!.set('x', 22);
yr.getMap<Y.Map<any>>('nodes').get('0')!.set('y', 33);
Y.applyUpdate(y, Y.encodeStateAsUpdate(yr));
const ys = Y.encodeStateAsUpdate(y);
const yl = new Y.Doc();
Y.applyUpdate(yl, ys);
if (
  yl.getMap<Y.Map<any>>('nodes').get('0')!.get('x') !== 22 ||
  yl.getMap<Y.Map<any>>('nodes').get('0')!.get('y') !== 33
)
  throw Error('Yjs convergence/recovery failed');
results.yjs = {
  milliseconds: performance.now() - time,
  bytes: ys.length,
  convergence: true,
  recovery: true,
};
mkdirSync('build/evidence', { recursive: true });
writeFileSync('build/evidence/crdt-comparison.json', JSON.stringify(results, null, 2));
console.log(results);
