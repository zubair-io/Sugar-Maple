import { bundledFontLicense } from './bundled-font';
let css = '';
let loading: Promise<string> | undefined;
// Binary asset loading avoids parsing font bytes as editor JavaScript.
export function loadBundledFont(read?: () => Promise<Uint8Array>) {
  return (loading ??= (async () => {
    const bytes = await (read
      ? read()
      : (async () => {
          const response = await fetch(new URL('fonts/InterVariable.woff2', document.baseURI));
          if (response.status !== 0 && !response.ok)
            throw Error('Bundled font asset could not load');
          return new Uint8Array(await response.arrayBuffer());
        })());
    if (bytes.length < 4 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'wOF2')
      throw Error('Bundled font asset is invalid');
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 16384)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
    css = `/*\n${bundledFontLicense}\n*/\n@font-face{font-family:"Maple Sans";font-style:normal;font-weight:100 900;src:url(data:font/woff2;base64,${btoa(binary)}) format("woff2");font-display:block;}`;
    return css;
  })());
}
export function bundledFontStyle() {
  if (!css)
    throw Error('Bundled font is still loading; wait for the editor to be ready and retry export.');
  return css;
}
