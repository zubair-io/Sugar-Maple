import { NodeSchema, uid, type Operation, type SceneDocument, type SceneNode } from './schema';
import {
  libraryKey,
  sameManifest,
  validateManifest,
  libraryProps,
  type LibraryReference,
  LibraryBindingSchema,
} from './library-schema';

function component(doc: SceneDocument, ref: LibraryReference) {
  const library = doc.libraries[ref.key];
  if (!library) throw Error('Library metadata is absent; semantic editing remains available');
  const c = library.components[ref.component];
  if (!c) throw Error('Unknown library component');
  return c;
}
export function applyLibraryProperties(doc: SceneDocument, node: SceneNode) {
  const ref = node.libraryRef!;
  const c = component(doc, ref),
    props = libraryProps(c, ref);
  const patch = Object.fromEntries(
    Object.entries(c.props).flatMap(([name, prop]) =>
      prop.semantic && !ref.localOverrides.includes(prop.semantic)
        ? [[prop.semantic, props[name]]]
        : [],
    ),
  );
  Object.assign(node, NodeSchema.parse({ ...node, ...patch }));
}
export function trackLibraryOverrides(node: SceneNode, patch: Partial<SceneNode>) {
  if (!node.libraryRef) return;
  const fields = LibraryBindingSchema.options;
  node.libraryRef = {
    ...node.libraryRef,
    localOverrides: [
      ...new Set([
        ...node.libraryRef.localOverrides,
        ...fields.filter(
          (field) =>
            Object.hasOwn(patch, field) ||
            (field === 'fill' &&
              (Object.hasOwn(patch, 'fillToken') || Object.hasOwn(patch, 'gradient'))),
        ),
      ]),
    ],
  };
}
export function applyLibrary(doc: SceneDocument, op: Operation, ids: string[]) {
  if (op.type === 'library.import') {
    const manifest = validateManifest(op.manifest),
      key = libraryKey(manifest),
      existing = doc.libraries[key];
    if (existing && !sameManifest(existing, manifest))
      throw Error('Pinned library/version collision; import a new version and remap explicitly');
    doc.libraries[key] = manifest;
    return true;
  }
  if (op.type === 'library.insert') {
    const library = doc.libraries[op.key],
      c = library?.components[op.component];
    if (!c) throw Error('Unknown library component');
    const node = NodeSchema.parse({
      id: op.id ?? uid(),
      pageId: op.pageId,
      kind: c.semanticKind,
      name: c.name,
      x: op.x,
      y: op.y,
      width: c.width,
      height: c.height,
      layout: c.semanticKind === 'frame' ? 'vertical' : 'free',
      order: doc.nodes.length,
      libraryRef: {
        key: op.key,
        component: op.component,
        props: op.props,
        variant: op.variant ?? c.defaultVariant,
        localOverrides: [],
        tokenBindings: {},
      },
    });
    applyLibraryProperties(doc, node);
    doc.nodes.push(node);
    ids.push(node.id);
    return true;
  }
  if (op.type !== 'library.props' && op.type !== 'library.remap' && op.type !== 'library.reset')
    return false;
  const node = doc.nodes.find((n) => n.id === op.id);
  if (!node?.libraryRef) throw Error('Select a library instance');
  if (op.type === 'library.props')
    node.libraryRef = {
      ...node.libraryRef,
      props: { ...node.libraryRef.props, ...op.props },
      variant: op.variant ?? node.libraryRef.variant,
    };
  if (op.type === 'library.reset') {
    // The insertion baseline is NodeSchema defaults plus pinned variant props.
    // Clearing flags alone leaves unrepresented style paint on the semantic node
    // while making mapped exporters believe those overrides disappeared.
    // Reset the supported baseline even for older saved instances whose reset
    // already cleared flags while leaving stale paint behind. History replays
    // stored deltas, so this does not reinterpret prior reset transactions.
    for (const field of LibraryBindingSchema.options)
      Object.assign(node, { [field]: NodeSchema.shape[field].parse(undefined) });
    node.fillToken = NodeSchema.shape.fillToken.parse(undefined);
    node.gradient = NodeSchema.shape.gradient.parse(undefined);
    node.libraryRef = { ...node.libraryRef, props: {}, localOverrides: [] };
  }
  if (op.type === 'library.remap') {
    const ref = {
      ...node.libraryRef,
      key: op.key,
      component: op.component ?? node.libraryRef.component,
    };
    if (component(doc, ref).semanticKind !== node.kind)
      throw Error('Remapping cannot change semantic kind');
    node.libraryRef = ref;
  }
  applyLibraryProperties(doc, node);
  return true;
}
