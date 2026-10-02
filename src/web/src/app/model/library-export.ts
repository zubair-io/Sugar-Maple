import { subtree } from './composition';
import { hasPrototypeAction } from './form';
import { exportNode } from './export';
import { libraryProps } from './library-schema';
import { swiftExport } from './swift-export';
import type { SceneDocument, SceneNode } from './schema';
const escape = (value: unknown) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
function mapping(doc: SceneDocument, node: SceneNode) {
  const ref = node.libraryRef!;
  const manifest = doc.libraries[ref.key],
    component = manifest?.components[ref.component];
  if (!component)
    throw Error('Pinned library metadata is absent; use semantic output or import its manifest');
  return { ref, manifest, component, values: libraryProps(component, ref) };
}
function dependencies(doc: SceneDocument, id: string) {
  const packages = new Map<string, string>();
  for (const node of subtree(doc, id))
    if (node.libraryRef) {
      const { manifest } = mapping(doc, node);
      for (const [name, version] of [
        [manifest.package.name, manifest.package.version],
        ...Object.entries(manifest.dependencies),
      ]) {
        if (packages.has(name) && packages.get(name) !== version)
          throw Error(
            'Unsupported conflicting package versions in one mapped export; remap explicitly',
          );
        packages.set(name, version);
      }
    }
  return [...packages].sort(([a], [b]) => a.localeCompare(b));
}
export function mappedWebExport(doc: SceneDocument, id: string) {
  const packages = dependencies(doc, id),
    imports = new Set<string>();
  const render = (node: SceneNode): string => {
    const children = doc.nodes
        .filter((n) => n.parentId === node.id && !n.hidden)
        .sort((a, b) => a.order - b.order),
      content = children.map(render).join('');
    let markup: string;
    if (node.libraryRef) {
      const { ref, manifest, component, values } = mapping(doc, node);
      if (!component.web) throw Error('Unsupported web platform for ' + ref.component);
      if (node.widthMode !== 'fixed' || node.heightMode !== 'fixed')
        throw Error('Unsupported mapped library responsive sizing; use semantic output');
      const represented = new Set([
        ...Object.values(component.props).flatMap((p) => (p.semantic ? [p.semantic] : [])),
        ...Object.values(component.web.styleBindings),
      ]);
      for (const field of ref.localOverrides)
        if (!represented.has(field))
          throw Error('Unsupported mapped library style override: ' + field);
      imports.add(component.web.module);
      for (const style of manifest.webStyles) imports.add(style);
      const attrs = Object.entries(component.props).flatMap(([name, property]) => {
        if (!property.webAttribute) return [];
        const value = property.semantic ? node[property.semantic] : values[name];
        return typeof value === 'boolean'
          ? value
            ? [property.webAttribute]
            : []
          : [`${property.webAttribute}="${escape(value)}"`];
      });
      if (hasPrototypeAction(node)) {
        attrs.push(`data-maple-action="${node.prototypeAction}"`);
        if (node.targetId) attrs.push(`data-maple-target="${escape(node.targetId)}"`);
      }
      const vars = Object.entries(manifest.tokenMappings).flatMap(([variable, name]) => {
        const token = ref.tokenBindings[variable] ?? name;
        const value = Object.hasOwn(doc.tokens, token) ? doc.tokens[token] : undefined;
        return value ? [`${variable}:${value}`] : [];
      });
      const inFlow =
        node.parentId && doc.nodes.find((n) => n.id === node.parentId)?.layout !== 'free';
      const boundStyles = Object.entries(component.web.styleBindings).map(
        ([variable, field]) =>
          `${variable}:${node[field]}${typeof node[field] === 'number' ? 'px' : ''}`,
      );
      const style = [
        `position:${node.parentId && doc.nodes.find((n) => n.id === node.parentId)?.layout !== 'free' ? 'relative' : 'absolute'}`,
        `left:${inFlow ? 0 : node.x}px`,
        `top:${inFlow ? 0 : node.y}px`,
        `width:${node.width}px`,
        `height:${node.height}px`,
        `opacity:${node.opacity}`,
        `transform:rotate(${node.rotation}deg)`,
        ...vars,
        ...boundStyles,
      ].join(';');
      markup = `<${component.web.tag} data-maple-library="${escape(ref.key)}" data-maple-component="${escape(ref.component)}" style="${escape(style)}" ${attrs.join(' ')}>${node.kind === 'button' ? escape(node.text) : escape(node.kind === 'input' ? '' : node.text)}${content}</${component.web.tag}>`;
    } else {
      // Reuse the semantic single-node serializer, then insert already mapped children.
      markup = exportNode(
        { ...doc, nodes: doc.nodes.filter((n) => n.parentId !== node.id) },
        node.id,
        'html',
        true,
      );
      const close = markup.lastIndexOf('</');
      if (close >= 0) markup = markup.slice(0, close) + content + markup.slice(close);
    }
    if (node.librarySlot)
      markup = markup.replace(/^<([a-z][a-z0-9-]*)/i, `<$1 slot="${escape(node.librarySlot)}"`);
    return markup;
  };
  const root = doc.nodes.find((n) => n.id === id);
  if (!root) throw Error('Select an element');
  const markup = render(root);
  return `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<!-- Exact dependencies: ${packages.map(([name, version]) => `${name}@${version}`).join(', ')}. Bundle these imports locally; the editor does not execute them. -->\n<script type="module">\n${[
    ...imports,
  ]
    .sort()
    .map((module) => `import ${JSON.stringify(module)};`)
    .join('\n')}\n</script>\n</head><body>${markup}</body></html>`;
}
export function mappedSwiftExport(
  doc: SceneDocument,
  id: string,
  platform: 'macOS' | 'iOS' = 'macOS',
) {
  const sources = new Set<string>();
  for (const node of subtree(doc, id))
    if (node.libraryRef) {
      const { ref, manifest, component, values } = mapping(doc, node),
        swift = component.swift;
      if (
        !swift ||
        !swift.platforms.includes(platform) ||
        !swift.supportedVariants.includes(ref.variant)
      )
        throw Error('Unsupported native platform/variant for ' + ref.component);
      for (const [name, property] of Object.entries(component.props))
        if (!property.semantic && values[name] !== property.default)
          throw Error('Unsupported native property: ' + name);
      const children = doc.nodes.filter((child) => child.parentId === node.id && !child.hidden);
      if (swift.adapter !== 'card' && children.length)
        throw Error('Unsupported native child slots on controls');
      if (
        swift.adapter === 'card' &&
        children.some((child) => !['', 'header', 'footer'].includes(child.librarySlot))
      )
        throw Error('Unsupported native Card slot; use default/header/footer content');
      if (swift.adapter === 'card' && node.layout !== 'vertical')
        throw Error('Unsupported native Card layout; its mapping is a VStack');
      sources.add(
        `${manifest.package.name}@${manifest.package.version} ${ref.component} -> SwiftUI.${swift.symbol} (${manifest.swiftSDK!.version})`,
      );
    }
  return (
    [...sources]
      .sort()
      .map((value) => '// Source ' + value)
      .join('\n') +
    '\n' +
    swiftExport(doc, id)
  );
}
