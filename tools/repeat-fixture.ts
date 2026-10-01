import { DocumentStore } from '../src/web/src/app/model/store';
import { repeatCells, repeatTargets } from '../src/web/src/app/model/repeat';
import {
  parseRepeatData,
  repeatImportOperations,
} from '../src/web/src/app/model/repeat-data';
import type { Operation } from '../src/web/src/app/model/schema';
export const pixel =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
export function transaction(store: DocumentStore, operations: Operation[]) {
  return {
    documentId: store.document.id,
    expectedRevision: store.revision,
    requestId: crypto.randomUUID(),
    operations,
  };
}
export function repeatFixture() {
  const store = new DocumentStore(),
    pageId = store.document.pages[0].id;
  store.transact(
    transaction(store, [
      {
        type: 'node.add',
        node: {
          id: 'board',
          kind: 'artboard',
          pageId,
          name: 'People',
          width: 800,
          height: 700,
        },
      },
      {
        type: 'node.add',
        node: {
          id: 'card',
          parentId: 'board',
          kind: 'frame',
          pageId,
          name: 'Person card',
          x: 20,
          y: 20,
          width: 200,
          height: 220,
          layout: 'vertical',
          padding: 8,
          gap: 8,
        },
      },
      {
        type: 'node.add',
        node: {
          id: 'title',
          parentId: 'card',
          kind: 'text',
          pageId,
          name: 'Title',
          text: 'Template title',
          width: 180,
          height: 35,
        },
      },
      {
        type: 'node.add',
        node: {
          id: 'photo',
          parentId: 'card',
          kind: 'image',
          pageId,
          name: 'Photo',
          width: 100,
          height: 80,
        },
      },
      {
        type: 'node.add',
        node: {
          id: 'email',
          parentId: 'card',
          kind: 'input',
          pageId,
          name: 'Email',
          accessibleLabel: 'Person email',
          initialValue: 'template@example.test',
          width: 180,
          height: 44,
        },
      },
    ]),
  );
  const grid = store.transact(
    transaction(store, [
      { type: 'repeat.create', id: 'card', count: 2, columns: 2 },
    ]),
  ).ids[0];
  return { store, grid };
}
export function importedRepeatFixture() {
  const { store, grid } = repeatFixture();
  const targets = repeatTargets(store.document, grid);
  const fields = targets
    .filter((t) => t.property !== 'text' || t.name === 'Title')
    .map((t) => ({
      targetId: t.id,
      property: t.property,
      field: t.name.toLowerCase(),
    }));
  const data = parseRepeatData(
    'title,photo,email\nFirst,pixel.png,first@example.test\nSecond,pixel.png,second@example.test',
    'csv',
  );
  store.transact(
    transaction(
      store,
      repeatImportOperations(
        grid,
        data,
        fields,
        { 'pixel.png': pixel },
        'error',
        false,
      ),
    ),
  );
  return { store, grid, cells: repeatCells(store.document, grid) };
}
if (import.meta.main) {
  const destination = process.argv[2];
  if (!destination) throw Error('Pass an owned output file');
  const { store, grid } = importedRepeatFixture();
  await Bun.write(
    destination,
    JSON.stringify({ checkpoint: store.checkpoint(), grid }),
  );
}
