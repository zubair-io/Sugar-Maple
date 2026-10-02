import { NodeSchema, uid, type SceneDocument, type SceneNode, type Operation } from './schema';
import { cloneTree, subtree } from './composition';

export function repeatCells(doc: SceneDocument, gridId: string) {
  return doc.nodes
    .filter((n) => n.parentId === gridId && n.repeatIndex !== null)
    .sort((a, b) => a.repeatIndex! - b.repeatIndex!);
}
/** Command and temporary Canvas preview share the same resolved grid extent. */
export function repeatGeometry(
  doc: SceneDocument,
  grid: SceneNode,
  rows: number,
  columns: number,
  gap = grid.gap,
  anchor: 'position' | 'top-left' = 'position',
) {
  const template = doc.nodes.find((n) => n.id === grid.repeatTemplateId);
  if (!template) throw Error('Missing Repeat Grid template');
  const inset = grid.padding + grid.strokeWidth;
  const width = columns * template.width + (columns - 1) * gap + 2 * inset,
    height = rows * template.height + (rows - 1) * gap + 2 * inset;
  let x = grid.x,
    y = grid.y;
  const parent = doc.nodes.find((n) => n.id === grid.parentId);
  if (anchor === 'top-left' && (!parent || parent.layout === 'free')) {
    const angle = (grid.rotation * Math.PI) / 180,
      c = Math.cos(angle),
      s = Math.sin(angle),
      dw = width - grid.width,
      dh = height - grid.height;
    x += (c * dw - s * dh - dw) / 2;
    y += (s * dw + c * dh - dh) / 2;
  }
  return { x, y, width, height, gap, columns };
}
export function repeatTargets(doc: SceneDocument, gridId: string) {
  const grid = doc.nodes.find((n) => n.id === gridId);
  if (!grid?.repeatTemplateId) throw Error('Select a Repeat Grid');
  return subtree(doc, grid.repeatTemplateId).flatMap<{
    id: string;
    name: string;
    property: 'asset' | 'text' | 'initialValue';
  }>((n) =>
    n.kind === 'image'
      ? [{ id: n.id, name: n.name, property: 'asset' as const }]
      : n.kind === 'input'
        ? [
            { id: n.id, name: n.name, property: 'initialValue' as const },
            { id: n.id, name: n.name + ' placeholder', property: 'text' as const },
          ]
        : ['text', 'button'].includes(n.kind)
          ? [{ id: n.id, name: n.name, property: 'text' as const }]
          : [],
  );
}
/** Upgrade a legacy first-cell template only inside the user's undoable command. */
function prepare(doc: SceneDocument, grid: SceneNode) {
  const source = doc.nodes.find((n) => n.id === grid.repeatTemplateId);
  if (!source) throw Error('Missing Repeat Grid template');
  if (source.hidden && source.repeatIndex === null && source.isComponent)
    return new Map<string, string>();
  const original = [source, ...subtree(doc, source.id).filter((n) => n.id !== source.id)];
  const template = cloneTree(doc, source.id, {
    pageId: grid.pageId,
    parentId: grid.id,
    x: 0,
    y: 0,
    linked: false,
  });
  const mapping = new Map(original.map((n, i) => [n.id, template[i].id]));
  template[0].hidden = true;
  template[0].isComponent = true;
  template[0].repeatIndex = null;
  template[0].order = -1;
  grid.repeatTemplateId = template[0].id;
  for (const [index, cell] of repeatCells(doc, grid.id).entries()) {
    cell.repeatIndex = index;
    cell.order = index;
    for (const member of subtree(doc, cell.id)) {
      const old =
        member.id === source.id || mapping.has(member.id) ? member.id : member.componentId;
      if (old && mapping.has(old)) {
        member.componentId = mapping.get(old)!;
        member.isComponent = false;
        // Existing cell data is local, including the formerly shared first cell.
        member.overrides = [
          ...new Set([
            ...member.overrides,
            'text',
            'initialValue',
            'asset',
            ...(member.id === cell.id ? ['hidden'] : []),
          ]),
        ];
      }
    }
  }
  doc.nodes.push(...template);
  return mapping;
}
function appendCell(doc: SceneDocument, grid: SceneNode, index: number) {
  const template = doc.nodes.find((n) => n.id === grid.repeatTemplateId)!;
  const clones = cloneTree(doc, template.id, {
    pageId: grid.pageId,
    parentId: grid.id,
    x: 0,
    y: 0,
    linked: true,
  });
  clones[0].hidden = false;
  clones[0].overrides = ['hidden'];
  clones[0].repeatIndex = index;
  clones[0].order = index;
  doc.nodes.push(...clones);
}
export function applyRepeat(doc: SceneDocument, op: Operation, ids: string[]) {
  if (!op.type.startsWith('repeat.')) return false;
  const grid = doc.nodes.find((n) => n.id === (op as { id: string }).id);
  if (!grid) throw Error('Node not found');
  if (op.type === 'repeat.create') {
    if (
      grid.repeatTemplateId ||
      grid.kind === 'artboard' ||
      grid.isComponent ||
      grid.componentId ||
      grid.repeatIndex !== null
    )
      throw Error('Choose a plain cell layer; detach a component instance first');
    const container = NodeSchema.parse({
      id: uid(),
      pageId: grid.pageId,
      parentId: grid.parentId,
      kind: 'frame',
      name: grid.name + ' Grid',
      x: grid.x,
      y: grid.y,
      width: op.columns * (grid.width + 16) - 16,
      height: Math.ceil(op.count / op.columns) * (grid.height + 16) - 16,
      layout: 'grid',
      columns: op.columns,
      padding: 0,
      repeatTemplateId: grid.id,
      order: grid.order,
    });
    grid.x = 0;
    grid.y = 0;
    grid.parentId = container.id;
    grid.repeatIndex = 0;
    grid.order = 0;
    doc.nodes.push(container);
    // Preserve the first visible cell's IDs. New cells inherit a separate source.
    prepare(doc, container);
    // A new first cell has no imported data to protect yet.
    for (const n of subtree(doc, grid.id)) n.overrides = n.id === grid.id ? ['hidden'] : [];
    for (let i = 1; i < op.count; i++) appendCell(doc, container, i);
    ids.push(container.id);
    return true;
  }
  if (!grid.repeatTemplateId) throw Error('Select a Repeat Grid');
  if (op.type === 'repeat.prepare') {
    prepare(doc, grid);
    ids.push(grid.repeatTemplateId);
    return true;
  }
  if (op.type === 'repeat.resize') {
    const count = op.count ?? op.rows * op.columns;
    if (count > 100) throw Error('Repeat Grid supports at most 100 cells');
    if (count > op.rows * op.columns || Math.ceil(count / op.columns) !== op.rows)
      throw Error('Repeat Grid count must fit the declared rows with only the last row partial');
    prepare(doc, grid);
    const geometry = repeatGeometry(doc, grid, op.rows, op.columns, op.gap ?? grid.gap, op.anchor);
    const cells = repeatCells(doc, grid.id);
    const removed = new Set(
      cells.slice(count).flatMap((cell) => subtree(doc, cell.id).map((n) => n.id)),
    );
    doc.nodes = doc.nodes.filter((n) => !removed.has(n.id));
    for (const n of doc.nodes)
      if (n.componentId && removed.has(n.componentId)) {
        n.componentId = null;
        n.overrides = [];
      }
    for (let i = cells.length; i < count; i++) appendCell(doc, grid, i);
    Object.assign(grid, geometry);
    return true;
  }
  if (op.type === 'repeat.populate') {
    prepare(doc, grid);
    const cells = repeatCells(doc, grid.id);
    if (op.values.length > cells.length) throw Error('More data rows than grid cells');
    cells.slice(0, op.values.length).forEach((cell, index) => {
      const target = subtree(doc, cell.id).find((n) =>
        ['text', 'button', 'input'].includes(n.kind),
      );
      if (!target) throw Error('Each cell needs a text-bearing element');
      target.text = op.values[index];
      target.overrides = [...new Set([...target.overrides, 'text'])];
    });
    return true;
  }
  if (op.type === 'repeat.import') {
    const cells = repeatCells(doc, grid.id);
    if (op.rows.length > cells.length && !op.truncate)
      throw Error('More data rows than grid cells; explicitly allow truncation or resize the grid');
    const available = repeatTargets(doc, grid.id);
    const mapped = new Set<string>();
    for (const field of op.fields) {
      const key = field.targetId + ':' + field.property;
      if (mapped.has(key)) throw Error('A target property can only be mapped once');
      mapped.add(key);
      if (!available.some((t) => t.id === field.targetId && t.property === field.property))
        throw Error('Unknown or incompatible template target');
      if (!op.rows.some((row) => Object.hasOwn(row, field.field)))
        throw Error('Unknown data field: ' + field.field);
    }
    // Validate every supplied row, including rows deliberately truncated.
    for (const [index, row] of op.rows.entries())
      for (const field of op.fields) {
        const value = Object.hasOwn(row, field.field) ? row[field.field] : '';
        if (!value && op.missing === 'error')
          throw Error(`Row ${index + 1}: missing ${field.field}`);
        if (
          value &&
          field.property === 'asset' &&
          (!value.startsWith('asset:') || !Object.hasOwn(doc.assets, value.slice(6)))
        )
          throw Error(`Row ${index + 1}: missing local image for ${field.field}`);
        if (field.property === 'initialValue' && /[\r\n]/.test(value))
          throw Error(`Row ${index + 1}: input values must be single-line`);
      }
    const mapping = prepare(doc, grid);
    cells.forEach((cell, index) => {
      if (index >= op.rows.length) return;
      for (const field of op.fields) {
        const source = mapping.get(field.targetId) ?? field.targetId;
        const target = subtree(doc, cell.id).find((n) => n.componentId === source);
        if (!target) throw Error('Cell is missing its mapped template layer');
        const value = op.rows[index][field.field] ?? '';
        if (!value && op.missing === 'retain') continue;
        target[field.property] = value;
        target.overrides = [...new Set([...target.overrides, field.property])];
      }
    });
    return true;
  }
  return false;
}
