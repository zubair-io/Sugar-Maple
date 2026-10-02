import { expect, test } from 'bun:test';
import { libraryFixture } from '../../../tools/library-fixture';
import { libraryAppearance } from '../src/app/model/library-appearance';
import { mappedSwiftExport, mappedWebExport } from '../src/app/model/library-export';
const tx = (store: ReturnType<typeof libraryFixture>, operations: any[]) =>
  store.transact({
    documentId: store.document.id,
    expectedRevision: store.revision,
    requestId: crypto.randomUUID(),
    operations,
  });
const appearance = (store: ReturnType<typeof libraryFixture>, id = 'button') =>
  libraryAppearance(
    store.document,
    store.document.nodes.find((n) => n.id === id)!,
  );

test('read-only appearance guidance distinguishes semantic paint, source variants and actual copy support', () => {
  const store = libraryFixture(),
    before = store.checkpoint();
  const initial = appearance(store)!;
  expect(initial.source).toBe('Web Awesome Button · Default');
  expect(initial.web.available).toBe(true);
  expect(initial.swift.available).toBe(true);
  expect(initial.native).toEqual([]);
  expect(initial.appearance).toEqual([
    { name: 'variant', value: 'neutral' },
    { name: 'appearance', value: 'accent' },
  ]);
  expect(store.checkpoint()).toEqual(before);
  const authored = store.document.nodes.find((n) => n.id === 'button')!;
  tx(store, [{ type: 'library.props', id: 'button', props: {}, variant: 'Primary' }]);
  const checkpoint = store.checkpoint(),
    primary = appearance(store)!;
  expect(primary.source).toBe('Web Awesome Button · Primary');
  expect(primary.appearance[0].value).toBe('brand');
  expect(primary.web.available).toBe(true);
  expect(primary.swift.available).toBe(false);
  expect(primary.native).toEqual([
    'native Button variant Primary is unsupported; use the semantic preview or a supported variant',
  ]);
  expect(() => mappedSwiftExport(store.document, 'button')).toThrow(
    /Unsupported native platform\/variant/,
  );
  const updated = store.document.nodes.find((n) => n.id === 'button')!;
  for (const field of ['fill', 'color', 'stroke', 'radius'] as const)
    expect(updated[field]).toBe(authored[field]);
  expect(store.checkpoint()).toEqual(checkpoint);
  store.undo();
  expect(appearance(store)!.swift.available).toBe(true);
});
test('library-only properties and local semantic overrides report target-specific limits instead of implying parity', () => {
  const store = libraryFixture();
  tx(store, [{ type: 'library.props', id: 'button', props: { appearance: 'outlined' } }]);
  expect(appearance(store)!.native).toEqual([
    'native Button property appearance is unsupported; use semantic preview',
  ]);
  expect(appearance(store)!.swift.available).toBe(false);
  expect(appearance(store)!.web.available).toBe(true);
  tx(store, [
    { type: 'library.reset', id: 'button' },
    { type: 'node.update', id: 'button', patch: { color: '#ffff00' } },
  ]);
  const support = appearance(store)!;
  expect(support.web.available).toBe(false);
  expect(support.web.message).toContain('Unsupported mapped library style override: color');
  expect(() => mappedWebExport(store.document, 'button')).toThrow(/style override: color/);
  expect(support.swift.available).toBe(true);
  expect(support.native).toEqual([]);
  tx(store, [{ type: 'node.update', id: 'input', patch: { fill: '#763cba', radius: 7 } }]);
  expect(appearance(store, 'input')!.native).toEqual([
    'native Input style fill is unsupported; use semantic preview',
    'native Input style radius is unsupported; use semantic preview',
  ]);
});
test('imported metadata and missing bindings cannot advertise an executable trusted preview', () => {
  const store = libraryFixture();
  const doc = structuredClone(store.document),
    node = doc.nodes.find((n) => n.id === 'button')!;
  doc.libraries[node.libraryRef!.key].name = 'Imported metadata';
  expect(libraryAppearance(doc, node)!.native).toEqual([
    'This library is metadata only. The native preview experiment supports the bundled Web Awesome mapping.',
  ]);
  delete doc.libraries[node.libraryRef!.key];
  expect(libraryAppearance(doc, node)).toBeNull();
  expect(appearance(store, 'header')).toBeNull();
});
