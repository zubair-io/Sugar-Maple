import type { SceneNode } from './schema';
export const genericFonts = ['system-ui', 'sans-serif', 'serif', 'monospace'] as const;
export function fontStack(family: string) {
  return genericFonts.includes(family as (typeof genericFonts)[number])
    ? family === 'system-ui'
      ? 'system-ui, sans-serif'
      : family
    : `"${family}", system-ui, sans-serif`;
}
export function textAlignment(n: SceneNode) {
  return n.textAlign === 'auto' ? (n.kind === 'button' ? 'center' : 'left') : n.textAlign;
}
export function canvasFont(n: SceneNode) {
  return `${n.fontWeight} ${n.fontSize}px ${fontStack(n.fontFamily)}`;
}
export function applyCanvasFont(c: CanvasRenderingContext2D, n: SceneNode) {
  c.font = canvasFont(n);
  // Native spacing preserves shaping, ligatures and grapheme clusters.
  c.letterSpacing = `${n.letterSpacing}px`;
}
