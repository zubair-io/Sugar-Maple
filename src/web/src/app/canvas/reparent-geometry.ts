import { DocumentStore } from '../model/store';
import { uid, type Operation, type SceneDocument, type SceneNode } from '../model/schema';
import { flatten, inverse, project, transform, type Item, type Measure } from './scene-layout';

export type ReparentPlacement = 'preserve-world' | 'layout';
export interface ReparentRequest {
  documentId: string;
  expectedRevision: number;
  ids: string[];
  parentId: string | null;
  placement: ReparentPlacement;
}
export interface ReparentPlan {
  operations: Operation[];
  warnings: string[];
  names: string[];
  destination: string;
}
const identity = [1, 0, 0, 1, 0, 0] as const;
const angle = (item?: Item) => item ? Math.atan2(item.transform[1], item.transform[0]) * 180 / Math.PI : 0;
const normalizedAngle = (degrees: number) => ((degrees + 180) % 360 + 360) % 360 - 180;
function corners(item: Item) {
  return [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) =>
    transform(item.transform, item.x + item.width * x, item.y + item.height * y));
}

/** Derive explicit authored patches from settled geometry; never write camera coordinates. */
export function planReparent(
  doc: SceneDocument, request: ReparentRequest, measure: Measure,
  viewport = { width: 1000, height: 800 },
): ReparentPlan {
  if (request.documentId !== doc.id) throw Error('Wrong document');
  const nodes = new Map(doc.nodes.map(node => [node.id, node]));
  const requested = new Set(request.ids);
  if (!requested.size || requested.size !== request.ids.length) throw Error('Select distinct layers to move');
  const selected = request.ids.map(id => {
    const node = nodes.get(id);
    if (!node) throw Error('Node not found');
    return node;
  });
  const pageId = selected[0].pageId;
  if (selected.some(node => node.pageId !== pageId)) throw Error('Moved layers must be on the same page');
  const parents = (node: SceneNode) => {
    const result: SceneNode[] = [];
    let parent = nodes.get(node.parentId ?? '');
    while (parent) { result.push(parent); parent = nodes.get(parent.parentId ?? ''); }
    return result;
  };
  const roots = selected.filter(node => !parents(node).some(parent => requested.has(parent.id)));
  const target = request.parentId ? nodes.get(request.parentId) : undefined;
  if (request.parentId && (!target || target.pageId !== pageId || !['frame', 'artboard'].includes(target.kind)))
    throw Error('Choose a frame or artboard on the same page');
  if (target && [target, ...parents(target)].some(node => requested.has(node.id))) throw Error('Parent cycle');
  if (roots.some(node => [node, ...parents(node)].some(parent => parent.locked || parent.hidden)) ||
      target && [target, ...parents(target)].some(node => node.locked || node.hidden))
    throw Error('Unlock and show the moved layers and their parents first');
  const plan: ReparentPlan = {
    operations: [], warnings: [], names: roots.map(node => node.name), destination: target?.name ?? 'Page root',
  };
  const moved = roots.filter(node => node.parentId !== request.parentId);
  if (!moved.length) return plan;
  if (request.placement === 'preserve-world' && target && target.layout !== 'free')
    throw Error('This parent controls child positions. Choose Keep layout rules to move into its flow.');
  const before = new Map(flatten(project(doc, pageId, measure, viewport)).map(item => [item.node.id, item]));
  const working = structuredClone(doc);
  const rootIds = new Set(moved.map(node => node.id));
  const siblings = doc.nodes.filter(node => node.pageId === pageId && node.parentId === request.parentId && !rootIds.has(node.id))
    .sort((a, b) => a.order - b.order);
  const lastOrder = Math.max(-1, ...siblings.map(node => node.order));
  const reindex = lastOrder + moved.length > 100000;
  // Usually append without touching existing children. Reindex only at the limit.
  const patches = new Map<string, Partial<SceneNode>>();
  if (reindex) siblings.forEach((node, order) => { if (node.order !== order) patches.set(node.id, { order }); });
  moved.forEach((node, index) => {
    const patch: Partial<SceneNode> = { parentId: request.parentId, order: (reindex ? siblings.length : lastOrder + 1) + index };
    if (request.placement === 'preserve-world') {
      const item = before.get(node.id);
      if (!item) throw Error('Moved layer geometry is not available');
      patch.width = item.width; patch.height = item.height;
      patch.widthMode = 'fixed'; patch.heightMode = 'fixed';
      if (node.widthMode !== 'fixed' || node.heightMode !== 'fixed')
        plan.warnings.push(`${node.name}: responsive sizing becomes fixed at its current rendered size.`);
    }
    patches.set(node.id, patch);
  });
  const apply = () => { working.nodes = doc.nodes.map(node => ({ ...node, ...patches.get(node.id) })); };
  apply();
  if (request.placement === 'preserve-world') {
    const provisional = new Map(flatten(project(working, pageId, measure, viewport)).map(item => [item.node.id, item]));
    const parent = target ? provisional.get(target.id) : undefined;
    if (target && !parent) throw Error('Destination geometry is not available');
    for (const node of moved) {
      const original = before.get(node.id)!;
      const center = transform(original.transform, original.x + original.width / 2, original.y + original.height / 2);
      const local = inverse(parent?.transform ?? identity, center.x, center.y);
      Object.assign(patches.get(node.id)!, {
        x: local.x - (parent?.x ?? 0) - (target?.strokeWidth ?? 0) - original.width / 2,
        y: local.y - (parent?.y ?? 0) - (target?.strokeWidth ?? 0) - original.height / 2,
        rotation: normalizedAngle(angle(original) - angle(parent)),
      });
    }
    apply();
    if (target) plan.warnings.push('The new parent clips content outside its bounds.');
  } else plan.warnings.push('The destination layout and existing local size/position rules determine the new placement.');
  plan.operations = [...patches].map(([id, patch]) => ({ type: 'node.update', id, patch }));
  if (plan.operations.length > 500)
    throw Error('This move exceeds the 500-update atomic transaction limit. Reduce the selection or normalize destination sibling order first.');
  // Use the same validation and component/Repeat Grid propagation as the real command.
  // A rejected plan does not mutate the live document or its history.
  const preview = new DocumentStore(doc);
  preview.transact({ documentId: doc.id, expectedRevision: 0, requestId: uid(), operations: plan.operations });
  if (request.placement === 'preserve-world') {
    const after = new Map(flatten(project(preview.document, pageId, measure, viewport)).map(item => [item.node.id, item]));
    for (const original of before.values()) {
      if (!rootIds.has(original.node.id) && !original.ancestors.some(parent => rootIds.has(parent.node.id))) continue;
      const current = after.get(original.node.id);
      if (!current || corners(original).some((point, index) => {
        const next = corners(current)[index];
        return Math.hypot(point.x - next.x, point.y - next.y) > 1e-5;
      })) throw Error('This move changes descendant layout. Choose Keep layout rules or use a free fixed-size destination.');
    }
  }
  return plan;
}
