import { test, expect } from 'bun:test';
import { toolArguments, toolError } from '../src/app/model/tool-contract';
import { blankDocument, NodeSchema } from '../src/app/model/schema';
import { exportNode } from '../src/app/model/export';
test('all tool inputs validate strictly, including invalid export targets and render revisions', () => {
  expect(() => toolArguments('code.export', { id: 'board', target: 'png' })).toThrow();
  expect(() => toolArguments('document.get', { unexpected: true })).toThrow();
  expect(() => toolArguments('history.undo', { documentId: 'd', expectedRevision: -1 })).toThrow();
  expect(() => toolArguments('render.ready', {})).toThrow();
  const move = { documentId: 'd', expectedRevision: 0, ids: ['n'], parentId: null };
  expect(toolArguments('nodes.reparent', move).placement).toBe('preserve-world');
  expect(() => toolArguments('nodes.reparent', { ...move, placement: 'guess' })).toThrow();
  expect(() => toolArguments('nodes.reparent', { ...move, ids: [] })).toThrow();
  expect(() => toolArguments('nodes.reparent', { ...move, operations: [] })).toThrow();
  const doc = blankDocument();
  doc.nodes.push(NodeSchema.parse({ id: 'n', pageId: doc.pages[0].id, kind: 'text', name: 'Text' }));
  expect(() => exportNode(doc, 'n', 'png' as any)).toThrow();
});
test('bridge error envelope retains stable code, context, cause and recovery action', () => {
  const context = { documentId: 'd', revision: 12 };
  for (const [message, code] of [['Wrong document', 'wrong_document'], ['Stale revision', 'stale_revision'], ['Font loading timed out', 'timeout'], ['SwiftUI path export is not yet supported', 'unsupported_feature']])
    expect(toolError(Error(message), context)).toMatchObject({ code, message, ...context });
  try { toolArguments('code.export', { id: 'n', target: 'png' }); } catch (error) { expect(toolError(error, context).code).toBe('invalid_input'); }
});
