import { strict as assert } from 'node:assert';
import { resolve } from 'node:path';
import { buildNativeFixture } from './build';
import { NativePreview, nativeProps } from './controller';
import { fixtureProps } from '../contract';

if (!process.argv.includes('--trust-native-fixture')) throw Error('Explicit --trust-native-fixture is required');
const build = await buildNativeFixture(true), canary = resolve('build/library-preview-native/test-owned-canary.txt');
await Bun.write(canary, 'Private test-owned host file. The helper must not read this.');
let requests = 0;
const server = Bun.serve({hostname:'127.0.0.1',port:0,fetch(){ requests++; return new Response('Owned network canary'); }});
assert.equal(await (await fetch(server.url)).text(), 'Owned network canary'); requests = 0;
const events: any[] = [], native = new NativePreview(build, event => events.push(event), { canary, testPort: server.port });
try {
  const ready = await native.ready;
  assert.equal(ready.kind, 'ready');
  if (ready.kind === 'ready') {
    assert.equal(ready.canaryDenied, true, 'Actual sandbox must deny the private host file');
    assert.equal(ready.networkDenied, true, 'Actual sandbox must deny connection to the reachable owned server');
  }
  assert.equal(requests, 0);
  const rendered = await native.render(fixtureProps());
  assert.equal(rendered.kind, 'rendered');
  if (rendered.kind === 'rendered') {
    const png = Buffer.from(rendered.png, 'base64');
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    await Bun.write('build/library-preview-native/fixture.png', png);
  }
  const next = fixtureProps(); next.Button.props.label = 'Updated native label'; next.Input.props.value = 'native@example.test';
  const first = native.render(next).then(() => 'unexpected', error => String(error));
  const last = await native.render(fixtureProps());
  assert.match(await first, /superseded/); assert.equal(last.kind, 'rendered');
  const unsupported = fixtureProps(); unsupported.Button.variant = 'Primary';
  assert.throws(() => native.render(unsupported), /Unsupported native/);
  if (last.kind === 'rendered') {
    native.owner.child.stdin.write(JSON.stringify({version:1,session:native.session,revision:last.revision,kind:'render',
      ...nativeProps(fixtureProps()),method:'transaction.apply',file:'/private/document'}) + '\n');
    const deadline = Date.now() + 2000;
    while (!events.some(event => event.kind === 'error' && event.code === 'invalid_props')) {
      assert.ok(Date.now() < deadline, 'Helper must reject privileged packet keys'); await Bun.sleep(10);
    }
  }
  await Bun.write('build/library-preview-native/report.json', JSON.stringify({ build, ready, stats: native.owner.stats(),
    passed: true, tested: ['real SwiftUI compilation/rendering','actual App Sandbox host-file and network denial','typed props','superseded reply','privileged packet rejection','explicit unsupported native variant'],
    remaining: ['native human action/change events','negative CPU/wall/RSS/output tests','build cancellation and stale generation tests','Canvas/DOM/native comparison','final-head review/CI'] }, null, 2));
  console.log('PASS: trusted sandboxed SwiftUI renders real controls, denies private host canary, rejects unsupported variants and superseded replies');
} finally { native.stop(); await native.owner.done.catch(() => {}); server.stop(true); }
