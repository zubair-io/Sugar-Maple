import { applyRepeat } from './repeat';
import { NodeSchema, uid, type SceneDocument, type SceneNode, type Operation } from './schema';
export function subtree(doc: SceneDocument, id: string) {
  const ids = new Set([id]);
  let size = 0;
  while (size !== ids.size) {
    size = ids.size;
    for (const n of doc.nodes) if (n.parentId && ids.has(n.parentId)) ids.add(n.id);
  }
  return doc.nodes.filter((n) => ids.has(n.id));
}
export function cloneTree(
  doc: SceneDocument,
  id: string,
  options: { pageId: string; parentId: string | null; x: number; y: number; linked: boolean },
) {
  const tree = subtree(doc, id),
    source = [tree.find((n) => n.id === id)!, ...tree.filter((n) => n.id !== id)],
    ids = new Map(source.map((n) => [n.id, uid()]));
  return source.map((n) =>
    NodeSchema.parse({
      ...n,
      id: ids.get(n.id),
      pageId: options.pageId,
      parentId: n.id === id ? options.parentId : ids.get(n.parentId!),
      x: n.id === id ? options.x : n.x,
      y: n.id === id ? options.y : n.y,
      isComponent: tree.some(v => v.repeatTemplateId === n.id),
      variants: {},
      componentId: n.componentId && ids.has(n.componentId) ? ids.get(n.componentId) : options.linked ? n.id : null,
      overrides: n.componentId && ids.has(n.componentId) ? [...n.overrides] : [],
      targetId: n.targetId ? (ids.get(n.targetId) ?? n.targetId) : null,
      repeatTemplateId: n.repeatTemplateId ? ids.get(n.repeatTemplateId) ?? null : null,
      repeatIndex: n.parentId && ids.has(n.parentId) ? n.repeatIndex : null,
    }),
  );
}
export function applyComposition(doc: SceneDocument, op: Operation, ids: string[]): boolean {
  if (applyRepeat(doc, op, ids)) return true;
  if (
    ![
      'component.variant',
      'component.reset',
      'component.create',
      'component.insert',
      'component.detach',
    ].includes(op.type)
  )
    return false;
  const id = (op as { id: string }).id,
    node = doc.nodes.find((n) => n.id === id);
  if (!node) throw Error('Node not found');
  switch (op.type) {
    case 'component.variant': {
      const master = doc.nodes.find((n) => n.id === node.componentId && n.isComponent);
      if (!master || (op.name !== 'Default' && !master.variants[op.name]))
        throw Error('Unknown component variant');
      node.variantName = op.name;
      return true;
    }
    case 'component.reset': {
      if (!node.componentId) throw Error('Select a component instance');
      for (const n of subtree(doc, id)) {
        const source = doc.nodes.find((v) => v.id === n.componentId);
        if (!source) continue;
        const keep = {
          id: n.id,
          pageId: n.pageId,
          parentId: n.parentId,
          order: n.order,
          x: n.id === id ? n.x : source.x,
          y: n.id === id ? n.y : source.y,
          repeatTemplateId: n.repeatTemplateId,
          repeatIndex: n.repeatIndex,
          hidden: n.repeatIndex !== null ? false : source.hidden,
          targetId: n.targetId,
          componentId: n.componentId,
          isComponent: false,
          variants: {},
          variantName: n.variantName,
          overrides: n.repeatIndex !== null ? ['hidden'] : [],
        };
        Object.assign(n, structuredClone(source), keep);
      }
      return true;
    }
    case 'component.create':
      if (node.componentId) throw Error('Detach the instance before making a master');
      node.isComponent = true;
      return true;
    case 'component.insert': {
      if (!node.isComponent) throw Error('Select a component master');
      if (doc.nodes.some(grid=>grid.repeatTemplateId===node.id)) throw Error('Use Edit template to edit a Repeat Grid source');
      const clones = cloneTree(doc, id, {
        pageId: op.pageId,
        parentId: null,
        x: op.x,
        y: op.y,
        linked: true,
      });
      doc.nodes.push(...clones);
      ids.push(clones[0].id);
      return true;
    }
    case 'component.detach':
      for (const n of subtree(doc, id)) {
        n.componentId = null;
        n.overrides = [];
      }
      return true;
    default:
      return false;
  }
}
export function propagate(
  doc: SceneDocument,
  source: SceneNode,
  patch: Partial<SceneNode>,
  trackOverrides = true,
) {
  const structural = new Set([
    'id',
    'pageId',
    'parentId',
    'order',
    'componentId',
    'isComponent',
    'overrides',
    'repeatTemplateId',
    'repeatIndex',
    'variants',
    'variantName',
  ]);
  const visit = (source: SceneNode, fields: Partial<SceneNode>, visited: Set<string>) => {
    if (visited.has(source.id)) return;
    visited.add(source.id);
    for (const n of doc.nodes.filter((n) => n.componentId === source.id)) {
      const changes: Partial<SceneNode> = {};
      for (const [key, value] of Object.entries(fields)) {
        const placement =
          (key === 'x' || key === 'y') && (source.isComponent || source.repeatIndex !== null);
        const variant =
          source.isComponent && (Object.hasOwn(source.variants[n.variantName] ?? {}, key) ||
            (key === 'fillToken' && Object.hasOwn(source.variants[n.variantName] ?? {}, 'fill')));
        if (!structural.has(key) && !placement && !variant && !n.overrides.includes(key)) {
          (n as any)[key] = value;
          (changes as any)[key] = value;
        }
      }
      visit(n, changes, visited);
    }
  };
  visit(source, patch, new Set());
  if (trackOverrides && source.componentId)
    for (const key of Object.keys(patch))
      if (!structural.has(key) && !source.overrides.includes(key)) source.overrides.push(key);
}
