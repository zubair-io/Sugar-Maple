import { NodeSchema, type SceneNode } from './schema';
import { webAwesomeManifest as manifest } from './bundled-library';
import type { LibraryValue } from './library-schema';

// Shared by inspector diagnostics and the trusted preview's generated Swift
// validation metadata. This is data inspection, never a package import.
export const nativeSceneStyleSupport = {
  lineHeight: NodeSchema.shape.lineHeight.parse(undefined),
  input: {
    fill: NodeSchema.shape.fill.parse(undefined),
    fillEnabled: NodeSchema.shape.fillEnabled.parse(undefined),
    radius: NodeSchema.shape.radius.parse(undefined),
    strokeWidth: NodeSchema.shape.strokeWidth.parse(undefined),
    letterSpacing: NodeSchema.shape.letterSpacing.parse(undefined),
  },
};
type Presentation = Pick<SceneNode, 'id' | 'kind' | 'text'> & {
  style: Pick<
    SceneNode,
    'fill' | 'fillEnabled' | 'radius' | 'strokeWidth' | 'letterSpacing' | 'lineHeight'
  >;
  library: null | { component: string; variant: string; props: Record<string, LibraryValue> };
};

/** Property support for the fixed native experiment, not a pixel-parity claim. */
export function nativeSceneDiagnostics(scene: { elements: Presentation[] }): string[] {
  return scene.elements.flatMap((node) => {
    const styles: string[] = [];
    if (node.kind !== 'frame' && (node.text.includes('\n') || node.text.includes('\r')))
      styles.push(`${node.id}: native multiline text is unsupported; use semantic preview`);
    if (node.kind !== 'frame' && node.style.lineHeight !== nativeSceneStyleSupport.lineHeight)
      styles.push(`${node.id}: native lineHeight is unsupported; use semantic preview`);
    if (node.kind === 'input')
      for (const [name, value] of Object.entries(nativeSceneStyleSupport.input))
        if (node.style[name as keyof typeof nativeSceneStyleSupport.input] !== value)
          styles.push(
            `${node.id}: native Input style ${name} is unsupported; use semantic preview`,
          );
    const ref = node.library;
    if (!ref) return styles;
    const c = manifest.components[ref.component],
      swift = c?.swift;
    if (!swift?.platforms.includes('macOS') || !swift.supportedVariants.includes(ref.variant))
      return [
        ...styles,
        `${node.id}: native ${ref.component} variant ${ref.variant} is unsupported; use the semantic preview or a supported variant`,
      ];
    return styles.concat(
      Object.entries(c.props)
        .filter(([name, p]) => !p.semantic && ref.props[name] !== p.default)
        .map(
          ([name]) =>
            `${node.id}: native ${ref.component} property ${name} is unsupported; use semantic preview`,
        ),
    );
  });
}
