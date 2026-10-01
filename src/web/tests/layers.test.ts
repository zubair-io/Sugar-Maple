import { test, expect } from 'bun:test';
import { layerRows } from '../src/app/model/layers';

test('layer search retains ancestor context, authored sibling order and original nodes', () => {
  const nodes = [
    { id: 'child', parentId: 'root', name: 'Needle', hidden: true },
    { id: 'root', parentId: null, name: 'Frame', hidden: false },
    { id: 'other', parentId: 'root', name: 'Other', hidden: false },
    { id: 'nested', parentId: 'child', name: 'Needle detail', hidden: false },
    { id: 'second', parentId: null, name: 'Other root', hidden: false },
  ];
  expect(layerRows(nodes, '').map(r => [r.node.id, r.depth])).toEqual([
    ['root', 0], ['child', 1], ['nested', 2], ['other', 1], ['second', 0],
  ]);
  const filtered = layerRows(nodes, '  NEEDLE  ');
  expect(filtered.map(r => [r.node.id, r.depth])).toEqual([
    ['root', 0], ['child', 1], ['nested', 2],
  ]);
  expect(filtered[1].node).toBe(nodes[0]);
  expect(layerRows(nodes, 'Frame').map(r => r.node.id)).toEqual(['root']);
  expect(layerRows(nodes, 'absent')).toEqual([]);
  expect(layerRows([], '')).toEqual([]);
});

test('large layer trees and broad matching searches use bounded linear node reads', () => {
  let reads = 0;
  const nodes: { id: string; parentId: string | null; name: string }[] = [];
  for (let group = 0; group < 100; group++) {
    const root = 'group-' + group;
    for (let child = -1; child < 50; child++) nodes.push(new Proxy({
      id: child < 0 ? root : root + '-' + child,
      parentId: child < 0 ? null : root,
      name: 'Match ' + child,
    }, { get(target, key, receiver) { reads++; return Reflect.get(target, key, receiver); } }));
  }
  expect(layerRows(nodes, '').length).toBe(5100);
  expect(layerRows(nodes, 'match').length).toBe(5100);
  expect(reads).toBeLessThan(nodes.length * 20);
});
