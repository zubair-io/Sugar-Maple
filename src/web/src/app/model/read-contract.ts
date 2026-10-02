import { z } from 'zod';
import { LibraryManifestSchema, LibraryKeySchema } from './library-schema';
import { NodeSchema, PageSchema, FolderSchema } from './schema';

const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\w-]+$/);
const target = {
  documentId: id,
  expectedRevision: z.number().int().nonnegative(),
  offset: z.number().int().min(0).max(10000).default(0),
  limit: z.number().int().min(1).max(500).default(100),
};
export const ScopedReadSchema = z.discriminatedUnion('scope', [
  z.object({ ...target, scope: z.literal('document') }).strict(),
  z.object({ ...target, scope: z.literal('page'), pageId: id }).strict(),
  z.object({ ...target, scope: z.literal('subtree'), nodeId: id }).strict(),
  z
    .object({
      ...target,
      scope: z.literal('selection'),
      selectionIds: z.array(id).max(10000).optional(),
    })
    .strict(),
]);
export type ScopedReadQuery = z.infer<typeof ScopedReadSchema>;
export const READ_LIMITS = { maxNodes: 500, maxResponseBytes: 16 * 1024 * 1024 } as const;
export const CaptureSchema = z
  .object({
    documentId: id,
    expectedRevision: z.number().int().nonnegative(),
    rect: z
      .object({
        x: z.number().finite().nonnegative(),
        y: z.number().finite().nonnegative(),
        width: z.number().finite().positive().max(4096),
        height: z.number().finite().positive().max(4096),
      })
      .strict()
      .optional(),
    scale: z.union([z.literal(0.5), z.literal(1), z.literal(2)]).default(1),
  })
  .strict();
export const DiscoveryOutputSchema = z
  .object({
    readVersion: z.literal(1),
    documentId: id,
    revision: z.number().int().nonnegative(),
    name: z.string(),
    pageId: id,
    selectionIds: z.array(id),
    nodeCount: z.number().int().nonnegative(),
    pages: z.array(PageSchema.extend({ nodeCount: z.number().int().nonnegative() })),
    folders: z.array(FolderSchema),
    reads: z
      .object({
        scopes: z.array(z.enum(['document', 'page', 'subtree', 'selection'])),
        ordering: z.literal('page-order then depth-first sibling-order/id'),
        maxNodes: z.literal(500),
        maxResponseBytes: z.literal(16777216),
      })
      .strict(),
    capture: z
      .object({
        coordinateUnits: z.literal('CSS pixels in the editor WebView'),
        scales: z.array(z.number()),
        maxPixelDimension: z.literal(4096),
        maxPixels: z.literal(16777216),
        throttleMilliseconds: z.literal(100),
      })
      .strict(),
  })
  .strict();
export const ScopedReadOutputSchema = z
  .object({
    readVersion: z.literal(1),
    documentId: id,
    revision: z.number().int().nonnegative(),
    scope: z.enum(['document', 'page', 'subtree', 'selection']),
    rootIds: z.array(id),
    nodes: z.array(NodeSchema).max(500),
    total: z.number().int().nonnegative(),
    offset: z.number().int().nonnegative(),
    nextOffset: z.number().int().nonnegative().nullable(),
    references: z
      .object({
        ancestors: z.array(NodeSchema),
        components: z.array(z.object({ id, pageId: id, name: z.string() }).strict()),
        libraries: z.record(LibraryKeySchema, LibraryManifestSchema),
        tokens: z.record(z.string(), z.string()),
        assets: z.record(z.string(), z.string()),
        pages: z.array(PageSchema),
      })
      .strict(),
  })
  .strict();
