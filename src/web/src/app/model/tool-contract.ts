import { z } from 'zod';
import { CommentsQuerySchema, TransactionSchema } from './schema';
import { ScopedReadSchema, CaptureSchema } from './read-contract';
export const ExportTargetSchema = z.enum(['html', 'angular', 'tailwind', 'tailwind-classes', 'css', 'css-declarations', 'html-css', 'swiftui', 'editable', 'svg', 'web-library', 'swift-library']);
const id = z.string().min(1).max(128).regex(/^[\w-]+$/);
const empty = z.object({}).strict();
const revision = z.object({ documentId: id, expectedRevision: z.number().int().nonnegative() }).strict();
export const ToolInputSchemas = {
  capabilities: empty, 'editor.discover': empty, 'document.read': ScopedReadSchema, 'document.get': empty, 'document.checkpoint': empty,
  'document.new': z.object({ name: z.string().min(1).max(200).optional() }).strict(),
  'comments.list': CommentsQuerySchema, 'transaction.apply': TransactionSchema,
  'history.undo': revision, 'history.redo': revision,
  'selection.set': z.object({ id }).strict(),
  'nodes.reparent': revision.extend({
    ids: z.array(id).min(1).max(500), parentId: id.nullable(),
    placement: z.enum(['preserve-world', 'layout']).default('preserve-world'),
  }).strict(),
  'code.export': z.object({ id, target: ExportTargetSchema }).strict(),
  'layout.inspect': empty, 'viewport.fit': empty, 'render.ready': revision, 'render.capture': CaptureSchema,
};
export function toolInputJSONSchemas() {
  return Object.fromEntries(Object.entries(ToolInputSchemas).map(([name, schema]) => [name, { ...schema.toJSONSchema(), type: 'object' }]));
}
export class ToolFailure extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
export function toolArguments(method: string, args: unknown): any {
  const schema = ToolInputSchemas[method as keyof typeof ToolInputSchemas];
  if (!schema) throw new ToolFailure('unsupported_feature', `Unknown command: ${method}`);
  return schema.parse(args);
}
export function toolError(error: unknown, context: { documentId: string; revision: number }) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof ToolFailure ? error.code
    : error instanceof z.ZodError ? 'invalid_input'
    : message === 'Wrong document' ? 'wrong_document'
    : message === 'Stale revision' ? 'stale_revision'
    : /timed out|timeout/i.test(message) ? 'timeout'
    : /not yet supported|unsupported/i.test(message) ? 'unsupported_feature'
    : /loading|not ready/i.test(message) ? 'loading' : 'invalid_input';
  const recoveryAction = code === 'stale_revision' || code === 'wrong_document' ? 'Read editor.discover and retry against its documentId and revision.'
    : code === 'unsupported_feature' ? 'Choose a supported feature or export target.'
    : code === 'loading' || code === 'timeout' ? 'Wait for editor readiness and retry.' : 'Correct the input using capabilities and retry.';
  return { code, message, ...context, recoveryAction };
}
