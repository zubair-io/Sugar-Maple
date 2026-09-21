import { z } from 'zod';

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
    kind: z.enum(['artboard', 'frame', 'rectangle', 'ellipse', 'text', 'button', 'input', 'image']),
    name: z.string().min(1).max(200),
    x: finite.default(0),
    y: finite.default(0),
    width: z.number().min(1).max(10000).default(200),
    height: z.number().min(1).max(10000).default(100),
    rotation: finite.default(0),
    radius: z.number().min(0).max(500).default(0),
    fill: color.default('#ffffff'),
    color: color.default('#18181b'),
    stroke: color.default('#d4d4d8'),
    strokeWidth: z.number().min(0).max(50).default(0),
    opacity: z.number().min(0).max(1).default(1),
    text: z.string().max(20000).default(''),
    fontSize: z.number().min(6).max(500).default(16),
    fontWeight: z.number().min(100).max(900).default(400),
    layout: z.enum(['free', 'horizontal', 'vertical', 'grid']).default('free'),
    gap: z.number().min(0).max(1000).default(16),
    padding: z.number().min(0).max(1000).default(16),
    columns: z.number().int().min(1).max(24).default(2),
    hidden: z.boolean().default(false),
    locked: z.boolean().default(false),
    order: finite.default(0),
    targetId: id.nullable().default(null),
    transition: z.enum(['instant', 'dissolve']).default('instant'),
    asset: z.string().max(8000000).default(''),
    componentId: id.nullable().default(null),
    fillToken: z.string().max(128).default(''),
  })
  .strict();
export type SceneNode = z.infer<typeof NodeSchema>;
export const PageSchema = z.object({ id, name: z.string().min(1).max(200), order: finite });
export const DocumentSchema = z.object({
  version: z.literal(1),
  id,
  name: z.string().min(1).max(200),
  pages: z.array(PageSchema).min(1).max(100),
  nodes: z.array(NodeSchema).max(10000),
  tokens: z.record(z.string().regex(/^[\w.-]+$/), color),
});
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
const addNode = NodeSchema.partial().required({ kind: true, pageId: true });
export const OperationSchema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('page.add'), id: id.optional(), name: z.string().min(1).max(200) })
    .strict(),
  z.object({ type: z.literal('page.update'), id, name: z.string().min(1).max(200) }).strict(),
  z.object({ type: z.literal('page.remove'), id }).strict(),
  z.object({ type: z.literal('node.add'), node: addNode }).strict(),
  z.object({ type: z.literal('node.update'), id, patch: patchNode }).strict(),
  z.object({ type: z.literal('node.remove'), id }).strict(),
  z.object({ type: z.literal('document.rename'), name: z.string().min(1).max(200) }).strict(),
  z
    .object({ type: z.literal('token.set'), name: z.string().regex(/^[\w.-]+$/), value: color })
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
    pages: [{ id: uid(), name: 'Page 1', order: 0 }],
    nodes: [],
    tokens: {},
  };
}
export function validateDocument(value: unknown): SceneDocument {
  const doc = DocumentSchema.parse(value);
  const pages = new Set(doc.pages.map((p) => p.id));
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  if (pages.size !== doc.pages.length || nodes.size !== doc.nodes.length)
    throw Error('Duplicate IDs');
  for (const n of doc.nodes) {
    if (!pages.has(n.pageId)) throw Error('Missing page');
    if (n.asset && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(n.asset))
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
    if (n.targetId && !nodes.has(n.targetId)) throw Error('Missing prototype target');
    if (n.componentId && !nodes.has(n.componentId)) throw Error('Missing component master');
  }
  return doc;
}
