import { strict as assert } from 'node:assert';
import { buildNativeFixture } from './build';
import { NativePreview, type NativeReply } from './controller';
import { fixtureProps } from '../contract';
if (!process.argv.includes('--trust-native-fixture')) throw Error('Explicit --trust-native-fixture required');
const build = await buildNativeFixture(true), events: NativeReply[] = [];
const native = new NativePreview(build, event => { events.push(event); });
try {
  await native.ready; await native.render(fixtureProps());
  await Bun.write('build/library-preview-native/human-owner.json', JSON.stringify({build,pid:native.owner.child.pid}));
  console.log(JSON.stringify({ready:true,bundle:build.bundle,pid:native.owner.child.pid,task:'Click Save & Continue; select Email value and type qa with native keyboard events'}));
  const deadline = Date.now() + 50000;
  while (!(events.some(e => e.kind === 'action') && events.some(e => e.kind === 'change' && e.value === 'qa'))) {
    assert.ok(Date.now() < deadline, 'Native physical action/change evidence was not received');
    await Bun.sleep(100);
  }
  const recorded = events.map(event => event.kind === 'rendered' ? { ...event, png: undefined,
    pngSHA256: new Bun.CryptoHasher('sha256').update(Buffer.from(event.png, 'base64')).digest('hex') } : event);
  await Bun.write('build/library-preview-native/human-report.json', JSON.stringify({passed:true,build,events:recorded,stats:native.owner.stats(),
    scope:'Native control clicks and keyboard input on the owned sandboxed helper return only typed Button action/Input change events'},null,2));
  console.log('PASS: actual native Button click and TextField keyboard entry return typed events');
  await Bun.sleep(3000); // Keep the owned window available for the immediate AX observation.
} finally { native.stop(); await native.owner.done.catch(() => {}); }
