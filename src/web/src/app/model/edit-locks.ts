import type { Operation, SceneDocument, SceneNode } from './schema';

/** Authoring locks protect direct human edits, including descendants of locked frames.
 * They do not freeze tokens/component propagation or restrict explicit agent transactions. */
export function lockingNode(nodes: ReadonlyMap<string, SceneNode>, id: string | null): SceneNode | null {
  let node = nodes.get(id ?? '');
  while (node) {
    if (node.locked) return node;
    node = nodes.get(node.parentId ?? '');
  }
  return null;
}

export function assertHumanEdits(document: SceneDocument, operations: Operation[]): void {
  const nodes = new Map(document.nodes.map(node => [node.id, node]));
  let children: Map<string, SceneNode[]> | undefined;
  const requireUnlocked = (id: string | null) => {
    const owner = lockingNode(nodes, id);
    if (owner) throw Error(`Unlock "${owner.name}" before editing this layer.`);
  };
  const requireRemovable = (id: string) => {
    requireUnlocked(id);
    if (!children) {
      children = new Map();
      for (const node of document.nodes) {
        if (!node.parentId) continue;
        const list = children.get(node.parentId) ?? [];
        list.push(node); children.set(node.parentId, list);
      }
    }
    const stack = [...(children.get(id) ?? [])];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.locked) throw Error(`Unlock "${node.name}" before deleting its container.`);
      stack.push(...(children.get(node.id) ?? []));
    }
  };
  for (const operation of operations) {
    switch (operation.type) {
      case 'node.add': requireUnlocked(operation.node.parentId ?? null); break;
      case 'node.update': {
        const keys = Object.keys(operation.patch);
        // Named layer visibility/lock controls remain usable even under a locked parent.
        if (keys.length && keys.every(key => key === 'locked' || key === 'hidden')) break;
        requireUnlocked(operation.id);
        if (operation.patch.parentId) requireUnlocked(operation.patch.parentId);
        break;
      }
      case 'node.remove': requireRemovable(operation.id); break;
      case 'page.remove': {
        const locked = document.nodes.find(node => node.pageId === operation.id && node.locked);
        if (locked) throw Error(`Unlock "${locked.name}" before deleting its page.`);
        break;
      }
      case 'component.create': case 'component.variant': case 'component.reset': case 'component.detach':
      case 'repeat.create': case 'repeat.prepare': case 'repeat.resize': case 'repeat.populate': case 'repeat.import':
      case 'library.props': case 'library.reset': case 'library.remap':
        requireUnlocked(operation.id); break;
      default: break; // Read/copy insertion, registries, feedback and file metadata are independent.
    }
  }
}
