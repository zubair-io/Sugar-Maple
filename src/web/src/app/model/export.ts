import { svgExport } from './svg';
import { swiftExport } from './swift-export';
import type { SceneDocument, SceneNode } from './schema';
export type ExportTarget = 'html' | 'tailwind' | 'angular' | 'css' | 'swiftui' | 'editable' | 'svg';
const escape = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const swift = (v: string) => JSON.stringify(v).replace(/\\u([0-9a-f]{4})/gi, '\\u{$1}');
export function nodeStyles(n: SceneNode, doc: SceneDocument): Record<string, string | number> {
  const parent = doc.nodes.find((v) => v.id === n.parentId);
  return {
    margin: 0,
    fontFamily: 'system-ui, sans-serif',
    lineHeight: '1.2',
    position: parent && parent.layout !== 'free' ? 'relative' : 'absolute',
    left: parent && parent.layout !== 'free' ? 0 : n.x,
    top: parent && parent.layout !== 'free' ? 0 : n.y,
    width: n.width,
    height: n.height,
    background:
      n.kind === 'path'
        ? 'transparent'
        : n.fillToken
          ? (doc.tokens[n.fillToken] ?? n.fill)
          : n.fill,
    color: n.color,
    borderRadius: n.kind === 'ellipse' ? '50%' : n.radius,
    border: `${n.strokeWidth}px solid ${n.stroke}`,
    opacity: n.opacity,
    fontSize: n.fontSize,
    fontWeight: n.fontWeight,
    transform: `rotate(${n.rotation}deg)`,
    boxSizing: 'border-box',
    display: n.layout === 'grid' ? 'grid' : n.layout === 'free' ? 'block' : 'flex',
    flexDirection: n.layout === 'vertical' ? 'column' : 'row',
    gridTemplateColumns: `repeat(${n.columns}, minmax(0, 1fr))`,
    gap: n.gap,
    padding: ['frame', 'artboard'].includes(n.kind) ? n.padding : 0,
    flexShrink: 0,
    overflow: 'hidden',
  };
}
function css(n: SceneNode, doc: SceneDocument) {
  return Object.entries(nodeStyles(n, doc))
    .map(
      ([k, v]) =>
        `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}${typeof v === 'number' && !['opacity', 'fontWeight', 'flexShrink'].includes(k) ? 'px' : ''}`,
    )
    .join(';');
}
export function exportNode(doc: SceneDocument, id: string, target: ExportTarget): string {
  const n = doc.nodes.find((n) => n.id === id);
  if (!n) throw Error('Select an element');
  const children = doc.nodes.filter((v) => v.parentId === id).sort((a, b) => a.order - b.order);
  if (target === 'editable') {
    const ids = new Set([id]);
    let size = 0;
    while (size !== ids.size) {
      size = ids.size;
      for (const v of doc.nodes) if (v.parentId && ids.has(v.parentId)) ids.add(v.id);
    }
    return JSON.stringify(
      {
        format: 'sugar-maple-elements',
        version: 1,
        nodes: doc.nodes.filter((v) => ids.has(v.id)),
        tokens: doc.tokens,
      },
      null,
      2,
    );
  }
  if (target === 'svg') return svgExport(doc, id);
  if (target === 'css') return `.node-${n.id}{${css(n, doc)}}`;
  if (target === 'swiftui') return swiftExport(doc, id);
  if (n.kind === 'path') return `<div style="${escape(css(n, doc))}">${svgExport(doc, id)}</div>`;
  const tag =
    n.kind === 'button'
      ? 'button'
      : n.kind === 'input'
        ? 'input'
        : n.kind === 'text'
          ? 'p'
          : n.kind === 'image'
            ? 'img'
            : 'div';
  const style =
    css(n, doc) +
    (n.fillToken
      ? `;--${n.fillToken.replace(/\./g, '-')}:${doc.tokens[n.fillToken] ?? n.fill};background:var(--${n.fillToken.replace(/\./g, '-')})`
      : '');
  const attrs =
    target === 'tailwind'
      ? `class="${style
          .split(';')
          .map((s) => '[' + s.replace(/ /g, '_') + ']')
          .join(' ')}"`
      : `style="${escape(style)}"`;
  return `<${tag} ${attrs}${tag === 'input' ? ` placeholder="${escape(n.text)}"` : tag === 'img' ? ` src="${escape(n.asset)}" alt="${escape(n.name)}"` : ''}>${['input', 'img'].includes(tag) ? '' : escape(n.text) + children.map((v) => exportNode(doc, v.id, target)).join('') + `</${tag}>`}`;
}
