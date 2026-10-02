import { z } from 'zod';
import { ForwardMetadataSchema, assertMetadataRecordKeys } from './forward-metadata';
import { LibraryManifestSchema, LibraryReferenceSchema, LibraryPropsSchema, LibraryKeySchema, validateLibraryBindings } from './library-schema';
import { assetKeyPattern, assetReferencePattern, validateAssets } from './assets';

const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\w-]+$/);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const finite = z.number().finite().min(-100000).max(100000);
export const NodeSchema = z
  .object({
    id,
    pageId: id,
    parentId: id.nullable().default(null),
    kind: z.enum([
      'artboard',
      'frame',
      'rectangle',
      'ellipse',
      'text',
      'button',
      'input',
      'image',
      'path',
    ]),
    name: z.string().min(1).max(200),
    x: finite.default(0),
    y: finite.default(0),
    width: z.number().min(1).max(10000).default(200),
    height: z.number().min(1).max(10000).default(100),
    widthMode: z.enum(['fixed', 'fill', 'hug', 'percent']).default('fixed'),
    heightMode: z.enum(['fixed', 'fill', 'hug', 'percent']).default('fixed'),
    widthPercent: z.number().min(1).max(100).default(100),
    heightPercent: z.number().min(1).max(100).default(100),
    rotation: finite.default(0),
    radius: z.number().min(0).max(500).default(0),
    gradient: z
      .object({
        type: z.enum(['linear', 'radial']),
        angle: z.number().finite().min(-360).max(360).default(180),
        centerX: z.number().min(0).max(100).default(50),
        centerY: z.number().min(0).max(100).default(50),
        radiusX: z.number().min(0.1).max(200).default(50),
        radiusY: z.number().min(0.1).max(200).default(50),
        stops: z
          .array(
            z
              .object({
                offset: z.number().min(0).max(1),
                color,
                opacity: z.number().min(0).max(1).default(1),
              })
              .strict(),
          )
          .min(2)
          .max(16),
      })
      .strict()
      .nullable()
      .default(null),
    fillEnabled: z.boolean().default(true),
    fill: color.default('#ffffff'),
    color: color.default('#18181b'),
    stroke: color.default('#d4d4d8'),
    strokeWidth: z.number().min(0).max(50).default(0),
    opacity: z.number().min(0).max(1).default(1),
    text: z.string().max(20000).default(''),
    fontSize: z.number().min(6).max(500).default(16),
    fontWeight: z.number().min(100).max(900).default(400),
    fontFamily: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[\p{L}\p{N} ._-]+$/u)
      .overwrite(
        (value) =>
          ['system-ui', 'sans-serif', 'serif', 'monospace', 'Maple Sans'].find(
            (name) => name.toLowerCase() === value.toLowerCase(),
          ) ?? value,
      )
      .default('system-ui'),
    lineHeight: z.number().finite().min(0.5).max(5).default(1.2),
    letterSpacing: z.number().finite().min(-20).max(100).default(0),
    textAlign: z.enum(['auto', 'left', 'center', 'right']).default('auto'),
    layout: z.enum(['free', 'horizontal', 'vertical', 'grid']).default('free'),
    gap: z.number().min(0).max(1000).default(16),
    padding: z.number().min(0).max(1000).default(16),
    columns: z.number().int().min(1).max(24).default(2),
    hidden: z.boolean().default(false),
    locked: z.boolean().default(false),
    order: finite.default(0),
    inputType: z.enum(['text', 'password', 'email']).default('text'),
    initialValue: z.string().max(20000).regex(/^[^\r\n]*$/).default(''),
    accessibleLabel: z.string().max(200).default(''),
    disabled: z.boolean().default(false),
    prototypeAction: z.enum(['navigate', 'openOverlay', 'closeOverlay', 'back']).default('navigate'),
    targetId: id.nullable().default(null),
    transition: z.enum(['instant', 'dissolve']).default('instant'),
    asset: z.string().max(8000000).default(''),
    pathData: z
      .string()
      .max(100000)
      .regex(/^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]*$/)
      .default(''),
    viewBox: z
      .string()
      .regex(/^-?[0-9.]+ -?[0-9.]+ [0-9.]+ [0-9.]+$/)
      .default('0 0 100 100'),
    libraryRef: LibraryReferenceSchema.nullable().default(null),
    librarySlot: z.string().max(80).regex(/^(?:[a-z][a-z0-9-]*)?$/).default(''),
    componentId: id.nullable().default(null),
    isComponent: z.boolean().default(false),
    variantName: z.string().min(1).max(80).default('Default'),
    variants: z
      .record(
        z
          .string()
          .min(1)
          .max(80)
          .refine((name) => !['__proto__', 'prototype', 'constructor', 'Default'].includes(name)),
        z
          .object({
            fill: color,
            fillToken: z.string().max(128),
            color,
            text: z.string().max(20000),
            radius: z.number().min(0).max(500),
            opacity: z.number().min(0).max(1),
            stroke: color,
            strokeWidth: z.number().min(0).max(50),
          })
          .partial()
          .strict(),
      )
      .default({}),
    overrides: z.array(z.string()).default([]),
    repeatTemplateId: id.nullable().default(null),
    repeatIndex: z.number().int().min(0).max(99).nullable().default(null),
    fillToken: z.string().max(128).default(''),
  })
  .strict();
export type SceneNode = z.infer<typeof NodeSchema>;
export const FolderSchema = z.object({ id, name: z.string().min(1).max(200), order: finite }).catchall(ForwardMetadataSchema);
export const PageSchema = z.object({
  id,
  name: z.string().min(1).max(200),
  order: finite,
  folderId: id.nullable().default(null),
}).catchall(ForwardMetadataSchema);
const commentText = z.string().trim().min(1).max(4000);
const commentAnchor = z.object({ x: finite, y: finite }).strict().nullable().default(null);
const commentAuthor = z.enum(['human', 'agent']);
export const CommentSchema = z
  .object({
    id,
    pageId: id,
    anchor: commentAnchor,
    createdAt: z.string().datetime(),
    messages: z
      .array(
        z
          .object({
            id,
            text: commentText,
            author: commentAuthor,
            createdAt: z.string().datetime(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    resolved: z.boolean().default(false),
    resolvedBy: commentAuthor.nullable().default(null),
    resolvedAt: z.string().datetime().nullable().default(null),
  })
  .strict();
export const CommentsQuerySchema = z
  .object({
    pageId: id.optional(),
    status: z.enum(['open', 'resolved', 'all']).default('open'),
  })
  .strict();
export const DocumentSchema = z.object({
  version: z.literal(1),
  id,
  name: z.string().min(1).max(200),
  comments: z.array(CommentSchema).max(1000).default([]),
  folders: z.array(FolderSchema).max(100).default([]),
  pages: z.array(PageSchema).min(1).max(100),
  nodes: z.array(NodeSchema).max(10000),
  tokens: z.record(z.string().regex(/^[\w.-]+$/), color),
  libraries: z.record(LibraryKeySchema, LibraryManifestSchema).default({}),
  assets: z.record(z.string().regex(assetKeyPattern), z.string().max(6_666_700)).default({}),
}).catchall(ForwardMetadataSchema);
export type SceneDocument = z.infer<typeof DocumentSchema>;
const patchNode = z
  .object(
    Object.fromEntries(
      Object.entries(NodeSchema.shape)
        .filter(([key]) => key !== 'id')
        .map(([key, value]) => [
          key,
          value instanceof z.ZodDefault ? value.removeDefault() : value,
        ]),
    ) as unknown as {
      [
        K in Exclude<keyof typeof NodeSchema.shape, 'id'>
      ]: (typeof NodeSchema.shape)[K] extends z.ZodDefault<infer Inner>
        ? Inner
        : (typeof NodeSchema.shape)[K];
    },
  )
  .partial()
  .strict();
const addNode = patchNode.extend({ id: id.optional() }).required({ kind: true, pageId: true });
export const OperationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('library.import'), manifest: LibraryManifestSchema }).strict(),
  z.object({ type: z.literal('library.insert'), key: LibraryKeySchema, component: z.string().min(1).max(80), pageId: id, id: id.optional(), x: finite, y: finite, props: LibraryPropsSchema.default({}), variant: z.string().min(1).max(80).optional() }).strict(),
  z.object({ type: z.literal('library.props'), id, props: LibraryPropsSchema, variant: z.string().min(1).max(80).optional() }).strict(),
  z.object({ type: z.literal('library.remap'), id, key: LibraryKeySchema, component: z.string().min(1).max(80).optional() }).strict(),
  z.object({ type: z.literal('library.reset'), id }).strict(),
  z.object({ type: z.literal('asset.set'), key: z.string().regex(assetKeyPattern), source: z.string().max(6_666_700) }).strict(),
  z.object({ type: z.literal('repeat.prepare'), id }).strict(),
  z.object({ type: z.literal('repeat.resize'), id, rows: z.number().int().min(1).max(100), columns: z.number().int().min(1).max(20) }).strict(),
  z.object({
    type: z.literal('repeat.import'), id,
    rows: z.array(z.record(z.string().min(1).max(128), z.string().max(20000))).min(1).max(1000),
    fields: z.array(z.object({ field: z.string().min(1).max(128), targetId: id, property: z.enum(['text', 'initialValue', 'asset']) }).strict()).min(1).max(100),
    missing: z.enum(['retain', 'clear', 'error']),
    truncate: z.boolean(),
  }).strict(),
  z
    .object({
      type: z.literal('comment.add'),
      id: id.optional(),
      pageId: id,
      text: commentText,
      anchor: commentAnchor.optional(),
    })
    .strict(),
  z.object({ type: z.literal('comment.reply'), id, text: commentText }).strict(),
  z.object({ type: z.literal('comment.resolve'), id, resolved: z.boolean() }).strict(),
  z.object({ type: z.literal('component.variant'), id, name: z.string().min(1).max(80) }).strict(),
  z.object({ type: z.literal('component.reset'), id }).strict(),
  z.object({ type: z.literal('component.create'), id }).strict(),
  z
    .object({
      type: z.literal('component.insert'),
      id,
      pageId: id,
      x: finite.default(0),
      y: finite.default(0),
    })
    .strict(),
  z.object({ type: z.literal('component.detach'), id }).strict(),
  z
    .object({
      type: z.literal('repeat.create'),
      id,
      count: z.number().int().min(2).max(100),
      columns: z.number().int().min(1).max(20),
    })
    .strict(),
  z
    .object({
      type: z.literal('repeat.populate'),
      id,
      values: z.array(z.string().max(20000)).max(100),
    })
    .strict(),
  z
    .object({
      type: z.literal('page.add'),
      id: id.optional(),
      name: z.string().min(1).max(200),
      folderId: id.nullable().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('page.update'),
      id,
      name: z.string().min(1).max(200).optional(),
      folderId: id.nullable().optional(),
    })
    .strict(),
  z
    .object({ type: z.literal('folder.add'), id: id.optional(), name: z.string().min(1).max(200) })
    .strict(),
  z.object({ type: z.literal('folder.update'), id, name: z.string().min(1).max(200) }).strict(),
  z.object({ type: z.literal('folder.remove'), id }).strict(),
  z.object({ type: z.literal('page.remove'), id }).strict(),
  z.object({ type: z.literal('node.add'), node: addNode }).strict(),
  z.object({ type: z.literal('node.update'), id, patch: patchNode }).strict(),
  z.object({ type: z.literal('node.remove'), id }).strict(),
  z.object({ type: z.literal('document.rename'), name: z.string().min(1).max(200) }).strict(),
  z
    .object({
      type: z.literal('token.set'),
      name: z
        .string()
        .regex(/^[\w.-]+$/)
        .refine(
          (name) => !['__proto__', 'constructor', 'prototype'].includes(name),
          'Reserved token name',
        ),
      value: color,
    })
    .strict(),
]);
export type Operation = z.infer<typeof OperationSchema>;
export const TransactionSchema = z
  .object({
    documentId: id,
    expectedRevision: z.number().int().nonnegative(),
    requestId: id,
    operations: z.array(OperationSchema).min(1).max(500),
  })
  .strict();
export type Transaction = z.infer<typeof TransactionSchema>;
export const uid = () => crypto.randomUUID();
export function blankDocument(name = 'Untitled'): SceneDocument {
  return {
    version: 1,
    id: uid(),
    name,
    comments: [],
    folders: [],
    pages: [{ id: uid(), name: 'Page 1', order: 0, folderId: null }],
    nodes: [],
    tokens: {},
    assets: {},
    libraries: {},
  };
}
export function validateDocument(value: unknown): SceneDocument {
  assertMetadataRecordKeys(value);
  const doc = DocumentSchema.parse(value);
  validateAssets(doc.assets);
  validateLibraryBindings(doc);
  const folders = new Set(doc.folders.map((f) => f.id));
  if (folders.size !== doc.folders.length) throw Error('Duplicate folder IDs');
  for (const page of doc.pages)
    if (page.folderId && !folders.has(page.folderId)) throw Error('Missing page folder');
  const pages = new Set(doc.pages.map((p) => p.id));
  if (doc.pages.some((p) => folders.has(p.id))) throw Error('Page and folder IDs must be distinct');
  const comments = new Set(doc.comments.map((c) => c.id));
  if (comments.size !== doc.comments.length) throw Error('Duplicate comment IDs');
  for (const comment of doc.comments) {
    if (!pages.has(comment.pageId)) throw Error('Missing comment page');
    if (new Set(comment.messages.map((m) => m.id)).size !== comment.messages.length)
      throw Error('Duplicate comment message IDs');
    if (
      comment.resolved !== (comment.resolvedAt !== null && comment.resolvedBy !== null) ||
      (!comment.resolved && (comment.resolvedAt !== null || comment.resolvedBy !== null))
    )
      throw Error('Invalid comment resolution');
  }
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  if (pages.size !== doc.pages.length || nodes.size !== doc.nodes.length)
    throw Error('Duplicate IDs');
  for (const n of doc.nodes) {
    if (n.gradient && n.kind === 'path') throw Error('Path gradients are not supported yet');
    if (n.gradient && n.gradient.stops.some((s, i, a) => i > 0 && s.offset < a[i - 1].offset))
      throw Error('Gradient stops must be ordered');
    if (!pages.has(n.pageId)) throw Error('Missing page');
    if (assetReferencePattern.test(n.asset) && !Object.hasOwn(doc.assets, n.asset.slice(6)))
      throw Error('Missing embedded image content');
    if (n.asset && !assetReferencePattern.test(n.asset) && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(n.asset))
      throw Error('Only embedded PNG/JPEG/WebP images are supported');
    const visited = new Set([n.id]);
    let parent = n.parentId;
    while (parent) {
      if (visited.has(parent)) throw Error('Parent cycle');
      visited.add(parent);
      const p = nodes.get(parent);
      if (!p || p.pageId !== n.pageId || !['artboard', 'frame'].includes(p.kind))
        throw Error('Invalid parent');
      parent = p.parentId;
    }
    if (n.targetId && nodes.get(n.targetId)?.kind !== 'artboard')
      throw Error('Prototype target must be an artboard');
    const components = new Set([n.id]);
    let master = n.componentId;
    while (master) {
      if (components.has(master)) throw Error('Component cycle');
      components.add(master);
      const source = nodes.get(master);
      if (!source) throw Error('Missing component master');
      master = source.componentId;
    }
    if (n.repeatTemplateId && nodes.get(n.repeatTemplateId)?.parentId !== n.id)
      throw Error('Repeat template must be a child of its grid');
    const template = nodes.get(n.repeatTemplateId ?? '');
    if (template?.hidden && template.repeatIndex === null && template.isComponent) {
      const cells = doc.nodes.filter(v=>v.parentId===n.id && v.id!==template.id).sort((a,b)=>(a.repeatIndex??-1)-(b.repeatIndex??-1));
      if (!cells.length || cells.length>100 || cells.some((cell,index)=>cell.repeatIndex!==index || cell.componentId!==template.id))
        throw Error('Repeat Grid cells must retain contiguous indices and their template links; resize the grid to remove cells');
    }
  }
  componentOrder(doc);
  return doc;
}
export function componentOrder(doc: SceneDocument): string[] {
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  const dependencies = new Map(
    doc.nodes.filter((n) => n.isComponent).map((n) => [n.id, new Set<string>()]),
  );
  for (const n of doc.nodes) {
    const dependency = n.isComponent ? n.id : n.componentId;
    if (!dependency || !dependencies.has(dependency)) continue;
    let parent = n.parentId;
    while (parent) {
      dependencies.get(parent)?.add(dependency);
      parent = nodes.get(parent)?.parentId ?? null;
    }
  }
  const visited = new Set<string>(),
    active = new Set<string>(),
    order: string[] = [];
  const check = (id: string) => {
    if (active.has(id)) throw Error('Recursive component containment');
    if (visited.has(id)) return;
    active.add(id);
    for (const dependency of dependencies.get(id) ?? []) check(dependency);
    active.delete(id);
    visited.add(id);
    order.push(id);
  };
  for (const id of dependencies.keys()) check(id);
  return order;
}
