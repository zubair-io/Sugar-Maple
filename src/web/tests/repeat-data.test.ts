import { test, expect } from 'bun:test';
import { DocumentStore } from '../src/app/model/store';
import { repeatCells, repeatTargets } from '../src/app/model/repeat';
import { parseRepeatData, repeatImportOperations } from '../src/app/model/repeat-data';
import { assetSource, embeddedAsset } from '../src/app/model/assets';
import { editablePayload, pasteElements } from '../src/app/model/clipboard';
import { exportNode } from '../src/app/model/export';
import { readScope } from '../src/app/model/scoped-read';
import { validateDocument } from '../src/app/model/schema';
import {
  importedRepeatFixture,
  repeatFixture,
  transaction,
  pixel,
} from '../../../tools/repeat-fixture';

test('CSV quoting and named JSON rows have explicit missing, duplicate, type and size rules', () => {
  expect(
    parseRepeatData('\uFEFFtitle,photo\r\n"First,\nname",a.png\r\n"A ""quote""",b.png\r\n', 'csv')
      .rows,
  ).toEqual([
    { title: 'First,\nname', photo: 'a.png' },
    { title: 'A "quote"', photo: 'b.png' },
  ]);
  expect(parseRepeatData('[{"title":"One"},{"photo":"two.png"}]', 'json').fields).toEqual([
    'title',
    'photo',
  ]);
  for (const text of [
    '',
    'title\n',
    'title,title\nA,B',
    'title,photo\nA',
    'title\n"A"bad',
    'title\n"A',
    'title\nA"B',
  ])
    expect(() => parseRepeatData(text, 'csv')).toThrow();
  for (const text of ['{}', '[]', '[null]', '[{"title":1}]', '[{"__proto__":"x"}]'])
    expect(() => parseRepeatData(text, 'json')).toThrow();
  expect(() => parseRepeatData('a\n' + 'x'.repeat(1_000_001), 'csv')).toThrow('1 MB');
  expect(() => parseRepeatData('a\n' + 'x\n'.repeat(1001), 'csv')).toThrow('1,000');
});
test('separate template preserves cell data and stable IDs through edits, row-major resize and undo', () => {
  const { store, grid, cells } = importedRepeatFixture();
  const before = store.checkpoint();
  const template = store.document.nodes.find(
    (n) => n.id === store.document.nodes.find((n) => n.id === grid)!.repeatTemplateId,
  )!;
  expect(template.hidden).toBe(true);
  expect(template.repeatIndex).toBeNull();
  expect(cells[0].id).toBe('card');
  const title = repeatTargets(store.document, grid).find((t) => t.name === 'Title')!;
  store.transact(
    transaction(store, [
      { type: 'node.update', id: title.id, patch: { text: 'Template changed', color: '#123456' } },
    ]),
  );
  const authored = store.document.nodes.filter((n) => n.componentId === title.id);
  expect(authored.map((n) => n.text)).toEqual(['First', 'Second']);
  expect(authored.every((n) => n.color === '#123456')).toBe(true);
  store.transact(transaction(store, [{ type: 'repeat.resize', id: grid, rows: 2, columns: 2 }]));
  expect(
    repeatCells(store.document, grid)
      .slice(0, 2)
      .map((n) => n.id),
  ).toEqual(cells.map((n) => n.id));
  const newTitle = store.document.nodes.find(
    (n) => n.parentId === repeatCells(store.document, grid)[2].id && n.componentId === title.id,
  )!;
  expect(newTitle.text).toBe('Template changed');
  store.transact(transaction(store, [{ type: 'repeat.resize', id: grid, rows: 1, columns: 1 }]));
  expect(repeatCells(store.document, grid).map((n) => n.id)).toEqual([cells[0].id]);
  expect(DocumentStore.fromCheckpoint(store.checkpoint()).document).toEqual(store.document);
  store.undo();
  expect(repeatCells(store.document, grid).length).toBe(4);
  expect(DocumentStore.fromCheckpoint(store.checkpoint()).document).toEqual(store.document);
  store.undo();
  store.undo();
  expect(store.document).toEqual(before.document);
});
test('named imports apply once and invalid mappings, missing images and overflow preserve complete history', () => {
  const { store, grid } = repeatFixture();
  const target = repeatTargets(store.document, grid).find((t) => t.name === 'Title')!;
  const fields = [{ field: 'title', targetId: target.id, property: 'text' as const }];
  const base = {
    type: 'repeat.import' as const,
    id: grid,
    rows: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }],
    fields,
    missing: 'retain' as const,
    truncate: false,
  };
  const before = store.checkpoint();
  for (const op of [
    base,
    { ...base, rows: [{ title: 'One' }], fields: [{ ...fields[0], field: 'unknown' }] },
    { ...base, rows: [{ title: '' }], missing: 'error' as const },
    { ...base, rows: [{ title: 'One' }], fields: [fields[0], fields[0]] },
    { ...base, rows: [{ title: 'One' }], fields: [{ ...fields[0], targetId: 'missing' }] },
  ]) {
    expect(() => store.transact(transaction(store, [op]))).toThrow();
    expect(store.checkpoint()).toEqual(before);
  }
  store.transact(transaction(store, [{ ...base, truncate: true }]));
  expect(
    store.document.nodes.filter((n) => n.componentId === target.id).map((n) => n.text),
  ).toEqual(['One', 'Two']);
  store.undo();
  expect(store.document).toEqual(before.document);
  const image = repeatTargets(store.document, grid).find((t) => t.property === 'asset')!;
  expect(() =>
    repeatImportOperations(
      grid,
      parseRepeatData('photo\nmissing.png', 'csv'),
      [{ field: 'photo', targetId: image.id, property: 'asset' }],
      {},
      'error',
      false,
    ),
  ).toThrow('local image');
  expect(() =>
    repeatImportOperations(
      grid,
      parseRepeatData('photo\n../a.png', 'csv'),
      [{ field: 'photo', targetId: image.id, property: 'asset' }],
      { '../a.png': pixel },
      'error',
      false,
    ),
  ).toThrow('local image');
});
test('empty and absent fields retain or clear values; untouched trailing cells keep data', () => {
  const { store, grid } = importedRepeatFixture();
  const target = repeatTargets(store.document, grid).find((t) => t.name === 'Title')!;
  const op = {
    type: 'repeat.import' as const,
    id: grid,
    rows: [{ title: '' }],
    fields: [{ field: 'title', targetId: target.id, property: 'text' as const }],
    missing: 'retain' as const,
    truncate: false,
  };
  store.transact(transaction(store, [op]));
  expect(
    store.document.nodes.filter((n) => n.componentId === target.id).map((n) => n.text),
  ).toEqual(['First', 'Second']);
  store.transact(transaction(store, [{ ...op, missing: 'clear' }]));
  expect(
    store.document.nodes.filter((n) => n.componentId === target.id).map((n) => n.text),
  ).toEqual(['', 'Second']);
});
test('image content addresses deduplicate, reject forged bytes and survive recovery, paste and all exports', () => {
  const { store, grid } = importedRepeatFixture();
  const asset = embeddedAsset(pixel);
  expect(Object.keys(store.document.assets)).toEqual([asset.key]);
  const images = store.document.nodes.filter((n) => n.kind === 'image' && n.asset);
  expect(images).toHaveLength(2);
  expect(images.every((n) => n.asset === asset.reference)).toBe(true);
  expect(assetSource(store.document, images[0].asset)).toBe(pixel);
  const checkpoint = store.checkpoint(),
    reopened = DocumentStore.fromCheckpoint(checkpoint);
  expect(reopened.document).toEqual(store.document);
  reopened.undo();
  expect(Object.keys(reopened.document.assets)).toHaveLength(0);
  reopened.redo();
  expect(reopened.document).toEqual(store.document);
  const target = new DocumentStore(),
    paste = pasteElements(
      target.document,
      target.document.pages[0].id,
      JSON.stringify(editablePayload(store.document, grid)),
    );
  target.transact(transaction(target, paste.operations));
  expect(target.document.assets).toEqual(store.document.assets);
  expect(repeatCells(target.document, paste.rootId)).toHaveLength(2);
  for (const output of ['html', 'angular', 'tailwind', 'svg'] as const) {
    const code = exportNode(target.document, paste.rootId, output);
    expect(code).toContain(pixel);
    expect(code).not.toContain('asset:sha256');
    expect(exportNode(target.document, paste.rootId, output)).toBe(code);
  }
  expect(exportNode(target.document, paste.rootId, 'swiftui')).toContain(pixel.split(',')[1]);
  const scope = readScope(
    store.document,
    store.revision,
    {
      scope: 'subtree',
      nodeId: grid,
      documentId: store.document.id,
      expectedRevision: store.revision,
      offset: 0,
      limit: 500,
    },
    [],
  );
  expect(scope.references.assets).toEqual(store.document.assets);
  const before = store.checkpoint();
  expect(() =>
    store.transact(
      transaction(store, [
        { type: 'asset.set', key: asset.key, source: pixel.replace('AAAA', 'AAAB') },
      ]),
    ),
  ).toThrow();
  expect(store.checkpoint()).toEqual(before);
  expect(() => validateDocument({ ...store.document, assets: {} })).toThrow('Missing embedded');
});
test('legacy first-cell template upgrades inside the import without changing surviving IDs or prior history', () => {
  const { store, grid } = repeatFixture(),
    legacy = structuredClone(store.document),
    root = legacy.nodes.find((n) => n.id === grid)!;
  const template = root.repeatTemplateId!,
    sourceNodes = legacy.nodes.filter((n) => n.id === template || n.parentId === template);
  const map = new Map(
    sourceNodes.map((n) => [
      n.id,
      legacy.nodes.find(
        (v) => v.componentId === n.id && (v.id === 'card' || v.parentId === 'card'),
      )!.id,
    ]),
  );
  legacy.nodes = legacy.nodes.filter((n) => !sourceNodes.includes(n));
  root.repeatTemplateId = 'card';
  for (const n of legacy.nodes) {
    if (n.componentId && map.has(n.componentId))
      n.componentId = n.id === map.get(n.componentId) ? null : map.get(n.componentId)!;
  }
  const old = new DocumentStore(legacy),
    cells = repeatCells(old.document, grid).map((n) => n.id),
    before = old.checkpoint();
  const target = repeatTargets(old.document, grid).find((t) => t.name === 'Title')!;
  old.transact(
    transaction(old, [
      {
        type: 'repeat.import',
        id: grid,
        rows: [{ title: 'Imported' }],
        fields: [{ field: 'title', targetId: target.id, property: 'text' }],
        missing: 'retain',
        truncate: false,
      },
    ]),
  );
  expect(repeatCells(old.document, grid).map((n) => n.id)).toEqual(cells);
  expect(old.document.nodes.find((n) => n.id === 'title')!.text).toBe('Imported');
  old.undo();
  expect(old.document).toEqual(before.document);
});
