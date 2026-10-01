import { z } from 'zod';
import {
  DocumentSchema,
  NodeSchema,
  PageSchema,
  FolderSchema,
  CommentSchema,
  type SceneDocument,
} from './schema';

const deltaSchema = z
  .object({
    name: z.string().optional(),
    comments: z.array(CommentSchema).default([]),
    removedComments: z.array(z.string()).default([]),
    folders: z.array(FolderSchema).default([]),
    removedFolders: z.array(z.string()).default([]),
    pages: z.array(PageSchema),
    removedPages: z.array(z.string()),
    nodes: z.array(NodeSchema),
    removedNodes: z.array(z.string()),
    tokens: DocumentSchema.shape.tokens.optional(),
  })
  .strict();
export type DocumentDelta = z.infer<typeof deltaSchema>;
const receipt = z
  .object({
    documentId: z.string(),
    revision: z.number().int().nonnegative(),
    ids: z.array(z.string()),
    transactionId: z.string(),
  })
  .strict();
export const JournalSchema = z.array(
  z.discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('edit'),
        origin: z.enum(['human', 'agent']),
        delta: deltaSchema,
        requestId: z.string(),
        signature: z.string(),
        receipt,
      })
      .strict(),
    z.object({ kind: z.literal('undo') }).strict(),
    z.object({ kind: z.literal('redo') }).strict(),
  ]),
);
export type JournalEntry = z.infer<typeof JournalSchema>[number];
export function delta(before: SceneDocument, after: SceneDocument): DocumentDelta {
  const changed = <T extends { id: string }>(old: T[], next: T[]) => {
    const index = new Map(old.map((v) => [v.id, v]));
    return next.filter((v) => JSON.stringify(index.get(v.id)) !== JSON.stringify(v));
  };
  const removed = (old: { id: string }[], next: { id: string }[]) => {
    const ids = new Set(next.map((v) => v.id));
    return old.filter((v) => !ids.has(v.id)).map((v) => v.id);
  };
  return {
    ...(before.name !== after.name ? { name: after.name } : {}),
    comments: changed(before.comments, after.comments),
    removedComments: removed(before.comments, after.comments),
    folders: changed(before.folders, after.folders),
    removedFolders: removed(before.folders, after.folders),
    pages: changed(before.pages, after.pages),
    removedPages: removed(before.pages, after.pages),
    nodes: changed(before.nodes, after.nodes),
    removedNodes: removed(before.nodes, after.nodes),
    ...(JSON.stringify(before.tokens) !== JSON.stringify(after.tokens)
      ? { tokens: after.tokens }
      : {}),
  };
}
export function applyDelta(document: SceneDocument, change: DocumentDelta): SceneDocument {
  const update = <T extends { id: string }>(items: T[], upserts: T[], removals: string[]) => {
    const removed = new Set(removals),
      result = new Map(items.filter((v) => !removed.has(v.id)).map((v) => [v.id, v]));
    for (const value of upserts) result.set(value.id, value);
    return [...result.values()];
  };
  return {
    ...document,
    name: change.name ?? document.name,
    comments: update(document.comments, change.comments, change.removedComments),
    folders: update(document.folders, change.folders, change.removedFolders),
    pages: update(document.pages, change.pages, change.removedPages),
    nodes: update(document.nodes, change.nodes, change.removedNodes),
    tokens: change.tokens ?? document.tokens,
  };
}
