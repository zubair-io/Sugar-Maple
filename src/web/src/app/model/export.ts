import { mappedWebExport, mappedSwiftExport } from './library-export';
import { assetSource } from './assets';
import { controlLabel, hasPrototypeAction } from './form';
import { bundledFontStyle } from './bundled-font-access';
import { subtree } from './composition';
import { fontStack, textAlignment } from './typography';
import { gradientCSS } from './gradient';
import { svgExport } from './svg';
import { swiftExport } from './swift-export';
import { editablePayload } from './clipboard';
import { ExportTargetSchema } from './tool-contract';
import type { SceneDocument, SceneNode } from './schema';
export type ExportTarget =
  | 'html'
  | 'tailwind'
  | 'angular'
  | 'css'
  | 'swiftui'
  | 'editable'
  | 'svg'
  | 'web-library'
  | 'swift-library';
const escape = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function nodeStyles(n: SceneNode, doc: SceneDocument): Record<string, string | number> {
  const parent = doc.nodes.find((v) => v.id === n.parentId);
  const frame = ['frame', 'artboard'].includes(n.kind);
  // CSS borders round their layout width to device pixels. Frame geometry keeps
  // the exact authored inset, so paint it without adding a CSS layout border.
  const parentBorder =
    parent && ['frame', 'artboard'].includes(parent.kind) ? parent.strokeWidth : 0;
  const freeInset = parent?.layout === 'free' ? parentBorder : 0;
  const freeSize = (percent: number) =>
    freeInset ? `calc(${percent}% - ${(2 * freeInset * percent) / 100}px)` : `${percent}%`;
  return {
    margin: 0,
    fontFamily: fontStack(n.fontFamily),
    lineHeight: String(n.lineHeight),
    letterSpacing: n.letterSpacing,
    whiteSpace: 'pre-wrap',
    textAlign: textAlignment(n),
    appearance: ['button', 'input'].includes(n.kind) ? 'none' : 'auto',
    position: parent && parent.layout !== 'free' ? 'relative' : 'absolute',
    left: parent && parent.layout !== 'free' ? 0 : n.x + freeInset,
    top: parent && parent.layout !== 'free' ? 0 : n.y + freeInset,
    width:
      n.widthMode === 'hug'
        ? 'max-content'
        : n.widthMode === 'fill'
          ? parent?.layout === 'horizontal'
            ? 0
            : freeSize(100)
          : n.widthMode === 'percent'
            ? freeSize(n.widthPercent)
            : n.width,
    height:
      n.heightMode === 'hug'
        ? 'max-content'
        : n.heightMode === 'fill'
          ? parent?.layout === 'vertical'
            ? 0
            : freeSize(100)
          : n.heightMode === 'percent'
            ? freeSize(n.heightPercent)
            : n.height,
    minWidth: 0,
    minHeight: 0,
    flexGrow:
      (n.widthMode === 'fill' && parent?.layout === 'horizontal') ||
      (n.heightMode === 'fill' && parent?.layout === 'vertical')
        ? 1
        : 0,
    background:
      n.kind === 'path' || !n.fillEnabled
        ? 'transparent'
        : n.gradient
          ? gradientCSS(n.gradient)
          : n.fillToken
            ? (doc.tokens[n.fillToken] ?? n.fill)
            : n.fill,
    color: n.color,
    borderRadius: n.kind === 'ellipse' ? '50%' : n.radius,
    border: n.kind === 'path' || frame ? 'none' : `${n.strokeWidth}px solid ${n.stroke}`,
    ...(frame
      ? { boxShadow: n.strokeWidth ? `inset 0 0 0 ${n.strokeWidth}px ${n.stroke}` : 'none' }
      : {}),
    opacity: n.opacity,
    fontSize: n.fontSize,
    fontWeight: n.fontWeight,
    transform: `rotate(${n.rotation}deg)`,
    boxSizing: 'border-box',
    display: n.layout === 'grid' ? 'grid' : n.layout === 'free' ? 'block' : 'flex',
    flexDirection: n.layout === 'vertical' ? 'column' : 'row',
    gridTemplateColumns: `repeat(${n.columns}, minmax(0, 1fr))`,
    gap: n.gap,
    padding: frame ? n.padding + n.strokeWidth : n.kind === 'input' ? 8 : 0,
    flexShrink: 0,
    overflow: 'hidden',
  };
}
function css(n: SceneNode, doc: SceneDocument) {
  return Object.entries(nodeStyles(n, doc))
    .map(
      ([k, v]) =>
        `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}${typeof v === 'number' && !['opacity', 'fontWeight', 'flexShrink', 'flexGrow'].includes(k) ? 'px' : ''}`,
    )
    .join(';');
}
export function exportNode(
  doc: SceneDocument,
  id: string,
  target: ExportTarget,
  nested = false,
): string {
  ExportTargetSchema.parse(target);
  const n = doc.nodes.find((n) => n.id === id);
  if (!n) throw Error('Select an element');
  const children = doc.nodes
    .filter((v) => v.parentId === id && !v.hidden)
    .sort((a, b) => a.order - b.order);
  if (target === 'web-library') return mappedWebExport(doc, id);
  if (target === 'swift-library') return mappedSwiftExport(doc, id);
  if (target === 'editable') {
    return JSON.stringify(editablePayload(doc, id), null, 2);
  }
  if (target === 'svg') return svgExport(doc, id);
  if (target === 'css')
    return `${n.fontFamily === 'Maple Sans' ? bundledFontStyle() : ''}.node-${n.id}{${css(n, doc)}}`;
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
    (n.fillToken && n.fillEnabled && !n.gradient
      ? `;--${n.fillToken.replace(/\./g, '-')}:${doc.tokens[n.fillToken] ?? n.fill};background:var(--${n.fillToken.replace(/\./g, '-')})`
      : '');
  const attrs =
    target === 'tailwind'
      ? `class="${escape(
          style
            .split(';')
            .map((s) => '[' + s.replace(/"/g, "'").replace(/_/g, '\\_').replace(/ /g, '_') + ']')
            .join(' '),
        )}"`
      : `style="${escape(style)}"`;
  const controls =
    tag === 'input'
      ? ` type="${n.inputType}" maxlength="20000" aria-label="${escape(controlLabel(n))}" value="${escape(n.initialValue)}"${n.disabled ? ' disabled' : ''}`
      : tag === 'button'
        ? `${n.accessibleLabel ? ` aria-label="${escape(n.accessibleLabel)}"` : ''}${n.disabled ? ' disabled' : ''}`
        : '';
  const action = hasPrototypeAction(n)
    ? ` data-maple-action="${n.prototypeAction}"${n.targetId ? ` data-maple-target="${n.targetId}"` : ''}${!['button', 'input'].includes(n.kind) ? ` role="button" aria-label="${escape(controlLabel(n))}" tabindex="${n.disabled ? -1 : 0}"${n.disabled ? ' aria-disabled="true"' : ''}` : ''}`
    : '';
  const font =
    !nested && subtree(doc, id).some((n) => n.fontFamily === 'Maple Sans')
      ? `<style>${bundledFontStyle()}</style>`
      : '';
  return (
    font +
    `<${tag}${controls}${action}${target === 'angular' ? ' ngNonBindable' : ''} ${attrs}${tag === 'input' ? ` placeholder="${escape(n.text)}"` : tag === 'img' ? ` src="${escape(assetSource(doc, n.asset))}" alt="${escape(n.name)}"` : ''}>${['input', 'img'].includes(tag) ? '' : (target === 'angular' ? escape(n.text).replace(/[@{}]/g, (c) => '&#' + c.charCodeAt(0) + ';') : escape(n.text)) + children.map((v) => exportNode(doc, v.id, target, true)).join('') + `</${tag}>`}`
  );
}
