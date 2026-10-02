import { test, expect } from 'bun:test';
import { importedRepeatFixture, transaction } from '../../../tools/repeat-fixture';
import { repeatCells } from '../src/app/model/repeat';
import {
  repeatSize,
  repeatOperation,
  repeatPreviewNodes,
  resizeRepeat,
  repeatLimit,
} from '../src/app/canvas/repeat-geometry';
import { project, flatten, transform } from '../src/app/canvas/scene-layout';
import { OperationSchema } from '../src/app/model/schema';

test('repeat handle preview derives temporary cells, matches the committed geometry and retains local data in one undo', () => {
  const { store, grid } = importedRepeatFixture(),
    before = store.checkpoint(),
    n = store.document.nodes.find((n) => n.id === grid)!;
  const original = repeatSize(store.document, n),
    grown = { ...original, rows: 2, columns: 3, gap: 27, namespace: 'test' };
  const nodes = repeatPreviewNodes(store.document, grown);
  expect(repeatCells({ ...store.document, nodes }, grid)).toHaveLength(6);
  expect(store.checkpoint()).toEqual(before);
  expect(
    repeatCells({ ...store.document, nodes }, grid)
      .slice(0, 2)
      .map((n) => n.id),
  ).toEqual(repeatCells(store.document, grid).map((n) => n.id));
  expect(nodes.find((n) => n.id === 'title')!.text).toBe('First');
  expect(repeatPreviewNodes(store.document, grown)).toEqual(nodes);
  const operation = OperationSchema.parse(repeatOperation(grown));
  store.transact(transaction(store, [operation]));
  const after = store.document.nodes.find((n) => n.id === grid)!;
  const preview = nodes.find((n) => n.id === grid)!;
  for (const key of ['x', 'y', 'width', 'height', 'gap', 'columns'] as const)
    expect(after[key]).toBe(preview[key]);
  expect(store.document.nodes.find((n) => n.id === 'title')!.text).toBe('First');
  expect(store.checkpoint().journal.length).toBe(before.journal.length + 1);
  expect(store.document.nodes.some((n) => n.id.startsWith('repeat-draft-'))).toBe(false);
  store.undo();
  expect(store.document).toEqual(before.document);
});

test('counts/gutters honor cell and extent limits without allowing malformed resize mutation', () => {
  const { store, grid } = importedRepeatFixture(),
    n = store.document.nodes.find((n) => n.id === grid)!;
  const size = repeatSize(store.document, n);
  expect(resizeRepeat(store.document, n, size, 'columns', 100000).columns).toBe(20);
  expect(resizeRepeat(store.document, n, size, 'rows', 100000).rows).toBe(
    repeatLimit(store.document, n, size, 'rows'),
  );
  expect(resizeRepeat(store.document, n, size, 'columns', -100000).columns).toBe(1);
  expect(resizeRepeat(store.document, n, size, 'gap', -100000).gap).toBe(0);
  expect(resizeRepeat(store.document, n, size, 'gap', 100000).gap).toBe(
    repeatLimit(store.document, n, size, 'gap'),
  );
  const before = store.checkpoint();
  for (const gap of [-1, 1001, NaN, Infinity])
    expect(() =>
      store.transact(
        transaction(store, [{ type: 'repeat.resize', id: grid, rows: 1, columns: 2, gap }]),
      ),
    ).toThrow();
  expect(() =>
    store.transact(
      transaction(store, [{ type: 'repeat.resize', id: grid, rows: 100, columns: 2 }]),
    ),
  ).toThrow('100 cells');
  expect(store.checkpoint()).toEqual(before);
});

test('rotated nested grids keep their world top-left anchor and include both borders in the resized extent', () => {
  const { store, grid } = importedRepeatFixture();
  store.transact(
    transaction(store, [
      { type: 'node.update', id: 'board', patch: { rotation: 17 } },
      { type: 'node.update', id: grid, patch: { rotation: 31, strokeWidth: 3, padding: 4 } },
    ]),
  );
  const item = flatten(project(store.document, store.document.pages[0].id)).find(
    (i) => i.node.id === grid,
  )!;
  const origin = transform(item.transform, item.x, item.y),
    n = item.node;
  store.transact(
    transaction(store, [
      repeatOperation({ ...repeatSize(store.document, n), rows: 2, columns: 3, gap: 20 }),
    ]),
  );
  const next = flatten(project(store.document, store.document.pages[0].id)).find(
    (i) => i.node.id === grid,
  )!;
  const actual = transform(next.transform, next.x, next.y);
  expect(actual.x).toBeCloseTo(origin.x, 8);
  expect(actual.y).toBeCloseTo(origin.y, 8);
  expect(next.width).toBe(3 * 200 + 2 * 20 + 14);
  expect(next.height).toBe(2 * 220 + 20 + 14);
  const cell = next.children.filter((i) => i.node.repeatIndex !== null).at(-1)!;
  expect(cell.x + cell.width).toBeCloseTo(next.x + next.width - 7, 8);
  expect(cell.y + cell.height).toBeCloseTo(next.y + next.height - 7, 8);
});

test('a gutter edit preserves a partial last row and rejects inconsistent partial counts atomically', () => {
  const { store, grid } = importedRepeatFixture();
  store.transact(
    transaction(store, [{ type: 'repeat.resize', id: grid, rows: 2, columns: 3, count: 5 }]),
  );
  const before = store.checkpoint(),
    n = store.document.nodes.find((n) => n.id === grid)!,
    size = { ...repeatSize(store.document, n), gap: 35 };
  const preview = repeatPreviewNodes(store.document, {
    ...size,
    namespace: 'ragged',
    preserveCount: true,
  });
  expect(repeatCells({ ...store.document, nodes: preview }, grid)).toHaveLength(5);
  store.transact(transaction(store, [repeatOperation(size, true)]));
  expect(repeatCells(store.document, grid).map((n) => n.id)).toEqual(
    repeatCells(before.document, grid).map((n) => n.id),
  );
  store.undo();
  expect(store.document).toEqual(before.document);
  expect(() =>
    store.transact(
      transaction(store, [{ type: 'repeat.resize', id: grid, rows: 3, columns: 3, count: 5 }]),
    ),
  ).toThrow('last row');
  expect(store.document).toEqual(before.document);
});

test('deleting a grid during preview safely discards the stale projection', () => {
  const { store, grid } = importedRepeatFixture();
  const n = store.document.nodes.find((n) => n.id === grid)!;
  const draft = { ...repeatSize(store.document, n), columns: 3, namespace: 'stale' };
  store.transact(transaction(store, [{ type: 'node.remove', id: grid }]));
  const before = store.checkpoint();
  expect(repeatPreviewNodes(store.document, draft)).toEqual(store.document.nodes);
  expect(store.checkpoint()).toEqual(before);
});
