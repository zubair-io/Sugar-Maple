import { exportNode } from '../src/app/model/export';
import { test, expect } from 'bun:test';
import { DocumentStore } from '../src/app/model/store';
import { validateDocument } from '../src/app/model/schema';
import { validateManifest, libraryKey } from '../src/app/model/library-schema';
import { editablePayload, pasteElements } from '../src/app/model/clipboard';
import { readScope } from '../src/app/model/scoped-read';
import { webAwesomeManifest as manifest } from '../../../tools/library-fixture';
const key = libraryKey(manifest);
function tx(store: DocumentStore, operations: unknown[]) {
  return {
    documentId: store.document.id,
    expectedRevision: store.revision,
    requestId: crypto.randomUUID(),
    operations,
  };
}
function fixture() {
  const store = new DocumentStore();
  store.transact(
    tx(store, [
      { type: 'library.import', manifest },
      {
        type: 'library.insert',
        id: 'button',
        key,
        component: 'Button',
        pageId: store.document.pages[0].id,
        x: 10,
        y: 20,
        props: { label: 'Save' },
        variant: 'Primary',
      },
    ]),
  );
  return store;
}
test('pinned manifest import validates complete typed mappings before any authoring mutation', () => {
  const store = fixture();
  expect(store.document.nodes[0].text).toBe('Save');
  expect(store.document.nodes[0].libraryRef?.variant).toBe('Primary');
  const before = store.checkpoint();
  const invalid = structuredClone(manifest);
  invalid.components.Button.web!.module = 'other-package/eval.js';
  const changed = structuredClone(manifest);
  changed.name = 'Collision';
  for (const operations of [
    [
      { type: 'document.rename', name: 'Partial' },
      { type: 'library.import', manifest: invalid },
    ],
    [{ type: 'library.import', manifest: changed }],
    [{ type: 'library.props', id: 'button', props: { disabled: 'false' } }],
    [{ type: 'library.props', id: 'button', props: { unknown: 'x' } }],
    [{ type: 'library.props', id: 'button', props: {}, variant: 'Unknown' }],
  ]) {
    expect(() => store.transact(tx(store, operations))).toThrow();
    expect(store.checkpoint()).toEqual(before);
  }
  const unsupported = structuredClone(manifest);
  unsupported.components.Input.swift!.symbol = 'Button';
  expect(() => validateManifest(unsupported)).toThrow('SwiftUI');
  const malicious = { ...manifest, execute: 'require("fs")' };
  expect(() => validateManifest(malicious)).toThrow();
});
test('library props variants and local semantic overrides survive undo and journal replay', () => {
  const store = fixture();
  store.transact(
    tx(store, [{ type: 'node.update', id: 'button', patch: { text: 'Local title' } }]),
  );
  store.transact(
    tx(store, [
      {
        type: 'library.props',
        id: 'button',
        props: { label: 'New source label' },
        variant: 'Disabled',
      },
    ]),
  );
  const node = store.document.nodes[0];
  expect(node.text).toBe('Local title');
  expect(node.disabled).toBe(true);
  expect(node.libraryRef?.localOverrides).toEqual(['text']);
  const restored = DocumentStore.fromCheckpoint(store.checkpoint());
  expect(restored.document).toEqual(store.document);
  restored.undo();
  expect(restored.document.nodes[0].disabled).toBe(false);
  restored.redo();
  expect(restored.document).toEqual(store.document);
  store.transact(tx(store, [{ type: 'library.reset', id: 'button' }]));
  expect(store.document.nodes[0].text).toBe('Button');
  expect(store.document.nodes[0].disabled).toBe(true);
  expect(store.document.nodes[0].libraryRef?.localOverrides).toEqual([]);
});
test('new versions coexist; explicit compatible remap preserves props and rejects incompatible changes atomically', () => {
  const store = fixture(),
    next = structuredClone(manifest);
  next.package.version = '3.14.1';
  next.revision = '1.0.1';
  store.transact(tx(store, [{ type: 'library.import', manifest: next }]));
  expect(store.document.nodes[0].libraryRef?.key).toBe(key);
  store.transact(tx(store, [{ type: 'library.remap', id: 'button', key: libraryKey(next) }]));
  expect(store.document.nodes[0].text).toBe('Save');
  expect(Object.keys(store.document.libraries)).toHaveLength(2);
  const broken = structuredClone(next);
  broken.package.version = '4.0.0';
  broken.revision = '2.0.0';
  delete broken.components.Button.props.label;
  const before = store.checkpoint();
  expect(() =>
    store.transact(
      tx(store, [
        { type: 'library.import', manifest: broken },
        { type: 'library.remap', id: 'button', key: libraryKey(broken) },
      ]),
    ),
  ).toThrow('property');
  expect(store.checkpoint()).toEqual(before);
  expect(() =>
    store.transact(tx(store, [{ type: 'library.remap', id: 'button', key, component: 'Input' }])),
  ).toThrow('kind');
});
test('paste carries pinned library dependencies and token aliases; missing metadata retains editable fallback', () => {
  const store = fixture();
  store.transact(tx(store, [{ type: 'token.set', name: 'brand.primary', value: '#112233' }]));
  const target = new DocumentStore();
  target.transact(tx(target, [{ type: 'token.set', name: 'brand.primary', value: '#223344' }]));
  const payload = editablePayload(store.document, 'button'),
    paste = pasteElements(target.document, target.document.pages[0].id, JSON.stringify(payload));
  target.transact(tx(target, paste.operations));
  expect(target.document.libraries).toEqual(store.document.libraries);
  expect(target.document.nodes[0].libraryRef?.tokenBindings['--wa-color-brand-fill-loud']).toBe(
    'brand.primary_copy1',
  );
  expect(target.document.tokens['brand.primary_copy1']).toBe('#112233');
  target.transact(tx(target, [{ type: 'library.reset', id: paste.rootId }]));
  expect(target.document.nodes[0].libraryRef?.tokenBindings['--wa-color-brand-fill-loud']).toBe(
    'brand.primary_copy1',
  );
  expect(exportNode(target.document, paste.rootId, 'web-library')).toContain(
    '--wa-color-brand-fill-loud:#112233',
  );
  expect(DocumentStore.fromCheckpoint(target.checkpoint()).document).toEqual(target.document);
  const missing = validateDocument({ ...store.document, libraries: {} });
  const fallback = new DocumentStore(missing);
  fallback.transact(
    tx(fallback, [{ type: 'node.update', id: 'button', patch: { text: 'Still editable' } }]),
  );
  expect(fallback.document.nodes[0].text).toBe('Still editable');
  expect(() =>
    fallback.transact(
      tx(fallback, [{ type: 'library.props', id: 'button', props: { label: 'Source' } }]),
    ),
  ).toThrow('absent');
  const collision = structuredClone(manifest);
  collision.name = 'Other';
  const occupied = new DocumentStore();
  occupied.transact(tx(occupied, [{ type: 'library.import', manifest: collision }]));
  expect(() =>
    pasteElements(occupied.document, occupied.document.pages[0].id, JSON.stringify(payload)),
  ).toThrow('collision');
});
test('slot validation and scoped reads expose exact library dependencies', () => {
  const store = fixture();
  store.transact(
    tx(store, [
      {
        type: 'library.insert',
        id: 'card',
        key,
        component: 'Card',
        pageId: store.document.pages[0].id,
        x: 0,
        y: 0,
      },
      {
        type: 'node.add',
        node: {
          id: 'header',
          pageId: store.document.pages[0].id,
          parentId: 'card',
          kind: 'text',
          name: 'Header',
          librarySlot: 'header',
        },
      },
    ]),
  );
  const before = store.checkpoint();
  expect(() =>
    store.transact(
      tx(store, [{ type: 'node.update', id: 'header', patch: { librarySlot: 'unknown' } }]),
    ),
  ).toThrow('slot');
  expect(store.checkpoint()).toEqual(before);
  const read = readScope(
    store.document,
    store.revision,
    {
      scope: 'subtree',
      nodeId: 'card',
      documentId: store.document.id,
      expectedRevision: store.revision,
      offset: 0,
      limit: 100,
    },
    [],
  );
  expect(read.references.libraries).toEqual({ [key]: manifest });
});

test('mapped output uses pinned imports and supported native symbols; unsafe attributes and unsupported styles never approximate', () => {
  const store = fixture(),
    before = store.checkpoint();
  const web = exportNode(store.document, 'button', 'web-library');
  expect(web).toContain('<wa-button');
  expect(web).toContain('@awesome.me/webawesome@3.14.0');
  expect(web).toContain('variant="brand"');
  expect(() => exportNode(store.document, 'button', 'swift-library')).toThrow('variant');
  expect(store.checkpoint()).toEqual(before);
  store.transact(
    tx(store, [{ type: 'library.props', id: 'button', props: {}, variant: 'Default' }]),
  );
  expect(exportNode(store.document, 'button', 'swift-library')).toContain('Button("Save")');
  store.transact(tx(store, [{ type: 'node.update', id: 'button', patch: { fill: '#123456' } }]));
  expect(() => exportNode(store.document, 'button', 'web-library')).toThrow('style override');
  const unsafe = structuredClone(manifest);
  unsafe.components.Button.props.disabled.webAttribute = 'onclick';
  expect(() => validateManifest(unsafe)).toThrow('web attribute');
});
