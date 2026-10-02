import { resolve } from 'node:path';
export function servePreview() {
  const folder = resolve(import.meta.dir, '../../build/library-preview'), nonce = crypto.randomUUID().replaceAll('-', '');
  const files = new Set(['index.html', 'host.js', 'host.css', 'runtime.js', 'runtime.css', 'semantic.html', 'build.json']);
  return Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.search) return new Response('Unsupported request', { status: 405 });
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!files.has(name)) return new Response('Not found', { status: 404 });
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), clipboard-read=(), clipboard-write=(), display-capture=()',
      'Content-Security-Policy': `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'` };
    const file = Bun.file(resolve(folder, name));
    if (!await file.exists()) return new Response('Build the offline fixture first', { status: 503, headers });
    if (name === 'index.html') return new Response((await file.text()).replace('PREVIEW_NONCE', nonce), { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
    return new Response(file, { headers });
  } });
}
if (import.meta.main) {
  if (!process.argv.includes('--trust-fixture')) throw Error('Use --trust-fixture to opt into serving this standalone pinned experiment');
  const server = servePreview(); console.log(`Library preview POC: ${server.url}`);
}
