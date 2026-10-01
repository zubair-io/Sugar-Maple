import { test, expect } from 'bun:test';
import { blankDocument, NodeSchema } from '../src/app/model/schema';
import { exportNode } from '../src/app/model/export';
import { swiftWeight } from '../src/app/model/swift-export';

test('web handoff retains authored multiline text and control whitespace', () => {
  const doc = blankDocument();
  doc.nodes = [NodeSchema.parse({ id: 'heading', pageId: doc.pages[0].id, kind: 'text', name: 'Heading', text: 'A little clarity.\nA lot of progress.' })];
  for (const target of ['html', 'angular', 'tailwind'] as const) {
    const code = exportNode(doc, 'heading', target);
    expect(code).toContain(target === 'tailwind' ? '[white-space:pre-wrap]' : 'white-space:pre-wrap');
    expect(code).toContain('A little clarity.\nA lot of progress.');
  }
});

test('SwiftUI handoff preserves stack padding and control typography', () => {
  const doc = blankDocument(), pageId = doc.pages[0].id;
  doc.nodes = [
    NodeSchema.parse({ id: 'stack', pageId, kind: 'frame', name: 'Stack', layout: 'vertical', padding: 24 }),
    NodeSchema.parse({ id: 'button', pageId, parentId: 'stack', kind: 'button', name: 'Action', text: 'Continue', fontSize: 21, fontWeight: 700 }),
    NodeSchema.parse({ id: 'field', pageId, parentId: 'stack', kind: 'input', name: 'Email', fontSize: 18, fontWeight: 500 }),
  ];
  const code = exportNode(doc, 'stack', 'swiftui');
  expect(code).toContain('.padding(24)');
  expect(code).toContain('.font(.system(size: 21, weight: .bold))');
  expect(code).toContain('.font(.system(size: 18, weight: .medium))');
  expect([100, 200, 300, 400, 500, 600, 700, 800, 900].map(swiftWeight)).toEqual(['.ultraLight', '.thin', '.light', '.regular', '.medium', '.semibold', '.bold', '.heavy', '.black']);
});
