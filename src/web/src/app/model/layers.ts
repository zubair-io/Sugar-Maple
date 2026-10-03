import type { SceneNode } from './schema';

// Input order is the editor's authored layer order. Indexed traversal visits each edge once.
export function layerRows<T extends Pick<SceneNode, 'id' | 'parentId' | 'name'>>(
  nodes: readonly T[],
  search: string,
  collapsed: ReadonlySet<string> = new Set(),
): { node: T; depth: number; position: number; size: number }[] {
  const byId = new Map<string, T>(),
    children = new Map<string | null, T[]>();
  for (const node of nodes) {
    byId.set(node.id, node);
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  const query = search.trim().toLowerCase(),
    visible = new Set<string>();
  if (query)
    for (const node of nodes) {
      if (!node.name.toLowerCase().includes(query)) continue;
      let current: T | undefined = node;
      while (current && !visible.has(current.id)) {
        visible.add(current.id);
        current = byId.get(current.parentId ?? '');
      }
    }
  const rows: { node: T; depth: number; position: number; size: number }[] = [];
  const siblingsOf = (id: string | null) =>
    (children.get(id) ?? []).filter((node) => !query || visible.has(node.id));
  const roots = siblingsOf(null);
  const stack = roots
    .map((node, i) => ({ node, depth: 0, position: i + 1, size: roots.length }))
    .reverse();
  while (stack.length) {
    const row = stack.pop()!;
    if (query && !visible.has(row.node.id)) continue;
    rows.push(row);
    const siblings = !query && collapsed.has(row.node.id) ? [] : siblingsOf(row.node.id);
    for (let i = siblings.length - 1; i >= 0; i--)
      stack.push({
        node: siblings[i],
        depth: row.depth + 1,
        position: i + 1,
        size: siblings.length,
      });
  }
  return rows;
}
