import { test, expect } from 'bun:test';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv-provider.js';
import { DocumentStore } from '../src/app/model/store';
import { ToolOutputSchemas, toolOutputJSONSchemas } from '../src/app/model/tool-output';

test('published MCP output schemas validate actual receipts/checkpoints and reject malformed success data', () => {
  const store = new DocumentStore();
  const published = toolOutputJSONSchemas();
  const validator = new AjvJsonSchemaValidator();
  const check = (method: keyof typeof ToolOutputSchemas, value: unknown) => validator.getValidator(published[method])(value).valid;
  for (const method of ['document.new', 'transaction.apply', 'history.undo', 'history.redo', 'selection.set'] as const) {
    expect(check(method, store.result())).toBe(true);
    expect(check(method, { ...store.result(), revision: 'one' })).toBe(false);
  }
  expect(check('document.checkpoint', store.checkpoint())).toBe(true);
  expect(check('document.checkpoint', { ...store.checkpoint(), checkpointVersion: 99 })).toBe(false);
  expect(check('code.export', { code: '<button>Continue</button>' })).toBe(true);
  expect(check('code.export', { code: 42 })).toBe(false);
  expect(check('render.capture', { ...store.result(), committed: true, rendered: true, durable: false, persistence: 'Saving', assetDiagnostics: [] })).toBe(true);
  expect(check('render.capture', { ...store.result(), rendered: false })).toBe(false);
});
test('typed tool errors conform to every output contract, including the pinned SDK error validation behavior', () => {
  const validator = new AjvJsonSchemaValidator();
  const failure = { error: { code: 'stale_revision', message: 'Stale revision', documentId: 'd', revision: 2, recoveryAction: 'Read document.get and retry.' } };
  for (const schema of Object.values(toolOutputJSONSchemas())) {
    const check = validator.getValidator(schema);
    expect(check(failure).valid).toBe(true);
    expect(check({ error: { ...failure.error, revision: -1 } }).valid).toBe(false);
  }
});
