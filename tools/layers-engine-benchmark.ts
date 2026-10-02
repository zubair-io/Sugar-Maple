// Replay the frozen pre-virtualization workload against the current production bundle.
// The adapter changes paths, fixes the input to the original checkpoint bytes,
// and separates the full Layers count from its mounted window.
import { mkdirSync, symlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const baseline = '48978d5646f8155c4067cb1f9c12117c1a510806';
const harnessRoot = resolve(root, 'build/virtual-layers-engine-harness');
const folder = resolve(harnessRoot, 'tools');
mkdirSync(folder, { recursive: true });
if (!existsSync(resolve(harnessRoot, 'src'))) symlinkSync(resolve(root, 'src'), resolve(harnessRoot, 'src'));
function replaceOnce(source: string, from: string, to: string) {
  if (source.split(from).length !== 2) throw Error('Frozen benchmark adapter pattern changed');
  return source.replace(from, to);
}
const adaptations: Record<string, [string, string][]> = {
  'canvas-engine-benchmark.ts': [
    ["const root = resolve(import.meta.dir, '..');", "const root = resolve(import.meta.dir, '..', '..', '..');"],
    ["'build/canvas-engine-benchmark'", "'build/virtual-layers-engine-benchmark'"],
    ["'tools/native-canvas-benchmark.swift'", "resolve(import.meta.dir, 'native-canvas-benchmark.swift')"],
    ["const fixture = canvasBenchmarkFixture(total);", "const fixture = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(await Bun.file(resolve(root, `docs/reviews/virtual-layers-2026-10-01/frozen-fixture-${total}.json.gz`)).arrayBuffer())));"],
  ],
  'canvas-benchmark-page.js': [[
    "if (document.querySelectorAll('.layer-row').length !== total) fail('Full Layers panel did not mount');",
    `const tree = document.querySelector('[role="tree"][aria-label="Layers"]');
      const mounted = document.querySelectorAll('.layer-row').length;
      if (!tree || Number(tree.dataset.layerCount) !== total) fail('Wrong full Layers model count');
      if (mounted < 1 || mounted > Math.ceil(tree.clientHeight / 36) + 18)
        fail('Virtual Layers panel exceeded its viewport and focus-pin bound');`,
  ]],
};
const manifest: Record<string, unknown> = { baseline, scope: 'Same frozen checkpoint bytes, 360-sample camera workload and image/checkpoint proofs; paths, frozen fixture loading and full-vs-windowed Layers assertion differ', files: {} };
for (const name of ['canvas-engine-benchmark.ts', 'canvas-benchmark-page.js', 'canvas-benchmark-fixture.ts', 'native-canvas-benchmark.swift']) {
  const read = Bun.spawnSync(['git', 'show', `${baseline}:tools/${name}`], { cwd: root });
  if (read.exitCode) throw Error('Frozen benchmark commit must be present locally: ' + baseline);
  const original = read.stdout.toString();
  let adapted = original;
  for (const [from, to] of adaptations[name] ?? []) adapted = replaceOnce(adapted, from, to);
  await Bun.write(resolve(folder, name), adapted);
  (manifest.files as Record<string, unknown>)[name] = {
    baselineSHA256: new Bun.CryptoHasher('sha256').update(original).digest('hex'),
    adaptedSHA256: new Bun.CryptoHasher('sha256').update(adapted).digest('hex'),
    replacements: adaptations[name] ?? [],
  };
}
await Bun.write(resolve(harnessRoot, 'adapter-manifest.json'), JSON.stringify(manifest, null, 2));
const child = Bun.spawn([process.execPath, resolve(folder, 'canvas-engine-benchmark.ts')], {
  cwd: root, stdout: 'inherit', stderr: 'inherit',
});
process.exit(await child.exited);
