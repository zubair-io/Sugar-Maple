import { strict as assert } from 'node:assert';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

if (!process.argv.includes('--trust-native-fixture')) throw Error('Explicit native fixture opt-in required');
const canary = `unrelated listener ${crypto.randomUUID()}`;
let requests = 0;
const sentinel = Bun.serve({ hostname: '127.0.0.1', port: 4200, fetch() {
  requests++; return new Response(canary);
} });
const log = resolve('build/library-preview-comparison-final-acceptance.log');
mkdirSync(resolve('build'),{recursive:true});
let child: ReturnType<typeof Bun.spawn> | undefined;
try {
  const writer = Bun.file(log).writer();
  child = Bun.spawn([process.execPath, 'tools/library-preview-comparison.ts', '--trust-native-fixture'], {
    stdout: 'pipe', stderr: 'pipe', env: { ...process.env, PATH: resolve('node_modules/.bin') + ':' + process.env.PATH },
  });
  const streams = [child.stdout, child.stderr] as ReadableStream<Uint8Array>[];
  const drains = streams.map(async stream => { for await (const bytes of stream) writer.write(bytes); });
  const code = await child.exited;
  await Promise.all(drains); await writer.end();
  assert.equal(code, 0, await Bun.file(log).text());
  assert.equal(requests, 0, 'The conventional-port listener is never used as an editor');
  assert.equal(await (await fetch(sentinel.url)).text(), canary, 'Existing listener remains intact');
  const text = await Bun.file(log).text();
  const match = text.match(/Owned source checkout editor: (http:\/\/127\.0\.0\.1:(\d+)); process group (\d+)/);
  assert.ok(match, 'Owned server provenance is retained');
  assert.notEqual(Number(match[2]), 4200);
  const ps = Bun.spawnSync(['/bin/ps', '-axo', 'pid=,pgid=,stat=']);
  assert.equal(ps.exitCode, 0);
  const members = ps.stdout.toString().trim().split('\n').map(line => line.trim().split(/\s+/))
    .filter(([, group, state]) => Number(group) === Number(match[3]) && !state.startsWith('Z'));
  assert.deepEqual(members, [], 'No live owned server descendants remain after completion');
  await Bun.write('build/library-preview-server-owner.json', JSON.stringify({
    passed: true, command: 'bun prototypes/library-preview/server-owner-test.ts --trust-native-fixture',
    editorOrigin: match[1], ownedGroup: Number(match[3]), conventionalPortRequestsDuringComparison: 0,
    existingPort4200Preserved: true, liveOwnedDescendantsAfterRun: members, fullAcceptancePassed: true,
  }, null, 2));
  console.log('PASS: fresh source checkout comparison passes without using unrelated port 4200; no live owned server descendants');
} finally { sentinel.stop(true); }
