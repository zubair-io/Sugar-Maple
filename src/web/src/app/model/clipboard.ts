import { assetSource } from './assets';
import { sameManifest, type LibraryManifest } from './library-schema';
import { subtree } from './composition';
import { uid, validateDocument, type SceneDocument, type SceneNode, type Operation } from './schema';

export function editablePayload(doc: SceneDocument, id: string) {
  const nodes = subtree(doc, id), selected = new Set(nodes.map(n => n.id));
  const dependencies = new Map<string, SceneNode>();
  const include = (sourceId: string) => {
    let source = doc.nodes.find(n => n.id === sourceId);
    if (!source) throw Error('Missing component dependency');
    // Child layers link to source layers inside a definition, so include the
    // containing tree rather than leaving a missing parent in the clipboard.
    while (!source.isComponent && source.parentId) source = doc.nodes.find(n => n.id === source!.parentId)!;
    for (const node of subtree(doc, source.id)) {
      if (selected.has(node.id) || dependencies.has(node.id)) continue;
      dependencies.set(node.id, node);
      if (node.componentId) include(node.componentId);
    }
  };
  for (const n of nodes) if (n.componentId && !selected.has(n.componentId)) include(n.componentId);
  const references = new Set([...nodes, ...dependencies.values()].map(n => n.asset).filter(a => a?.startsWith('asset:')).map(a => a.slice(6)));
  const assets = Object.fromEntries([...references].map(key => [key, assetSource(doc, 'asset:' + key)]));
  const libraryKeys = new Set([...nodes, ...dependencies.values()].flatMap(n => n.libraryRef ? [n.libraryRef.key] : []));
  const libraries = Object.fromEntries([...libraryKeys].filter(key => Object.hasOwn(doc.libraries, key)).map(key => [key, doc.libraries[key]]));
  return { libraries, assets, format: 'sugar-maple-elements', version: 2, sourceDocumentId: doc.id, rootId: id, nodes, dependencies: [...dependencies.values()], tokens: doc.tokens };
}

export function pasteElements(doc: SceneDocument, pageId: string, text: string): { operations: Operation[]; rootId: string } {
  const value = JSON.parse(text);
  if (value.format !== 'sugar-maple-elements' || ![1, 2].includes(value.version) || !Array.isArray(value.nodes) || !value.nodes.length)
    throw Error('Clipboard does not contain supported editable Sugar Maple elements');
  const source: SceneNode[] = value.nodes, dependencies: SceneNode[] = value.dependencies ?? [];
  if (!Array.isArray(dependencies) || source.length + dependencies.length > 450)
    throw Error('Clipboard exceeds the atomic paste limit of 450 nodes');
  const all = [...source, ...dependencies], sourceIds = new Set(source.map(n => n.id));
  const allIds = new Set(all.map(n => n.id));
  const root = source.find(n => n.id === value.rootId) ?? source.find(n => !sourceIds.has(n.parentId ?? ''));
  if (!root) throw Error('Clipboard root is missing');
  // Validate the complete dependency closure before producing any mutations.
  // Older incomplete payloads fail explicitly instead of silently detaching.
  validateDocument({ version: 1, id: uid(), name: 'Clipboard', comments: [], folders: [],
    pages: [...new Set(all.map(n => n.pageId))].map((id, order) => ({ id, name: 'Source', order })),
    nodes: all.map(n => ({ ...n, parentId: allIds.has(n.parentId ?? '') ? n.parentId : null,
      targetId: allIds.has(n.targetId ?? '') ? n.targetId : null })), tokens: value.tokens ?? {}, assets: value.assets ?? {}, libraries: value.libraries ?? {} });
  const reuse = value.sourceDocumentId === doc.id && dependencies.every(n => doc.nodes.some(d => d.id === n.id));
  const ids = new Map(all.map(n => [n.id, reuse && !sourceIds.has(n.id) ? n.id : uid()]));
  const operations: Operation[] = Object.entries(value.assets ?? {}).filter(([key]) => !Object.hasOwn(doc.assets, key)).map(([key, source]) => ({ type: 'asset.set', key, source: source as string })), tokens = new Map<string, string>();
  for (const [name, color] of Object.entries(value.tokens ?? {})) {
    let imported = name, suffix = 1;
    while (Object.hasOwn(doc.tokens, imported) && doc.tokens[imported] !== color) imported = `${name}_copy${suffix++}`;
    tokens.set(name, imported);
    operations.push({ type: 'token.set', name: imported, value: color as string });
  }
  for (const [key, manifest] of Object.entries(value.libraries ?? {})) {
    if (Object.hasOwn(doc.libraries, key) && !sameManifest(doc.libraries[key], manifest as LibraryManifest)) throw Error('Clipboard pinned library/version collision');
    if (!Object.hasOwn(doc.libraries, key)) operations.push({ type: 'library.import', manifest: manifest as LibraryManifest });
  }
  let definitionsPage = pageId;
  if (dependencies.length && !reuse) {
    definitionsPage = uid();
    operations.push({ type: 'page.add', id: definitionsPage, name: 'Imported components' });
  }
  const remap = (n: SceneNode, selected: boolean): SceneNode => ({ ...n, id: ids.get(n.id)!,
    pageId: selected ? pageId : definitionsPage,
    parentId: ids.get(n.parentId ?? '') ?? null,
    componentId: n.componentId ? ids.get(n.componentId)! : null,
    targetId: ids.get(n.targetId ?? '') ?? null,
    repeatTemplateId: ids.get(n.repeatTemplateId ?? '') ?? null,
    fillToken: tokens.get(n.fillToken) ?? n.fillToken,
    libraryRef: n.libraryRef ? { ...n.libraryRef, tokenBindings: Object.fromEntries(Object.entries({ ...(value.libraries?.[n.libraryRef.key]?.tokenMappings ?? {}), ...n.libraryRef.tokenBindings }).map(([variable, name]) => [variable, tokens.get(name as string) ?? name as string])) } : null,
    variants: Object.fromEntries(Object.entries(n.variants).map(([name, patch]) => [name, { ...patch,
      ...(patch.fillToken !== undefined ? { fillToken: tokens.get(patch.fillToken) ?? patch.fillToken } : {}) }])),
    x: n.id === root.id ? n.x + 24 : n.x,
    y: n.id === root.id ? n.y + 24 : n.y });
  if (!reuse) for (const n of dependencies) operations.push({ type: 'node.add', node: remap(n, false) });
  for (const n of source) {
    const node = remap(n, true);
    if (n.id === root.id) node.parentId = null;
    operations.push({ type: 'node.add', node });
  }
  if (operations.length > 500) throw Error('Clipboard exceeds the atomic paste limit of 500 operations');
  return { operations, rootId: ids.get(root.id)! };
}
