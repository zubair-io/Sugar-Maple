import { chromium, expect, type Browser } from '../../src/web/node_modules/@playwright/test';
import { resolve } from 'node:path';
const folder=resolve('build/library-preview-comparison');
const files=new Set(['index.html','canvas-fixture.png','dom-fixture.png','web-fixture.png','native-fixture.png']);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const name=new URL(request.url).pathname.slice(1)||'index.html';return files.has(name)?new Response(Bun.file(resolve(folder,name))):new Response('Not found',{status:404});}});
let browser:Browser|undefined;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1200}});
  await page.goto(server.url.href);
  await expect(page.getByRole('heading',{level:1})).toHaveText('Real libraries work. Props alone do not preserve the authored UI.');
  await expect(page.locator('.decision')).toContainText('NO-GO for production integration');
  await expect(page.locator('article:visible')).toHaveCount(4);
  for(const image of await page.locator('article img').all())expect(await image.evaluate((node:HTMLImageElement)=>node.complete&&node.naturalWidth>0)).toBe(true);
  await page.getByLabel('Show rendering').selectOption('web');
  await expect(page.locator('article:visible')).toHaveCount(1);
  await expect(page.locator('article:visible')).toContainText('Real Web Awesome');
  await page.getByLabel('Show rendering').selectOption('all');
  await page.getByRole('button',{name:'Use full columns'}).click();
  await expect(page.locator('#renderings')).toHaveCSS('grid-template-columns', /\d+(?:\.\d+)?px \d+(?:\.\d+)?px/);
  await page.getByRole('button',{name:'Use full columns'}).click();
  await page.screenshot({path:resolve(folder,'report.png'),fullPage:true});
  console.log('PASS: comparison report renders all four real images and supports path/column controls');
}finally{try{await browser?.close();}finally{server.stop(true);}}
