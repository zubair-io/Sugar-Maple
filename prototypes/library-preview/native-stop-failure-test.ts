import {strict as assert} from 'node:assert';
import {resolve} from 'node:path';
import {supervise} from './native/supervise';

if(!process.argv.includes('--trust-native-fixture') || !process.env.MAPLE_COMPARISON_EDITOR_URL)
  throw Error('Native stop regression requires the owned comparison server and explicit native opt-in');
// Exercise the actual comparison all the way through native rendering. Its
// real native owner stops first, then the injected stop error must not bypass
// browser/server cleanup. The child must exit naturally; leaked servers or
// Playwright connections keep it alive and fail the bounded owner deadline.
const fault='Owned native shutdown failure fixture';
const source=`
  import {NativePreview} from ${JSON.stringify(resolve('prototypes/library-preview/native/controller.ts'))};
  const original=NativePreview.prototype.stop;let injected=false;
  NativePreview.prototype.stop=function(...args){original.apply(this,args);if(!injected){injected=true;throw Error(${JSON.stringify(fault)});}};
  try {await import(${JSON.stringify(resolve('prototypes/library-preview/compare.ts'))});process.exitCode=1;}
  catch(error){if(!injected||!String(error).includes(${JSON.stringify(fault)}))throw error;console.log('Caught owned native shutdown failure');}
`;
const owner=supervise([process.execPath,'-e',source,'--','--trust-native-fixture'],
  {wallMilliseconds:30000,rssKiB:2097152,outputBytes:20000});
const result=await owner.done;
assert.equal(result.code,0);
console.log('PASS: actual comparison stops browser/server and exits naturally when native shutdown throws');
