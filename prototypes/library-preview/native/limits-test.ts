import { strict as assert } from 'node:assert';
import { readdir } from 'node:fs/promises';
import { buildNativeFixture, NativeBuildSession } from './build';
import { supervise } from './supervise';
if (!process.argv.includes('--trust-native-fixture')) throw Error('Explicit --trust-native-fixture required');
const build = await buildNativeFixture(true), results: Record<string, unknown> = {};
async function fails(name: string, command: string[], overrides: Partial<Parameters<typeof supervise>[1]>, reason: RegExp) {
  const start = performance.now();
  const owner = supervise(command, { wallMilliseconds: 5000, rssKiB: 1048576, outputBytes: 2000000, ...overrides });
  await assert.rejects(owner.done, reason);
  results[name] = { milliseconds: performance.now() - start, stats: owner.stats() };
}
await fails('cpu', [build.limit, '1', process.execPath, '-e', 'while(true) {}'], {}, /Owned process failed.*SIG(?:XCPU|KILL)/);
await fails('wall', [process.execPath, '-e', 'setInterval(() => {}, 1000)'], { wallMilliseconds: 250 }, /Wall-time budget/);
await fails('rss', [process.execPath, '-e', 'const a = new Uint8Array(100000000); a.fill(1); setInterval(() => a[0], 1000)'], { rssKiB: 32768 }, /Resident-memory budget/);
await fails('output', [process.execPath, '-e', 'process.stdout.write("x".repeat(200000)); setInterval(() => {}, 1000)'], { outputBytes: 1000 }, /Output budget/);
const abort = new AbortController();
const owner = supervise([process.execPath, '-e', 'setInterval(() => {}, 1000)'], { wallMilliseconds: 5000, rssKiB: 1048576, outputBytes: 2000000, signal: abort.signal });
setTimeout(() => abort.abort(), 100);
await assert.rejects(owner.done, /cancelled/);
results.cancelRuntime = owner.stats();
const before = (await readdir('build/library-preview-native')).filter(name => name.endsWith('.building'));
const cancelBuild = new AbortController();
const pending = buildNativeFixture(true, cancelBuild.signal);
setTimeout(() => cancelBuild.abort(), 10);
await assert.rejects(pending, /cancelled/);
assert.deepEqual((await readdir('build/library-preview-native')).filter(name => name.endsWith('.building')), before);
await assert.rejects(buildNativeFixture(false), /trust-native-fixture/);
results.cancelBuild = { stagingRemoved: true, resultNotPublished: true };
const session = new NativeBuildSession();
const obsolete = session.prepare(true).then(() => 'incorrectly published', error => String(error));
const current = await session.prepare(true);
assert.match(await obsolete, /superseded/);
assert.ok(current.executable.endsWith('/Fixture.app/Contents/MacOS/Fixture'));
assert.deepEqual((await readdir('build/library-preview-native')).filter(name => name.endsWith('.building')), before);
results.supersededBuild = { obsoleteRejected: true, newestGeneration: current.generation, stagingRemoved: true };
await Bun.write('build/library-preview-native/limits-report.json', JSON.stringify({ passed: true, results,
  limitations: ['RSS is sampled every 100 ms, not a hard instantaneous address-space ceiling.', 'CPU is per process; wall/group RSS bound the fixed compiler workflow.', 'Only explicitly trusted fixed sources are supported.'] }, null, 2));
console.log('PASS: actual CPU, wall, sampled RSS and output limits terminate owned processes; runtime/build cancellation cleans up without publishing stale output');
