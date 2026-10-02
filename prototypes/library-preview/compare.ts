import { chromium, expect, type Browser } from '../../src/web/node_modules/@playwright/test';
import { strict as assert } from 'node:assert';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { libraryFixture, webAwesomeManifest } from '../../tools/library-fixture';
import { fixtureProps } from './contract';
import { servePreview } from './serve';
import { buildNativeFixture } from './native/build';
import { NativePreview } from './native/controller';

if (!process.argv.includes('--trust-native-fixture')) throw Error('Explicit native fixture opt-in required');
const editorURL = new URL(process.env.MAPLE_COMPARISON_EDITOR_URL ?? 'http://127.0.0.1:4200');
if(editorURL.hostname!=='127.0.0.1'||editorURL.protocol!=='http:'||editorURL.username||editorURL.password||editorURL.pathname!=='/'||editorURL.search||editorURL.hash)
  throw Error('Comparison editor URL must be a plain loopback HTTP origin');
const folder = resolve('build/library-preview-comparison'); mkdirSync(folder,{recursive:true});
const fixture = libraryFixture(), output: Record<string,any> = {}, errors: string[] = [];
const server = servePreview();
let browser:Browser|undefined;
let native: NativePreview | undefined;
function metrics(samples: number[]) {
  const sorted=[...samples].sort((a,b)=>a-b);
  return {samples,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)]};
}
try {
  browser = await chromium.launch({channel:'chrome',headless:true});
  const context = await browser.newContext({viewport:{width:1440,height:1100},deviceScaleFactor:1});
  const editor = await context.newPage(); editor.on('pageerror', e=>errors.push(e.message));
  await editor.goto(editorURL.href); await editor.waitForFunction(()=>window.sugarMaple.ready);
  await editor.evaluate(async ({nodes,manifest})=>{
    const d=await window.sugarMaple.dispatch('document.get');
    await window.sugarMaple.dispatch('transaction.apply',{documentId:d.documentId,expectedRevision:d.revision,requestId:crypto.randomUUID(),
      operations:[{type:'library.import',manifest},...nodes.map(node=>({type:'node.add',node:{...node,pageId:d.document.pages[0].id}}))]});
    await window.sugarMaple.dispatch('selection.set',{id:'root'}); await window.sugarMaple.dispatch('viewport.fit');
  },{nodes:fixture.document.nodes,manifest:webAwesomeManifest});
  const layout = await editor.evaluate(()=>window.sugarMaple.dispatch('layout.inspect'));
  const root = layout.nodes.find((node:any)=>node.id==='root').bounds, scale=root.width/400;
  const normalized = Object.fromEntries(layout.nodes.map((node:any)=>[node.id,{x:(node.bounds.x-root.x)/scale,y:(node.bounds.y-root.y)/scale,width:node.bounds.width/scale,height:node.bounds.height/scale}]));
  await editor.screenshot({path:resolve(folder,'canvas-editor.png')});
  await editor.screenshot({path:resolve(folder,'canvas-fixture.png'),clip:root});
  output.canvas={geometry:normalized,accessibility:await editor.locator('.viewport').ariaSnapshot(),
    stats:await editor.evaluate(()=>window.sugarMaple.viewport.stats()),
    authoredControlDOM:await editor.locator('.viewport input,.viewport button:not(.resize-handle)').count()};
  // Exercise the real library inspector; prove authored props change and undo.
  await editor.evaluate(()=>window.sugarMaple.dispatch('selection.set',{id:'button'}));
  const before = await editor.evaluate(()=>window.sugarMaple.dispatch('document.checkpoint'));
  await editor.getByLabel('Library prop label',{exact:true}).fill('Edited through inspector');
  await editor.getByLabel('Library prop label',{exact:true}).press('Tab');
  const edited = await editor.evaluate(()=>window.sugarMaple.dispatch('document.checkpoint'));
  assert.equal(edited.document.nodes.find((node:any)=>node.id==='button').text,'Edited through inspector');
  assert.equal(edited.journal.length,before.journal.length+1);
  await editor.evaluate(async()=>{const d=await window.sugarMaple.dispatch('document.get');await window.sugarMaple.dispatch('history.undo',{documentId:d.documentId,expectedRevision:d.revision});});
  assert.deepEqual((await editor.evaluate(()=>window.sugarMaple.dispatch('document.checkpoint'))).document,before.document);
  output.canvas.inspectorEditUndo=true;
  output.canvas.updateMilliseconds=metrics(await editor.evaluate(async()=>{
    const samples:number[]=[];
    for(let i=0;i<30;i++) {
      const d=await window.sugarMaple.dispatch('document.get'),frames=window.sugarMaple.viewport.stats().frames,start=performance.now();
      await window.sugarMaple.dispatch('transaction.apply',{documentId:d.documentId,expectedRevision:d.revision,requestId:crypto.randomUUID(),operations:[{type:'library.props',id:'button',props:{label:`Measure ${i}`}}]});
      await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));
      if(window.sugarMaple.viewport.stats().frames<=frames) throw Error('Updated Canvas was not painted');
      samples.push(performance.now()-start);
    }
    return samples;
  }));
  const beforeVariant=(await editor.evaluate(()=>window.sugarMaple.dispatch('document.checkpoint'))).document.nodes.find((node:any)=>node.id==='button');
  await editor.getByLabel('Library variant',{exact:true}).selectOption('Primary');
  const afterVariant=(await editor.evaluate(()=>window.sugarMaple.dispatch('document.checkpoint'))).document.nodes.find((node:any)=>node.id==='button');
  const visualFields=['fill','fillEnabled','color','stroke','strokeWidth','radius'];
  output.canvas.primaryVariant={identity:afterVariant.libraryRef.variant,
    semanticStyleChanged:visualFields.some(key=>beforeVariant[key]!==afterVariant[key]),fields:Object.fromEntries(visualFields.map(key=>[key,afterVariant[key]]))};
  assert.equal(afterVariant.libraryRef.variant,'Primary');
  const dom = await context.newPage(); dom.on('pageerror',e=>errors.push(e.message));
  await dom.goto(new URL('#preview',editorURL).href); await dom.waitForFunction(()=>window.sugarMaplePreview?.ready);
  const snapshot = {version:1,documentId:fixture.document.id,document:fixture.document,revision:0,rootId:'root'};
  await dom.evaluate(value=>window.sugarMaplePreview!.receive(value),snapshot);
  await expect(dom.getByRole('textbox',{name:'Email',exact:true})).toHaveValue('consumer@example.test');
  const geometry = await dom.locator('.preview-stage').evaluate(el=>{
    const root=el.querySelector('[data-node-id=root]')!.getBoundingClientRect(),scale=root.width/400;
    return Object.fromEntries([...el.querySelectorAll('[data-node-id]')].map(node=>{const b=node.getBoundingClientRect();return[node.getAttribute('data-node-id'),{x:(b.x-root.x)/scale,y:(b.y-root.y)/scale,width:b.width/scale,height:b.height/scale}];}));
  });
  let largestDelta=0;
  for(const [id,box] of Object.entries(normalized)) for(const key of ['x','y','width','height']) {
    const delta=Math.abs((box as any)[key]-geometry[id][key]); largestDelta=Math.max(largestDelta,delta);
    assert.ok(delta<1,`${id}.${key}: Canvas/DOM mismatch ${delta}`);
  }
  output.dom={geometry,largestCanvasGeometryDelta:largestDelta,accessibility:await dom.locator('.preview-stage').ariaSnapshot(),authoringBridge:await dom.evaluate(()=>typeof window.sugarMaple)};
  await dom.locator('.preview-stage').screenshot({path:resolve(folder,'dom-fixture.png')});
  await dom.getByRole('textbox',{name:'Email',exact:true}).fill('ephemeral@example.test');
  await expect(dom.getByRole('textbox',{name:'Email',exact:true})).toHaveValue('ephemeral@example.test');
  const value=await dom.evaluate(()=>window.sugarMaplePreview!.ready); assert.equal(value,true);
  output.dom.ephemeralInput=true;
  output.dom.updateMilliseconds=metrics(await dom.evaluate(async original=>{
    const samples:number[]=[];
    for(let i=0;i<30;i++) {const next=structuredClone(original);next.revision=i+1;next.document.nodes.find((n:any)=>n.id==='button')!.text=`Measure ${i}`;
      const start=performance.now();window.sugarMaplePreview!.receive(next);await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));samples.push(performance.now()-start);}
    return samples;
  },snapshot));
  await expect(dom.getByRole('textbox',{name:'Email',exact:true})).toHaveValue('ephemeral@example.test');
  const real = await context.newPage(); real.on('pageerror',e=>errors.push(e.message));
  await real.goto(server.url.href); await real.waitForFunction(()=>Boolean((window as any).preview));
  const cold=performance.now(); await real.getByRole('button',{name:'Run pinned library preview'}).click(); await expect(real.getByRole('status')).toHaveText('Running locally');
  const child=real.frameLocator('#runtime iframe');
  output.web={coldOptInMilliseconds:performance.now()-cold,accessibility:await child.locator('body').ariaSnapshot(),build:await Bun.file('build/library-preview/build.json').json()};
  output.web.geometry=await child.locator('body').evaluate(body=>Object.fromEntries(['wa-card','wa-input','wa-button'].map(tag=>{
    const rect=body.querySelector(tag)!.getBoundingClientRect();return[tag,{x:rect.x,y:rect.y,width:rect.width,height:rect.height}];
  })));
  await real.locator('#runtime').screenshot({path:resolve(folder,'web-fixture.png')});
  await child.getByRole('textbox',{name:'Email',exact:true}).fill('web@example.test');
  await real.waitForFunction(()=>(window as any).previewEvents.some((e:any)=>e.kind==='change'&&e.value==='web@example.test'));
  await child.getByRole('button',{name:'Save & Continue',exact:true}).click();
  await real.waitForFunction(()=>(window as any).previewEvents.some((e:any)=>e.kind==='action'));
  output.web.typedEvents=true;
  await real.getByLabel('Button variant').selectOption('Primary');
  await expect(child.locator('wa-button')).toHaveJSProperty('variant','brand');
  output.web.primaryVariant=await child.locator('wa-button').evaluate((node:any)=>({variant:node.variant,appearance:node.appearance}));
  output.web.updateMilliseconds=metrics(await real.evaluate(async()=>{
    const w=window as any,samples:number[]=[];
    for(let i=0;i<30;i++){const props=structuredClone(w.previewProps);props.Button.props.label=`Measure ${i}`;const start=performance.now();await w.preview.render(props);samples.push(performance.now()-start);}return samples;
  }));
  await real.getByRole('button',{name:'Stop preview'}).click();
  await dom.evaluate(()=>window.sugarMaplePreview!.dispose());
  const buildStart=performance.now(),build=await buildNativeFixture(true);
  const executableBytes=(await Bun.file(build.executable).arrayBuffer()).byteLength;
  const nativeFiles=[];
  for(const name of new Bun.Glob('**/*').scanSync({cwd:build.bundle,onlyFiles:true}))nativeFiles.push({name,bytes:(await Bun.file(resolve(build.bundle,name)).arrayBuffer()).byteLength});
  const runtimeStart=performance.now(); native=new NativePreview(build,()=>{}); await native.ready;
  const frame=await native.render(fixtureProps()); assert.equal(frame.kind,'rendered');
  if(frame.kind==='rendered')await Bun.write(resolve(folder,'native-fixture.png'),Buffer.from(frame.png,'base64'));
  const coldNative=performance.now()-runtimeStart,samples:number[]=[];
  for(let i=0;i<30;i++){const props=fixtureProps();props.Button.props.label=`Measure ${i}`;const start=performance.now();await native.render(props);samples.push(performance.now()-start);}
  let unsupportedNative='';
  const primary=fixtureProps();primary.Button.variant='Primary';try{await native.render(primary);}catch(error){unsupportedNative=String(error);}
  assert.match(unsupportedNative,/Unsupported native/);
  output.native={buildMilliseconds:runtimeStart-buildStart,coldSpawnRenderMilliseconds:coldNative,updateMilliseconds:metrics(samples),executableBytes,
    bundleFiles:nativeFiles,bundleBytes:nativeFiles.reduce((sum,file)=>sum+file.bytes,0),launcherBytes:(await Bun.file(build.limit).arrayBuffer()).byteLength,unsupportedPrimary:unsupportedNative,
    stats:native.owner.stats(),humanEvidence:await Bun.file('docs/reviews/library-preview-native-2026-10-02/human-report.json').json(),
    humanEvidenceScope:'Previously recorded actual native UI run, not performed by this comparison command',source:'fixed trusted SwiftUI adapter, not the JavaScript package'};
  assert.deepEqual(errors,[]);
  await Bun.write(resolve(folder,'comparison.json'),JSON.stringify({recordedAt:new Date().toISOString(),fixture:{document:fixture.document},
    editorOrigin:editorURL.origin,results:output,scope:'same authored Button/Input/Card fixture and typed props; actual Canvas, DOM preview, pinned package and sandboxed SwiftUI helper',
    timingDefinitions:{canvas:'CRDT transaction + Angular/Canvas scheduling + two RAF opportunities, excluding document.get',dom:'immutable scene feed + two RAF opportunities',web:'MessageChannel + actual Lit updates + two RAF opportunities',native:'IPC + SwiftUI update + fixed 50ms snapshot scheduling + PNG encode/reply'},
    limitations:['Timings have different boundaries and cannot rank input latency/FPS.','Native snapshot includes an intentional 50ms scheduling wait.','Web/native POC consumes props, not complete authored layout/styles/slots.','Human native AX/event evidence is separate; no full VoiceOver audit.','No whole-product memory or production distribution comparison is claimed.']},null,2));
  console.log('PASS: real Canvas/DOM fixture geometry and inspector undo; actual DOM input, package typed events and native rendered consumers; four pipeline timings and asset costs recorded');
} finally { native?.stop(); await native?.owner.done.catch(()=>{}); try { await browser?.close(); } finally { server.stop(true); } }
