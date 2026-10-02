import { blankDocument, NodeSchema } from '../src/web/src/app/model/schema';
import { exportNode } from '../src/web/src/app/model/export';
import { drawingGeometry } from '../src/web/src/app/canvas/drawing-geometry';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const folder = resolve('build/native-acceptance/vector-export');
mkdirSync(folder, { recursive: true });
const paths = [
  ['implicit-relative', 'm20 20 30 0 0 40 -30 0z'],
  ['horizontal-vertical', 'M20 20 H90 V70 h-70 v-50z'],
  ['cubic-smooth', 'M10 50 C20 10 40 10 50 50 S80 90 100 50'],
  ['quadratic-smooth', 'M10 50 q20-60 40 0 t40 0'],
  ['smooth-reset', 'M10 50 C20 0 40 0 50 50 L60 50 S80 90 100 50 M10 20 Q20 40 30 20 L40 20 T60 20'],
  ['arc-small', 'M20 30 A40 25 30 0 1 95 60'],
  ['arc-large', 'M20 30 A40 25 30 1 0 95 60'],
  ['arc-other-sweep', 'M20 30 a40 25 30 0 0 75 30'],
  ['arc-other-large', 'M20 30 a40 25 30 1 1 75 30'],
  ['arc-radii-corrected', 'M10 50 A5 3 45 0 1 100 50'],
  ['arc-degenerate', 'M10 20 A0 15 0 0 1 80 70 A20 20 0 0 1 80 70'],
  ['compact-flags', 'M20 30 A40 25 30 0195 60'],
  ['compound-nonzero', 'M10 10 H110 V90 H10z M35 30 V70 H85 V30z'],
  ['viewbox-origin', 'M-20 30 L80 30 L30 100z'],
  ['anisotropic-stroke', 'M10 30 Q50 0 90 30 L10 70', { width: 240, height: 100, viewBox: '0 0 120 100' }],
  ['acute-miter', 'M10 90 L60 10 L64 90', { strokeWidth: 10 }],
  ['clipping-opacity', 'M-10 50 L130 50 L60 110z', { fillEnabled: true, opacity: .5 }],
] as const;
const doc = blankDocument(), pageId = doc.pages[0].id;
const fixtures = paths.map(([name, pathData, extra]) => NodeSchema.parse({ id: name, name, pageId, kind: 'path',
  pathData, width: 120, height: 100, viewBox: name === 'viewbox-origin' ? '-30 20 120 100' : '0 0 120 100',
  fillEnabled: name === 'compound-nonzero' || name === 'viewbox-origin' || name === 'implicit-relative',
  fill: '#2563eb', stroke: '#111827', strokeWidth: 3, padding: 0, ...extra }));
for (const kind of ['line', 'arrow', 'path', 'freehand'] as const) {
  const points = [{ x: 20, y: 20, pressure: .2 }, { x: 40, y: 60, pressure: .9 }, { x: 80, y: 30, pressure: .5 }];
  fixtures.push(NodeSchema.parse({ id: kind, name: kind, pageId, kind: 'path', ...drawingGeometry(kind, points, 6, '#2563eb')!, padding: 0 }));
}
fixtures.push(NodeSchema.parse({ id: 'empty-path', name: 'empty-path', pageId, kind: 'path', pathData: '',
  width: 120, height: 100, viewBox: '0 0 120 100', fillEnabled: false, strokeWidth: 0 }));
// Actual parent placement/rotation/token resolution, in addition to standalone vectors.
const parent = NodeSchema.parse({ id: 'nested', name: 'nested-placement', pageId, kind: 'frame', layout: 'free', padding: 0, width: 180, height: 150, fill: '#ffffff' });
const child = NodeSchema.parse({ id: 'nested-child', name: 'nested-child', pageId, parentId: parent.id, kind: 'path', pathData: 'M10 10 H70 V50 H10z',
  width: 90, height: 65, viewBox: '0 0 80 60', x: 35, y: 45, rotation: 20, opacity: .7, fillToken: 'accent', strokeWidth: 3 });
doc.tokens.accent = '#e11d48';
let generated = '', views: string[] = [];
const records = [];
for (const [index, node] of [...fixtures, parent].entries()) {
  doc.nodes = node === parent ? [parent, child] : [node];
  const name = `VectorFixture${index}`, source = exportNode(doc, node.id, 'swiftui').replace('struct SugarMapleView:', `struct ${name}:`);
  assert.equal(exportNode(doc, node.id, 'swiftui').replace('struct SugarMapleView:', `struct ${name}:`), source);
  generated += source + '\n';
  views.push(`AnyView(${name}())`);
  records.push({ name: node.name, width: node.width, height: node.height, expectsInk: node.id !== 'empty-path', svg: exportNode(doc, node.id, 'svg') });
}
await Bun.write(resolve(folder, 'fixtures.json'), JSON.stringify(records, null, 2));
const harness = await Bun.file(resolve('tools/vector-export-consumer.swift')).text();
const sourcePath = resolve(folder, 'consumer.swift'), executable = resolve(folder, 'consumer');
await Bun.write(sourcePath, generated + harness.replace('/* GENERATED_VIEWS */', views.join(',\n')));
for (const command of [
  ['swiftc', '-parse-as-library', '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macosx14.0`, sourcePath, '-o', executable],
  [executable, folder],
]) {
  const child = Bun.spawn(command, { stdout: 'inherit', stderr: 'inherit' });
  assert.equal(await child.exited, 0, `Native vector consumer failed: ${command[0]}`);
}
