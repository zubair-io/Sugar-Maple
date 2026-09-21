import { DocumentStore } from '../src/app/model/store';
import { exportNode } from '../src/app/model/export';
import { uid } from '../src/app/model/schema';
import { resolve } from 'node:path';
import { mkdirSync, symlinkSync, existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { compile } from 'tailwindcss';
import { strict as assert } from 'node:assert';
const store = new DocumentStore();
store.transact({
  documentId: store.document.id,
  expectedRevision: 0,
  requestId: uid(),
  operations: [
    {
      type: 'node.add',
      node: {
        id: 'root',
        kind: 'frame',
        pageId: store.document.pages[0].id,
        layout: 'vertical',
        width: 400,
        height: 300,
        padding: 20,
        gap: 12,
      },
    },
    {
      type: 'node.add',
      node: {
        id: 'text',
        kind: 'text',
        parentId: 'root',
        pageId: store.document.pages[0].id,
        text: 'Hello @user {literal} {{noBinding}}',
        widthMode: 'fill',
        height: 40,
      },
    },
    {
      type: 'node.add',
      node: {
        id: 'button',
        kind: 'button',
        parentId: 'root',
        pageId: store.document.pages[0].id,
        text: 'Continue',
        widthMode: 'fill',
        height: 44,
      },
    },
  ],
});
const folder = resolve('build/evidence/web-consumer');
mkdirSync(folder, { recursive: true });
if (!existsSync(folder + '/node_modules'))
  symlinkSync(resolve('src/web/node_modules'), folder + '/node_modules');
await Bun.write(folder + '/template.html', exportNode(store.document, 'root', 'angular'));
await Bun.write(
  folder + '/fixture.ts',
  `import {Component} from '@angular/core';\n@Component({selector:'consumer-fixture',standalone:true,templateUrl:'./template.html'}) export class Fixture {}`,
);
await Bun.write(
  folder + '/tsconfig.json',
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'bundler',
      experimentalDecorators: true,
      skipLibCheck: true,
      outDir: 'dist',
    },
    angularCompilerOptions: { strictTemplates: true },
    files: ['fixture.ts'],
  }),
);
const ngc = Bun.spawn(
  [
    process.execPath,
    resolve('src/web/node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js'),
    '-p',
    folder + '/tsconfig.json',
  ],
  { stdout: 'inherit', stderr: 'inherit' },
);
if (await ngc.exited) throw Error('Generated Angular consumer failed to compile');
const markup = exportNode(store.document, 'root', 'tailwind');
const classes = [...markup.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(' '));
const css = (await compile('@tailwind utilities;')).build(classes);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.setContent('<style>' + css + '</style>' + markup);
assert.equal(Math.round((await page.locator('button').boundingBox())!.width), 360);
assert.equal(Math.round((await page.locator('button').boundingBox())!.height), 44);
assert.equal(await page.locator('p').textContent(), 'Hello @user {literal} {{noBinding}}');
await page.setContent(exportNode(store.document, 'root', 'html'));
assert.equal(Math.round((await page.locator('button').boundingBox())!.width), 360);
await browser.close();
console.log(
  'PASS: generated Angular strict-template consumer compiles; Tailwind 4 compiles classes and renders matching semantic HTML geometry without Maple',
);
