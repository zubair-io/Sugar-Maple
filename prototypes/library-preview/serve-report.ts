import { resolve } from 'node:path';
const folder=resolve('docs/reviews/library-preview-comparison-2026-10-02');
const files=new Set(['index.html','canvas-fixture.png','dom-fixture.png','web-fixture.png','native-fixture.png','comparison.json','package-cost.json']);
if(!await Bun.file(resolve(folder,'index.html')).exists())throw Error('The committed comparison evidence is not present');
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
  const url=new URL(request.url),name=url.pathname.slice(1)||'index.html';
  if(request.method!=='GET'||url.search||!files.has(name))return new Response('Not found',{status:404});
  return new Response(Bun.file(resolve(folder,name)),{headers:{'X-Content-Type-Options':'nosniff','Cache-Control':'no-store',
    'Content-Security-Policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"}});
}});
console.log(`Library preview comparison: ${server.url}`);
