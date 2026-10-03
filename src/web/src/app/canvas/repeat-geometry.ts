import type { SceneDocument, SceneNode, Operation } from '../model/schema';
import { subtree } from '../model/composition';
import { repeatCells, repeatGeometry } from '../model/repeat';
import { transform, type Item } from './scene-layout';

export type RepeatHandle = 'columns' | 'rows' | 'gap';
export interface RepeatSize {
  id: string;
  rows: number;
  columns: number;
  gap: number;
  count: number;
}
export interface RepeatDraft extends RepeatSize {
  namespace: string;
  preserveCount?: boolean;
  source?: { documentId: string; pageId: string; revision: number };
}
export function repeatMetrics(doc: SceneDocument, grid: SceneNode) {
  const template = doc.nodes.find((n) => n.id === grid.repeatTemplateId),
    cells = repeatCells(doc, grid.id);
  if (!template || !cells.length) throw Error('Select a Repeat Grid');
  return {
    template,
    cells,
    rows: Math.ceil(cells.length / grid.columns),
    columns: grid.columns,
    gap: grid.gap,
  };
}
export function supportsRepeatHandles(doc: SceneDocument, grid: SceneNode) {
  const template = doc.nodes.find((n) => n.id === grid.repeatTemplateId);
  return (
    !!template &&
    grid.widthMode === 'fixed' &&
    grid.heightMode === 'fixed' &&
    template.widthMode === 'fixed' &&
    template.heightMode === 'fixed' &&
    template.width > 0 &&
    template.height > 0
  );
}
export function repeatLimit(
  doc: SceneDocument,
  grid: SceneNode,
  size: RepeatSize,
  kind: RepeatHandle,
) {
  const { template } = repeatMetrics(doc, grid),
    inset = 2 * (grid.padding + grid.strokeWidth);
  if (kind === 'columns')
    return Math.max(
      1,
      Math.min(
        20,
        Math.floor(100 / size.rows),
        Math.floor((10000 - inset + size.gap) / (template.width + size.gap)),
      ),
    );
  if (kind === 'rows')
    return Math.max(
      1,
      Math.min(
        100,
        Math.floor(100 / size.columns),
        Math.floor((10000 - inset + size.gap) / (template.height + size.gap)),
      ),
    );
  return Math.max(
    0,
    Math.min(
      1000,
      size.columns > 1
        ? (10000 - inset - size.columns * template.width) / (size.columns - 1)
        : 1000,
      size.rows > 1 ? (10000 - inset - size.rows * template.height) / (size.rows - 1) : 1000,
    ),
  );
}
export function repeatSize(doc: SceneDocument, grid: SceneNode): RepeatSize {
  const { rows, columns, gap } = repeatMetrics(doc, grid);
  return { id: grid.id, rows, columns, gap, count: repeatCells(doc, grid.id).length };
}
export function resizeRepeat(
  doc: SceneDocument,
  grid: SceneNode,
  original: RepeatSize,
  kind: RepeatHandle,
  delta: number,
): RepeatSize {
  const { template } = repeatMetrics(doc, grid),
    limit = repeatLimit(doc, grid, original, kind);
  const value =
    kind === 'gap'
      ? original.gap + delta
      : original[kind] +
        Math.round(
          delta / ((kind === 'columns' ? template.width : template.height) + original.gap),
        );
  return { ...original, [kind]: Math.max(kind === 'gap' ? 0 : 1, Math.min(limit, value)) };
}
export function repeatOperation(size: RepeatSize, preserveCount = false): Operation {
  return {
    type: 'repeat.resize',
    id: size.id,
    rows: size.rows,
    columns: size.columns,
    gap: size.gap,
    anchor: 'top-left',
    ...(preserveCount ? { count: size.count } : {}),
  };
}
export function repeatHandlePoint(
  item: Item,
  template: SceneNode,
  size: RepeatSize,
  kind: RepeatHandle,
) {
  const inset = item.node.padding + item.node.strokeWidth;
  const x =
    kind === 'columns'
      ? item.x + item.width
      : kind === 'rows'
        ? item.x + item.width / 2
        : size.columns > 1
          ? item.x + inset + template.width + size.gap / 2
          : item.x + inset + template.width / 2;
  const y =
    kind === 'rows'
      ? item.y + item.height
      : kind === 'columns'
        ? item.y + item.height / 2
        : size.columns > 1
          ? item.y + inset + template.height / 2
          : item.y + inset + template.height + size.gap / 2;
  return transform(item.transform, x, y);
}
/** Ephemeral new cells are derived from the template, never written to the store. */
export function repeatPreviewNodes(doc: SceneDocument, draft: RepeatDraft): SceneNode[] {
  const grid = doc.nodes.find((n) => n.id === draft.id);
  // A synchronous agent delete can invalidate this draft before effects cancel the gesture.
  if (!grid || !doc.nodes.some((n) => n.id === grid.repeatTemplateId)) return doc.nodes;
  const cells = repeatCells(doc, grid.id),
    count = draft.preserveCount ? draft.count : draft.rows * draft.columns;
  const removed = new Set(
    cells.slice(count).flatMap((cell) => subtree(doc, cell.id).map((n) => n.id)),
  );
  const result = doc.nodes
    .filter((n) => !removed.has(n.id))
    .map((n) =>
      n.id === grid.id
        ? { ...n, ...repeatGeometry(doc, grid, draft.rows, draft.columns, draft.gap, 'top-left') }
        : n,
    );
  const tree = subtree(doc, grid.repeatTemplateId!),
    template = tree.find((n) => n.id === grid.repeatTemplateId)!;
  const ordered = [template, ...tree.filter((n) => n !== template)];
  for (let cell = cells.length; cell < count; cell++) {
    const ids = new Map(
      ordered.map((n, index) => [n.id, `repeat-draft-${draft.namespace}-${cell}-${index}`]),
    );
    result.push(
      ...ordered.map((n) => ({
        ...n,
        id: ids.get(n.id)!,
        parentId: n === template ? grid.id : ids.get(n.parentId!)!,
        x: n === template ? 0 : n.x,
        y: n === template ? 0 : n.y,
        hidden: n === template ? false : n.hidden,
        isComponent: false,
        componentId: n.id,
        variants: {},
        overrides: n === template ? ['hidden'] : [],
        repeatIndex: n === template ? cell : n.repeatIndex,
        order: n === template ? cell : n.order,
        targetId: n.targetId ? (ids.get(n.targetId) ?? n.targetId) : null,
        // Valid nested templates are owned children inside this subtree. Match cloneTree:
        // unlike targetId, a Repeat Grid cannot reference an external template.
        repeatTemplateId: n.repeatTemplateId ? (ids.get(n.repeatTemplateId) ?? null) : null,
      })),
    );
  }
  return result;
}
