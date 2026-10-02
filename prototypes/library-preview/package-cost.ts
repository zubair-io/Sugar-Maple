import { resolve } from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';
async function measure(folder:string,names:string[]) {
  const files=[];
  for(const name of names){const bytes=Buffer.from(await Bun.file(resolve(folder,name)).arrayBuffer());files.push({name,raw:bytes.length,gzip:gzipSync(bytes).length,brotli:brotliCompressSync(bytes).length,sha256:new Bun.CryptoHasher('sha256').update(bytes).digest('hex')});}
  return {files,raw:files.reduce((s,f)=>s+f.raw,0),gzip:files.reduce((s,f)=>s+f.gzip,0),brotli:files.reduce((s,f)=>s+f.brotli,0)};
}
const production=resolve('src/web/dist/sugar-maple-editor/browser');
const editorFiles=Array.from(new Bun.Glob('**/*').scanSync({cwd:production,onlyFiles:true})).filter(name=>!name.endsWith('.map'));
if(!editorFiles.length)throw Error('Build the current production editor before measuring its package');
const report={recordedAt:new Date().toISOString(),
  editor:await measure(production,editorFiles),
  addedLibraryRuntime:await measure('build/library-preview',['runtime.js','runtime.css']),
  experimentHost:await measure('build/library-preview',['host.js','host.css']),
  semanticFixture:await measure('build/library-preview',['semantic.html']),
  scope:'Per-file raw/gzip/Brotli asset costs; current production editor includes bundled chrome/fonts. Runtime and host are optional extra packages, not replacements for the editor.',
  exclusions:['Native system SwiftUI/OS framework disk cost','network headers/HTTP caching','installed app memory','arbitrary imported library costs']};
await Bun.write('build/library-preview-comparison/package-cost.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({editor:{raw:report.editor.raw,gzip:report.editor.gzip,brotli:report.editor.brotli},library:report.addedLibraryRuntime,host:{raw:report.experimentHost.raw,brotli:report.experimentHost.brotli},semantic:report.semanticFixture}));
