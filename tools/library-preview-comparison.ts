import { resolve } from 'node:path';
import { supervise } from '../prototypes/library-preview/native/supervise';
if (!process.argv.includes('--trust-native-fixture')) throw Error('Explicit native fixture opt-in required');
// Own a fresh server from this checkout, rather than accepting an unrelated
// process on the conventional port. No existing editor/server is stopped.
// Let Angular/Vite bind port 0 itself. Observe only our child's reported bound
// address, avoiding a reserve/release race and probes of unrelated listeners.
let editorURL = '', serverOutput = '';
let server: ReturnType<typeof supervise> | undefined;
let serverFailure: unknown;
async function ready(){if(!editorURL)return false;try{return(await fetch(editorURL,{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}}
async function run(args:string[]){
  const child=Bun.spawn([process.execPath,...args],{stdout:'inherit',stderr:'inherit',env:{...process.env,MAPLE_COMPARISON_EDITOR_URL:editorURL}});
  if((await child.exited)!==0)throw Error(`Comparison failed: ${args[0]}`);
  if(serverFailure || server?.child.exitCode !== null)throw Error(`Owned comparison server stopped: ${serverFailure ?? server?.child.exitCode}`);
}
try{
  server=supervise([process.execPath,'run','--cwd','src/web','start','--host','127.0.0.1','--port','0'],
    {wallMilliseconds:600000,rssKiB:2097152,outputBytes:2000000,onOutput:bytes=>{
      process.stdout.write(bytes);
      serverOutput=(serverOutput+bytes.toString()).slice(-10000).replace(/\x1b\[[0-9;]*m/g,'');
      const address=serverOutput.match(/Local:\s+(http:\/\/127\.0\.0\.1:(\d+))\//);
      if(address && Number(address[2])>0 && Number(address[2])<=65535)editorURL=address[1];
    }},
    {...process.env,PATH:resolve('node_modules/.bin')+':'+process.env.PATH});
  void server.done.catch(error=>{serverFailure=error;});
  const deadline=Date.now()+60000;
  while(!await ready()){
    if(Date.now()>deadline||serverFailure||server.child.exitCode!==null)throw Error(`Owned comparison server failed: ${serverFailure ?? server.stats().stderr}`);
    await Bun.sleep(100);
  }
  console.log(`Owned source checkout editor: ${editorURL}; process group ${server.child.pid}`);
  await run(['tools/library-consumer.ts']);
  await run(['tools/library-preview-acceptance.ts']);
  await run(['prototypes/library-preview/native-stop-failure-test.ts','--trust-native-fixture']);
  await run(['prototypes/library-preview/compare.ts','--trust-native-fixture']);
  await run(['run','build:web']);
  await run(['prototypes/library-preview/package-cost.ts']);
  await run(['prototypes/library-preview/comparison-report.ts']);
  await run(['prototypes/library-preview/report-test.ts']);
}finally{server?.stop('Comparison finished');await server?.done.catch(()=>{});}
