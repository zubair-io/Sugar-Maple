import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { blankDocument, NodeSchema } from '../src/web/src/app/model/schema';
import { DocumentStore } from '../src/web/src/app/model/store';

if (process.platform !== 'darwin') throw Error('Native lock editing requires macOS');
const root = resolve(import.meta.dir, '..'), output = resolve(root, 'build/native-lock-editing');
mkdirSync(output, { recursive: true });
const document = blankDocument(), pageId = document.pages[0].id;
document.nodes = [
  { id: 'parent', name: 'Locked frame', kind: 'frame', x: 40, y: 40, width: 500, height: 400, rotation: 25, locked: true },
  { id: 'child', name: 'Protected child', kind: 'rectangle', parentId: 'parent', x: 80, y: 90, width: 120, height: 80, fill: '#2563eb' },
  { id: 'free', name: 'Free', kind: 'rectangle', x: 600, y: 40, width: 120, height: 90 },
].map(node => NodeSchema.parse({ pageId, ...node }));
const fixture = resolve(output, 'fixture.json'), executable = resolve(output, 'native-lock-editing');
await Bun.write(fixture, JSON.stringify(new DocumentStore(document).checkpoint()));
async function run(cmd: string[]) {
  const child = Bun.spawn(cmd, { cwd: root, stdout: 'inherit', stderr: 'inherit' });
  if (await child.exited) throw Error('Native lock editing failed: ' + cmd[0]);
}
await run(['swiftc', 'src/apple/Sugar Maple/NativeAccessPolicy.swift', 'tools/native-canvas-benchmark.swift', '-o', executable]);
await run([executable, resolve(root, 'src/web/dist/sugar-maple-editor/browser'), fixture,
  resolve(root, 'tools/lock-editing-native-page.js'), resolve(output, 'report.json'), resolve(output, 'webkit.png'), '--transforms']);
const report = await Bun.file(resolve(output, 'report.json')).json();
if (report.result?.passed !== true || report.result?.checks !== 12) throw Error('Incomplete WK lock editing proof');
console.log('PASS: 12 production WKWebView inherited-lock controls/DOM keyboard cases, atomic deletion, explicit visibility/unlock, read-only mode routing and exact undo; OS input and VoiceOver are separate');
