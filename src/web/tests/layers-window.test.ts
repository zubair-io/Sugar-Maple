import { test, expect } from 'bun:test';
import { layerWindow } from '../src/app/layers-window';
import { layerRows } from '../src/app/model/layers';

test('10,000 layers keep the viewport, keyboard destination and focused control mounted without mounting the whole tree', () => {
  const middle = layerWindow(10000, 180000, 720, [0, 9999]);
  expect(middle).toContain(0);
  expect(middle).toContain(9999);
  expect(middle).toContain(5000);
  expect(middle).toContain(5019);
  expect(middle.length).toBeLessThanOrEqual(38);
  expect(new Set(middle).size).toBe(middle.length);
  expect(layerWindow(10000, 359280, 720, [0, 9999])).toContain(9999);
  expect(layerWindow(0, 0, 720, [-1, 10])).toEqual([]);
  // A filtered tree uses its own small extent and ignores obsolete focus pins.
  expect(layerWindow(2, 0, 720, [9999])).toEqual([0, 1]);
});

test('virtual tree accessibility reports full sibling counts and search-context positions', () => {
  const nodes = [
    { id: 'root', parentId: null, name: 'Root' },
    { id: 'first', parentId: 'root', name: 'Other' },
    { id: 'second', parentId: 'root', name: 'Needle' },
    { id: 'third', parentId: 'root', name: 'Needle child' },
    { id: 'other-root', parentId: null, name: 'Other root' },
  ];
  const all = layerRows(nodes, '');
  expect(all.find(row => row.node.id === 'root')).toMatchObject({ depth: 0, position: 1, size: 2 });
  expect(all.find(row => row.node.id === 'second')).toMatchObject({ depth: 1, position: 2, size: 3 });
  const filtered = layerRows(nodes, 'needle');
  expect(filtered.map(row => [row.node.id, row.position, row.size])).toEqual([
    ['root', 1, 1], ['second', 1, 2], ['third', 2, 2],
  ]);
});
