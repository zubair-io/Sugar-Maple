import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { webAwesomeManifest as manifest } from '../../src/web/src/app/model/bundled-library';
import { libraryFixture } from '../../tools/library-fixture';
import { exportNode } from '../../src/web/src/app/model/export';

if (!process.argv.includes('--trust-fixture')) throw Error('Explicitly opt into the pinned fixture with --trust-fixture. No imported source is built automatically.');
const root = resolve(import.meta.dir, '../..'), folder = resolve(root, 'build/library-preview'), cache = resolve(root, 'build/library-consumer');
const installed = Bun.file(resolve(cache, 'node_modules', manifest.package.name, 'package.json'));
if (!await installed.exists()) throw Error('Pinned dependency cache missing. Run bun tools/library-consumer.ts to install the committed lockfile explicitly; then retry this offline build.');
assert.equal((await installed.json()).version, manifest.package.version);
for (const [name, version] of Object.entries(manifest.dependencies)) assert.equal((await Bun.file(resolve(cache, 'node_modules', name, 'package.json')).json()).version, version);
const lock = await Bun.file(resolve(root, 'tools/fixtures/library-consumer/package-lock.json')).text();
assert.equal(await Bun.file(resolve(cache, 'package-lock.json')).text(), lock);
mkdirSync(folder, { recursive: true });
const entry = resolve(folder, 'runtime-entry.ts');
await Bun.write(entry, Object.values(manifest.components).map(c => `import ${JSON.stringify(resolve(cache, 'node_modules', c.web!.module))};`).join('\n') + '\n' +
  manifest.webStyles.map(path => `import ${JSON.stringify(resolve(cache, 'node_modules', path))};`).join('\n') +
  `\nimport ${JSON.stringify(resolve(import.meta.dir, 'web-runtime.ts'))};`);
async function bundle(entry: string, name: string) {
  const result = await Bun.build({ entrypoints: [entry], target: 'browser', minify: true, format: 'esm', outdir: resolve(folder, name), splitting: false });
  if (!result.success) throw Error(result.logs.join('\n'));
  const js = result.outputs.filter(file => file.path.endsWith('.js'));
  if (js.length !== 1) throw Error('Fixture needs one self-contained script');
  await Bun.write(resolve(folder, name + '.js'), await js[0].text());
  const css = result.outputs.filter(file => file.path.endsWith('.css'));
  await Bun.write(resolve(folder, name + '.css'), (await Promise.all(css.map(file => file.text()))).join('\n'));
  if (result.outputs.some(file => !/\.(js|css)$/.test(file.path))) throw Error('Unexpected runtime assets require explicit offline embedding');
}
await bundle(entry, 'runtime'); await bundle(resolve(import.meta.dir, 'host.ts'), 'host');
for (const file of ['index.html', 'host.css']) await Bun.write(resolve(folder, file), await Bun.file(resolve(import.meta.dir, file)).text());
const store = libraryFixture();
let frames = 0;
const semantic = exportNode(store.document, 'root', 'html').replace(/<div /g, text => ++frames === 2 ? '<div data-node-id="card" ' : text);
await Bun.write(resolve(folder, 'semantic.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><style>body{margin:16px;font-family:system-ui}</style></head><body>' + semantic + '</body></html>');
await Bun.write(resolve(folder, 'fixture.json'), JSON.stringify(store.checkpoint()));
const hashes: Record<string, { bytes: number; sha256: string }> = {};
for (const file of ['runtime.js', 'runtime.css', 'host.js', 'host.css', 'semantic.html', 'fixture.json']) {
  const bytes = await Bun.file(resolve(folder, file)).arrayBuffer();
  hashes[file] = { bytes: bytes.byteLength, sha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex') };
}
await Bun.write(resolve(folder, 'build.json'), JSON.stringify({ package: manifest.package, lockSHA256: new Bun.CryptoHasher('sha256').update(lock).digest('hex'), offline: true, importedSourceExecutedDuringBuild: false, hashes }, null, 2));
console.log(JSON.stringify({ passed: true, package: manifest.package, hashes }));
