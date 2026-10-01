import { test, expect } from 'bun:test';
import { PreviewFeed } from '../src/app/model/preview-snapshot';
import fixture from '../../../tools/preview-fixture';
test('read-only feed keeps stable identity, monotonic revisions and exact authored values', () => {
  const feed = new PreviewFeed();
  const first = feed.accept(fixture)!;
  expect(first.document).toEqual(fixture.document);
  expect(feed.accept(fixture)).toBeNull();
  expect(feed.accept({...fixture, revision:1})).not.toBeNull();
  expect(feed.accept(fixture)).toBeNull();
  expect(() => feed.accept({...fixture, documentId:'another', revision:2})).toThrow('Document changed');
  expect(() => feed.accept({...fixture, rootId:'welcome', revision:2})).toThrow('Document changed');
  expect(feed.current?.revision).toBe(1);
});
test('read-only feed rejects executable/external content, malformed envelopes and deleted roots', () => {
  expect(() => new PreviewFeed().accept({...fixture, version:2})).toThrow();
  expect(() => new PreviewFeed().accept({...fixture, revision:-1})).toThrow();
  expect(() => new PreviewFeed().accept({...fixture, command:'file.open'})).toThrow();
  expect(() => new PreviewFeed().accept({...fixture, documentId:'wrong'})).toThrow('identity');
  const doc = structuredClone(fixture.document);
  doc.nodes[1].kind = 'image'; doc.nodes[1].asset = 'https://example.test/remote.png';
  expect(() => new PreviewFeed().accept({...fixture, document:doc})).toThrow();
  expect(() => new PreviewFeed().accept({...fixture, rootId:'missing'})).toThrow('artboard');
});
