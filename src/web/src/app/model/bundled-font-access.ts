let css = '';
let loading: Promise<string> | undefined;
// The font is a separate local chunk, keeping the editor's initial bundle bounded.
export function loadBundledFont() {
  return (loading ??= import('./bundled-font').then((font) => (css = font.bundledFontCSS)));
}
export function bundledFontStyle() {
  if (!css)
    throw Error('Bundled font is still loading; wait for the editor to be ready and retry export.');
  return css;
}
