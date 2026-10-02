import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { blankDocument, NodeSchema } from '../src/web/src/app/model/schema';
import { DocumentStore } from '../src/web/src/app/model/store';
if (process.platform !== 'darwin') throw Error('Native drawing requires macOS');
const root = resolve(import.meta.dir, '..'), output = resolve(root, 'build/native-canvas-drawing');
mkdirSync(output, { recursive: true });
const document = blankDocument();
document.nodes = [NodeSchema.parse({ id: 'frame', name: 'Drawing frame', pageId: document.pages[0].id,
  kind: 'frame', x: 40, y: 40, width: 500, height: 400, rotation: 25, strokeWidth: 2 })];
const fixture = resolve(output, 'fixture.json'), executable = resolve(output, 'native-drawing');
await Bun.write(fixture, JSON.stringify(new DocumentStore(document).checkpoint()));
async function run(cmd: string[]) {
  const child = Bun.spawn(cmd, { cwd: root, stdout: 'inherit', stderr: 'inherit' });
  if (await child.exited) throw Error('Native drawing failed: ' + cmd[0]);
}
await run(['swiftc', 'src/apple/Sugar Maple/NativeAccessPolicy.swift', 'tools/native-canvas-benchmark.swift', '-o', executable]);
await run([executable, resolve(root, 'src/web/dist/sugar-maple-editor/browser'), fixture,
  resolve(root, 'tools/drawing-native-page.js'), resolve(output, 'report.json'), resolve(output, 'webkit.png'), '--transforms']);
const report = await Bun.file(resolve(output, 'report.json')).json();
if (report.result?.passed !== true || report.result?.checks !== 18) throw Error('Incomplete WK drawing proof');
console.log('PASS: 18 production WK drawing/control cases at zoom 0.5/1.5, pressure outlines, polyline completion, draft/capture guard, stale/locked/layout rejection and exact undo; DOM pointer events use a local capture shim and do not prove OS capture');
