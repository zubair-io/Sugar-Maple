import { DocumentStore } from '../src/app/model/store';
import { exportNode } from '../src/app/model/export';
import { uid } from '../src/app/model/schema';
import { mkdirSync, writeFileSync } from 'node:fs';
const s = new DocumentStore(),
  pageId = s.document.pages[0].id,
  frame = uid();
s.transact({
  documentId: s.document.id,
  expectedRevision: 0,
  requestId: uid(),
  operations: [
    {
      type: 'node.add',
      node: {
        id: frame,
        kind: 'artboard',
        pageId,
        name: 'Sign in',
        layout: 'vertical',
        width: 393,
        height: 852,
      },
    },
    {
      type: 'node.add',
      node: { kind: 'text', pageId, parentId: frame, text: 'Welcome to Sugar Maple' },
    },
    { type: 'node.add', node: { kind: 'input', pageId, parentId: frame, text: 'Email address' } },
    { type: 'node.add', node: { kind: 'button', pageId, parentId: frame, text: 'Continue' } },
  ],
});
mkdirSync('build/evidence', { recursive: true });
writeFileSync('build/evidence/ExportFixture.swift', exportNode(s.document, frame, 'swiftui'));
writeFileSync(
  'build/evidence/export-fixture.html',
  '<!doctype html><meta charset="utf-8">' + exportNode(s.document, frame, 'html'),
);
console.log('Generated portable consumer fixtures');
