import { resolve } from 'node:path';
if (!process.argv.includes('--trust-native-fixture')) throw Error('Explicit native fixture opt-in required');
let server: ReturnType<typeof Bun.spawn> | undefined;
async function ready(){try{return(await fetch('http://127.0.0.1:4200')).ok;}catch{return false;}}
async function run(args:string[]){const child=Bun.spawn([process.execPath,...args],{stdout:'inherit',stderr:'inherit'});if(await child.exited)throw Error(`Comparison failed: ${args[0]}`);}
try{
  if(!await ready()){
    server=Bun.spawn([process.execPath,'run','dev'],{stdout:'ignore',stderr:'inherit',env:{...process.env,PATH:resolve('node_modules/.bin')+':'+process.env.PATH}});
    const deadline=Date.now()+60000;while(!await ready()){if(Date.now()>deadline||server.exitCode!==null)throw Error('Owned comparison server failed');await Bun.sleep(100);}
  }
  await run(['tools/library-consumer.ts']);
  await run(['tools/library-preview-acceptance.ts']);
  await run(['prototypes/library-preview/compare.ts','--trust-native-fixture']);
  await run(['run','build:web']);
  await run(['prototypes/library-preview/package-cost.ts']);
  await run(['prototypes/library-preview/comparison-report.ts']);
  await run(['prototypes/library-preview/report-test.ts']);
}finally{server?.kill();}
