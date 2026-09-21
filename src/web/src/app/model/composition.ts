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
      isComponent: false,
      variants: {},
      componentId: options.linked ? n.id : null,
      overrides: [],
      targetId: n.targetId ? (ids.get(n.targetId) ?? n.targetId) : null,
      repeatTemplateId: null,
      repeatIndex: null,
    }),
  );
}
export function applyComposition(doc: SceneDocument, op: Operation, ids: string[]): boolean {
  if (
    ![
      'component.variant',
      'component.reset',
      'component.create',
      'component.insert',
      'component.detach',
      'repeat.create',
      'repeat.populate',
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
          targetId: n.targetId,
          componentId: n.componentId,
          isComponent: false,
          variants: {},
          variantName: n.variantName,
          overrides: [],
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
    case 'repeat.create': {
      if (node.repeatTemplateId) throw Error('Select a cell rather than an existing grid');
      const grid = NodeSchema.parse({
        id: uid(),
        pageId: node.pageId,
        parentId: node.parentId,
        kind: 'frame',
        name: node.name + ' Grid',
        x: node.x,
        y: node.y,
        width: op.columns * (node.width + 16) - 16,
        height: Math.ceil(op.count / op.columns) * (node.height + 16) - 16,
        layout: 'grid',
        columns: op.columns,
        padding: 0,
        repeatTemplateId: id,
        order: node.order,
      });
      node.x = 0;
      node.y = 0;
      node.parentId = grid.id;
      node.repeatIndex = 0;
      node.order = 0;
      for (let i = 1; i < op.count; i++) {
        const clones = cloneTree(doc, id, {
          pageId: node.pageId,
          parentId: grid.id,
          x: 0,
          y: 0,
          linked: true,
        });
        clones[0].order = i;
        clones[0].repeatIndex = i;
        doc.nodes.push(...clones);
      }
      doc.nodes.push(grid);
      ids.push(grid.id);
      return true;
    }
    case 'repeat.populate': {
      if (!node.repeatTemplateId) throw Error('Select a Repeat Grid');
      const cells = doc.nodes
        .filter((n) => n.parentId === id)
        .sort((a, b) => (a.repeatIndex ?? 0) - (b.repeatIndex ?? 0));
      if (op.values.length > cells.length) throw Error('More data rows than grid cells');
      cells.forEach((cell, index) => {
        if (index >= op.values.length) return;
        const target = subtree(doc, cell.id).find((n) =>
          ['text', 'button', 'input'].includes(n.kind),
        );
        if (!target) throw Error('Each cell needs a text-bearing element');
        target.text = op.values[index];
        if (target.componentId && !target.overrides.includes('text')) target.overrides.push('text');
      });
      return true;
    }
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
          source.isComponent && Object.hasOwn(source.variants[n.variantName] ?? {}, key);
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
