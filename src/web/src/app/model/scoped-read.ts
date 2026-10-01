import { type SceneDocument, type SceneNode } from './schema';
import { READ_LIMITS, type ScopedReadQuery } from './read-contract';
import { ToolFailure } from './tool-contract';

type Range = { start: number; end: number };
type Index = {
  byId: Map<string, SceneNode>;
  ordered: SceneNode[];
  ranges: Map<string, Range>;
  pages: Map<string, Range>;
};
const indexes = new WeakMap<SceneDocument, Index>();
const compare = (a: { order: number; id: string }, b: { order: number; id: string }) =>
  a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
// The editor publishes a new immutable projection on each revision. Build once
// for that projection; subsequent reads traverse only requested ranges/references.
function indexFor(doc: SceneDocument): Index {
  const cached = indexes.get(doc);
  if (cached) return cached;
  const index: Index = {
    byId: new Map(doc.nodes.map((n) => [n.id, n])),
    ordered: [],
    ranges: new Map(),
    pages: new Map(),
  };
  const children = new Map<string, SceneNode[]>();
  for (const node of doc.nodes) {
    const key = node.parentId ?? `page:${node.pageId}`;
    const list = children.get(key) ?? [];
    list.push(node);
    children.set(key, list);
  }
  for (const list of children.values()) list.sort(compare);
  for (const page of [...doc.pages].sort(compare)) {
    const start = index.ordered.length;
    const stack = [...(children.get(`page:${page.id}`) ?? [])]
      .reverse()
      .map((node) => ({ node, exit: false }));
    while (stack.length) {
      const { node, exit } = stack.pop()!;
      if (exit) {
        index.ranges.get(node.id)!.end = index.ordered.length;
        continue;
      }
      index.ranges.set(node.id, { start: index.ordered.length, end: 0 });
      index.ordered.push(node);
      stack.push({ node, exit: true });
      for (const child of [...(children.get(node.id) ?? [])].reverse())
        stack.push({ node: child, exit: false });
    }
    index.pages.set(page.id, { start, end: index.ordered.length });
  }
  indexes.set(doc, index);
  return index;
}
export function discoverEditor(
  doc: SceneDocument,
  revision: number,
  pageId: string,
  selectionIds: string[],
) {
  const index = indexFor(doc);
  return {
    readVersion: 1 as const,
    documentId: doc.id,
    revision,
    name: doc.name,
    pageId,
    selectionIds: [...selectionIds],
    nodeCount: doc.nodes.length,
    pages: doc.pages.map((page) => ({
      ...page,
      nodeCount: index.pages.get(page.id)!.end - index.pages.get(page.id)!.start,
    })),
    folders: doc.folders,
    reads: {
      scopes: ['document', 'page', 'subtree', 'selection'],
      ordering: 'page-order then depth-first sibling-order/id',
      ...READ_LIMITS,
    },
    capture: {
      coordinateUnits: 'CSS pixels in the editor WebView',
      scales: [0.5, 1, 2],
      maxPixelDimension: 4096,
      maxPixels: 16777216,
      throttleMilliseconds: 100,
    },
  };
}
export function readScope(
  doc: SceneDocument,
  revision: number,
  query: ScopedReadQuery,
  currentSelection: string[],
) {
  if (query.documentId !== doc.id) throw Error('Wrong document');
  if (query.expectedRevision !== revision) throw Error('Stale revision');
  const index = indexFor(doc);
  let rootIds: string[] = [],
    ranges: Range[] = [];
  if (query.scope === 'document') {
    ranges = [{ start: 0, end: index.ordered.length }];
    rootIds = index.ordered.filter((n) => !n.parentId).map((n) => n.id);
  } else if (query.scope === 'page') {
    const range = index.pages.get(query.pageId);
    if (!range) throw new ToolFailure('not_found', 'Page not found');
    ranges = [range];
    rootIds = index.ordered
      .slice(range.start, range.end)
      .filter((n) => !n.parentId)
      .map((n) => n.id);
  } else {
    if (query.scope === 'selection' && query.offset > 0 && query.selectionIds === undefined)
      throw new ToolFailure(
        'invalid_input',
        'Paginated selection reads require the selectionIds snapshot returned as rootIds.',
      );
    const ids =
      query.scope === 'subtree' ? [query.nodeId] : (query.selectionIds ?? currentSelection);
    const candidates = [...new Set(ids)]
      .map((id) => {
        const range = index.ranges.get(id);
        if (!range) throw new ToolFailure('not_found', `Node not found: ${id}`);
        return { id, ...range };
      })
      .sort((a, b) => a.start - b.start);
    let previousEnd = -1;
    for (const candidate of candidates)
      if (candidate.start >= previousEnd) {
        rootIds.push(candidate.id);
        ranges.push(candidate);
        previousEnd = candidate.end;
      }
  }
  const total = ranges.reduce((count, range) => count + range.end - range.start, 0);
  if (query.offset > total)
    throw new ToolFailure('invalid_input', 'Offset exceeds the scope node count');
  let skip = query.offset,
    remaining = query.limit;
  const nodes: SceneNode[] = [];
  for (const range of ranges) {
    const size = range.end - range.start;
    if (skip >= size) {
      skip -= size;
      continue;
    }
    const take = Math.min(remaining, size - skip);
    nodes.push(...index.ordered.slice(range.start + skip, range.start + skip + take));
    remaining -= take;
    skip = 0;
    if (!remaining) break;
  }
  const ancestors = new Map<string, SceneNode>(),
    components = new Map<string, SceneNode>(),
    tokens: Record<string, string> = Object.create(null);
  const returned = new Set(nodes.map((n) => n.id));
  for (const node of nodes) {
    let parentId = node.parentId;
    while (parentId && !returned.has(parentId) && !ancestors.has(parentId)) {
      const parent = index.byId.get(parentId)!;
      ancestors.set(parentId, parent);
      parentId = parent.parentId;
    }
  }
  for (const node of [...nodes, ...ancestors.values()]) {
    if (node.componentId) {
      const master = index.byId.get(node.componentId);
      if (master) components.set(master.id, master);
    }
    for (const name of [
      node.fillToken,
      ...Object.values(node.variants).map((variant) => variant.fillToken),
    ])
      if (name && Object.hasOwn(doc.tokens, name)) tokens[name] = doc.tokens[name];
  }
  const pageIds = new Set([...nodes, ...ancestors.values()].map((n) => n.pageId));
  for (const master of components.values()) pageIds.add(master.pageId);
  const value = {
    readVersion: 1 as const,
    documentId: doc.id,
    revision,
    scope: query.scope,
    rootIds,
    nodes,
    total,
    offset: query.offset,
    nextOffset: query.offset + nodes.length < total ? query.offset + nodes.length : null,
    references: {
      ancestors: [...ancestors.values()],
      components: [...components.values()].map(({ id, pageId, name }) => ({ id, pageId, name })),
      tokens,
      libraries: Object.fromEntries([...new Set([...nodes, ...ancestors.values()].flatMap(n => n.libraryRef ? [n.libraryRef.key] : []))].filter(key => Object.hasOwn(doc.libraries, key)).map(key => [key, doc.libraries[key]])),
      assets: Object.fromEntries([...new Set([...nodes, ...ancestors.values()].map(n=>n.asset).filter(a=>a.startsWith('asset:')).map(a=>a.slice(6)))].map(key=>[key,doc.assets[key]])),
      pages: doc.pages.filter((p) => pageIds.has(p.id)),
    },
  };
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > READ_LIMITS.maxResponseBytes)
    throw new ToolFailure(
      'response_too_large',
      'Scoped read exceeds 16 MiB. Reduce limit or request a smaller subtree.',
    );
  return value;
}
