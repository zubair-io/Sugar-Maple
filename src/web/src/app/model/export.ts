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
import { NodeSchema } from './schema';
import type { SceneDocument, SceneNode } from './schema';
export type ExportTarget = ReturnType<typeof ExportTargetSchema.parse>;
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
function cssEntries(n: SceneNode, doc: SceneDocument): [string, string][] {
  return Object.entries(nodeStyles(n, doc)).map(
    ([k, v]) =>
      [
        k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()),
        `${v}${typeof v === 'number' && !['opacity', 'fontWeight', 'flexShrink', 'flexGrow'].includes(k) ? 'px' : ''}`,
      ] as [string, string],
  );
}
function css(n: SceneNode, doc: SceneDocument) {
  return cssEntries(n, doc)
    .map(([key, value]) => `${key}:${value}`)
    .join(';');
}
function declarationEntries(n: SceneNode, doc: SceneDocument): [string, string][] {
  if (n.fillToken && !/^[\w.-]+$/.test(n.fillToken))
    throw Error('Unsupported fill token name; use letters, digits, underscores, hyphens or dots.');
  const boundFill = doc.tokens[n.fillToken] ?? n.fill;
  if (n.fillToken && !NodeSchema.shape.fill.safeParse(boundFill).success)
    throw Error('Unsupported fill token value; expected a six-digit hex color.');
  const entries = cssEntries(n, doc);
  if (n.fillToken && n.fillEnabled && !n.gradient) {
    const variable = `--${n.fillToken.replace(/\./g, '-')}`;
    entries.push([variable, boundFill], ['background', `var(${variable})`]);
  }
  return entries;
}
function declarations(n: SceneNode, doc: SceneDocument) {
  return declarationEntries(n, doc)
    .map(([key, value]) => `${key}:${value}`)
    .join(';');
}
function classes(n: SceneNode, doc: SceneDocument) {
  return declarationEntries(n, doc)
    .map(
      ([key, value]) =>
        '[' + `${key}:${value}`.replace(/"/g, "'").replace(/_/g, '\\_').replace(/ /g, '_') + ']',
    )
    .join(' ');
}
function selectedNode(doc: SceneDocument, id: string): SceneNode {
  const node = doc.nodes.find((n) => n.id === id);
  if (!node) throw Error('Select an element');
  return node;
}
function visibleSubtree(doc: SceneDocument, id: string): SceneNode[] {
  const node = selectedNode(doc, id);
  return [
    node,
    ...doc.nodes
      .filter((n) => n.parentId === id && !n.hidden)
      .sort((a, b) => a.order - b.order)
      .flatMap((n) => visibleSubtree(doc, n.id)),
  ];
}
function styleSheet(doc: SceneDocument, id: string) {
  const nodes = visibleSubtree(doc, id);
  return (
    (nodes.some((n) => n.fontFamily === 'Maple Sans') ? bundledFontStyle() : '') +
    nodes.map((n) => `.node-${n.id}{${declarations(n, doc)}}`).join('\n')
  );
}
export function exportSupport(doc: SceneDocument, id: string, target: ExportTarget) {
  ExportTargetSchema.parse(target);
  const nodes = ['tailwind-classes', 'css-declarations'].includes(target)
    ? [selectedNode(doc, id)]
    : visibleSubtree(doc, id);
  const web = [
    'html',
    'angular',
    'tailwind',
    'tailwind-classes',
    'css',
    'css-declarations',
    'html-css',
  ].includes(target);
  const notes: string[] = [];
  if (web) {
    if (nodes[0].parentId)
      notes.push('Styles retain the authored parent layout; use an equivalent parent container.');
    if (target === 'tailwind' || target === 'tailwind-classes')
      notes.push(
        'Tailwind 4: include these literal classes in a scanned source file and compile the utilities.',
      );
    if (target === 'tailwind-classes' || target === 'css-declarations')
      notes.push(
        'This fragment styles the selected element only; it does not include its semantic markup, descendants or assets.',
      );
    for (const family of new Set(nodes.map((n) => n.fontFamily)))
      if (!['system-ui', 'sans-serif', 'serif', 'monospace', 'Maple Sans'].includes(family))
        notes.push(
          `Provide the local font "${family}" in the consuming application; this export does not embed it.`,
        );
    for (const n of nodes.filter(hasPrototypeAction))
      notes.push(
        `Unwired action on ${n.name}: ${n.prototypeAction}${n.targetId ? ` to ${n.targetId}` : ''}. Supply application behavior; style fragments do not include an action handler.`,
      );
  }
  const setup =
    ['tailwind-classes', 'css-declarations'].includes(target) &&
    nodes[0].fontFamily === 'Maple Sans'
      ? bundledFontStyle()
      : '';
  return { setup, notes };
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
  if (target === 'css') return styleSheet(doc, id);
  if (target === 'css-declarations') return declarations(n, doc);
  if (target === 'tailwind-classes') return classes(n, doc);
  if (target === 'html-css' && !nested)
    return `<style>${styleSheet(doc, id).replace(/</g, '\\3c ')}</style>${exportNode(doc, id, target, true)}`;
  if (target === 'swiftui') return swiftExport(doc, id);
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
  const attrs =
    target === 'html-css'
      ? `class="node-${n.id}"`
      : target === 'tailwind'
        ? `class="${escape(classes(n, doc))}"`
        : `style="${escape(declarations(n, doc))}"`;
  const controls =
    tag === 'input'
      ? ` type="${n.inputType}" maxlength="20000" aria-label="${escape(controlLabel(n))}" value="${escape(n.initialValue)}"${n.disabled ? ' disabled' : ''}`
      : tag === 'button'
        ? `${n.accessibleLabel ? ` aria-label="${escape(n.accessibleLabel)}"` : ''}${n.disabled ? ' disabled' : ''}`
        : '';
  const action = hasPrototypeAction(n)
    ? ` data-maple-action="${n.prototypeAction}"${n.targetId ? ` data-maple-target="${n.targetId}"` : ''}${!['button', 'input'].includes(n.kind) ? ` role="button" aria-label="${escape(controlLabel(n))}" tabindex="${n.disabled ? -1 : 0}"${n.disabled ? ' aria-disabled="true"' : ''}` : ''}`
    : '';
  if (n.kind === 'path') return `<div${action} ${attrs}>${svgExport(doc, id)}</div>`;
  const font =
    !nested && subtree(doc, id).some((n) => n.fontFamily === 'Maple Sans')
      ? `<style>${bundledFontStyle()}</style>`
      : '';
  return (
    font +
    `<${tag}${controls}${action}${target === 'angular' ? ' ngNonBindable' : ''} ${attrs}${tag === 'input' ? ` placeholder="${escape(n.text)}"` : tag === 'img' ? ` src="${escape(assetSource(doc, n.asset))}" alt="${escape(n.name)}"` : ''}>${['input', 'img'].includes(tag) ? '' : (target === 'angular' ? escape(n.text).replace(/[@{}]/g, (c) => '&#' + c.charCodeAt(0) + ';') : escape(n.text)) + children.map((v) => exportNode(doc, v.id, target, true)).join('') + `</${tag}>`}`
  );
}
