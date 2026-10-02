import { libraryProps, sameManifest, type LibraryValue } from './library-schema';
import { mappedWebExport, mappedSwiftExport } from './library-export';
import { webAwesomeManifest } from './bundled-library';
import { nativeSceneDiagnostics } from './library-preview-support';
import type { SceneDocument, SceneNode } from './schema';

export interface CopySupport {
  available: boolean;
  message: string;
}
const copySupport = (generate: () => string, remedy: string): CopySupport => {
  try {
    generate();
    return { available: true, message: 'Available for this selection.' };
  } catch (error) {
    return {
      available: false,
      message: `${error instanceof Error ? error.message : String(error)}. ${remedy}`,
    };
  }
};

/** Read-only, metadata-based guidance. Export support comes from the actual
 * serializer, including children; it does not execute or load the source package. */
export function libraryAppearance(doc: SceneDocument, node: SceneNode) {
  const ref = node.libraryRef,
    manifest = ref ? doc.libraries[ref.key] : null,
    component = ref ? manifest?.components[ref.component] : null;
  if (!ref || !manifest || !component) return null;
  const props = libraryProps(component, ref);
  const appearance = Object.entries(component.props)
    .filter(([, p]) => !p.semantic)
    .map(([name]) => ({ name, value: props[name] }));
  const source = `${manifest.name} ${ref.component} · ${ref.variant}`;
  const web = copySupport(
    () => mappedWebExport(doc, node.id),
    'Use semantic HTML/CSS or reset the unsupported override.',
  );
  const swift = copySupport(
    () => mappedSwiftExport(doc, node.id),
    'Use semantic SwiftUI or choose a supported mapping.',
  );
  if (!sameManifest(manifest, webAwesomeManifest))
    return {
      source,
      appearance,
      web,
      swift,
      native: [
        'This library is metadata only. The native preview experiment supports the bundled Web Awesome mapping.',
      ],
    };
  const values: Record<string, LibraryValue> = { ...props };
  for (const [name, property] of Object.entries(component.props))
    if (property.semantic) values[name] = node[property.semantic];
  const fill = node.fillToken ? doc.tokens[node.fillToken] : node.fill;
  const native = nativeSceneDiagnostics({
    elements: [
      {
        id: node.id,
        kind: node.kind,
        text: node.text,
        style: { ...node, fill: fill ?? node.fill },
        library: { component: ref.component, variant: ref.variant, props: values },
      },
    ],
  }).map((message) => message.replace(`${node.id}: `, ''));
  if (node.fillToken && fill === undefined)
    native.unshift(`Missing fill token ${node.fillToken}; bind an existing token.`);
  if (node.gradient)
    native.unshift(
      'Gradient fills are unsupported in the isolated library preview; use semantic preview.',
    );
  if (!['system-ui', 'sans-serif', 'serif', 'monospace'].includes(node.fontFamily))
    native.unshift(`Preview font ${node.fontFamily} is unsupported; use semantic preview.`);
  return { source, appearance, web, swift, native };
}
