import type { SceneNode } from './schema';

// Input order is the editor's authored layer order. Indexed traversal visits each edge once.
export function layerRows<T extends Pick<SceneNode, 'id' | 'parentId' | 'name'>>(
  nodes: readonly T[], search: string,
): { node: T; depth: number }[] {
  const byId = new Map<string, T>(), children = new Map<string | null, T[]>();
  for (const node of nodes) {
    byId.set(node.id, node);
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  const query = search.trim().toLowerCase(), visible = new Set<string>();
  if (query) for (const node of nodes) {
    if (!node.name.toLowerCase().includes(query)) continue;
    let current: T | undefined = node;
    while (current && !visible.has(current.id)) {
      visible.add(current.id);
      current = byId.get(current.parentId ?? '');
    }
  }
  const rows: { node: T; depth: number }[] = [];
  const stack = (children.get(null) ?? []).map(node => ({ node, depth: 0 })).reverse();
  while (stack.length) {
    const row = stack.pop()!;
    if (query && !visible.has(row.node.id)) continue;
    rows.push(row);
    const siblings = children.get(row.node.id) ?? [];
    for (let i = siblings.length - 1; i >= 0; i--)
      stack.push({ node: siblings[i], depth: row.depth + 1 });
  }
  return rows;
}
