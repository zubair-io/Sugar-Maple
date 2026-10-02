import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { blankDocument, NodeSchema } from '../src/web/src/app/model/schema';
import { DocumentStore } from '../src/web/src/app/model/store';
if (process.platform !== 'darwin') throw Error('Native text editing requires macOS');
const root = resolve(import.meta.dir, '..'), output = resolve(root, 'build/native-text-editing');
mkdirSync(output, { recursive: true });
const document = blankDocument();
document.nodes = [
  { id: 'a', name: 'Alpha label', kind: 'text', text: 'Alpha', x: 40 },
  { id: 'b', name: 'Beta label', kind: 'text', text: 'Beta', x: 250 },
].map(node => NodeSchema.parse({ ...node, pageId: document.pages[0].id, y: 40, width: 180, height: 80 }));
const fixture = resolve(output, 'fixture.json'), executable = resolve(output, 'native-text-editing');
await Bun.write(fixture, JSON.stringify(new DocumentStore(document).checkpoint()));
async function run(cmd: string[]) {
  const child = Bun.spawn(cmd, { cwd: root, stdout: 'inherit', stderr: 'inherit' });
  if (await child.exited) throw Error('Native text editing failed: ' + cmd[0]);
}
await run(['swiftc', 'src/apple/Sugar Maple/NativeAccessPolicy.swift', 'tools/native-canvas-benchmark.swift', '-o', executable]);
await run([executable, resolve(root, 'src/web/dist/sugar-maple-editor/browser'), fixture,
  resolve(root, 'tools/text-editing-native-page.js'), resolve(output, 'report.json'), resolve(output, 'webkit.png'), '--transforms']);
const report = await Bun.file(resolve(output, 'report.json')).json();
if (report.result?.passed !== true || report.result?.checks !== 12) throw Error('Incomplete WK text editing proof');
console.log('PASS: 12 production WK textarea/caret/ownership, synthetic composition ordering, capture/agent/history guards, cancellation and exact undo; hardware IME and OS input require separate evidence');
