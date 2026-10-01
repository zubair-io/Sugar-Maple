import { z } from 'zod';
import { CommentSchema, DocumentSchema } from './schema';
import { JournalSchema } from './journal';

const receipt = z.object({
  documentId: z.string(), revision: z.number().int().nonnegative(),
  ids: z.array(z.string()), transactionId: z.string(),
}).strict();
const bounds = z.object({ x: z.number(), y: z.number(), width: z.number().nonnegative(), height: z.number().nonnegative() }).strict();
const diagnostics = z.array(z.object({
  nodeId: z.string(), name: z.string(), state: z.enum(['loading', 'error']), message: z.string(),
}).strict());
const status = receipt.extend({
  committed: z.literal(true), rendered: z.literal(true), durable: z.boolean(),
  persistence: z.string(), assetDiagnostics: diagnostics,
}).strict();
const schemas = z.record(z.string(), z.unknown());
export const ToolOutputSchemas = {
  capabilities: z.object({
    protocolVersion: z.literal(1), coordinateUnits: z.string(),
    transactionSchema: z.unknown(), commentsQuerySchema: z.unknown(),
    toolSchemas: schemas, toolOutputSchemas: schemas, kinds: z.array(z.string()),
  }).strict(),
  'document.get': receipt.extend({
    document: DocumentSchema, durable: z.boolean(), persistence: z.string(), assetDiagnostics: diagnostics,
  }).strict(),
  'document.checkpoint': z.object({
    checkpointVersion: z.literal(2), document: DocumentSchema, base: DocumentSchema, journal: JournalSchema,
  }).strict(),
  'document.new': receipt, 'transaction.apply': receipt, 'history.undo': receipt,
  'history.redo': receipt, 'selection.set': receipt,
  'comments.list': receipt.extend({ comments: z.array(CommentSchema.extend({ pageName: z.string() })) }).strict(),
  'code.export': z.object({ code: z.string() }).strict(),
  'layout.inspect': z.object({
    documentId: z.string(), revision: z.number().int().nonnegative(), pageId: z.string(),
    renderer: z.literal('canvas'), viewport: bounds,
    nodes: z.array(z.object({ id: z.string(), selected: z.boolean(), rendered: z.boolean(), painted: z.boolean(), bounds: bounds.nullable() }).strict()),
  }).strict(),
  'viewport.fit': z.object({ zoom: z.number().positive(), pan: z.object({ x: z.number(), y: z.number() }).strict() }).strict(),
  'render.ready': status, 'render.capture': status,
};
// The pinned SDK validates structuredContent even for error results. Describe both
// successful payloads and typed errors while retaining isError as the protocol flag.
export const ToolErrorOutputSchema = z.object({ error: z.object({
  code: z.string(), message: z.string(), recoveryAction: z.string(),
  documentId: z.string().optional(), revision: z.number().int().nonnegative().optional(),
}).passthrough() }).strict();
export function toolOutputJSONSchemas() {
  return Object.fromEntries(Object.entries(ToolOutputSchemas).map(([name, schema]) => [name, {
    ...z.union([schema, ToolErrorOutputSchema]).toJSONSchema({ io: 'output' }), type: 'object',
  }]));
}
