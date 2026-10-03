import { editorURL } from './editor-url';
import { chromium, expect } from '@playwright/test';
import { strict as assert } from 'node:assert';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.addInitScript(() => {
  (window as any).fileCalls = [];
  window.webkit = {
    messageHandlers: {
      native: {
        postMessage: async (message: any) => {
          (window as any).fileCalls.push(message);
          switch (message.action) {
            case 'file.autosave':
              if ((window as any).failAutosave) throw Error('Test disk failure');
              return { ok: true, managed: true };
            case 'recovery.load':
              return null;
            case 'status':
              return { status: 'Native bridge fixture' };
            case 'file.open':
              return { cancelled: true };
            case 'clipboard.write':
              (window as any).nativeClipboard = message.text;
              return { ok: true };
            case 'clipboard.read':
              return { text: (window as any).nativeClipboard ?? '' };
            default:
              return { ok: true };
          }
        },
      },
    },
  };
});
await page.goto(editorURL());
await page.waitForFunction(() => window.sugarMaple.ready);
for (const name of ['New', 'Open', 'Save', 'Save As'])
  await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
await page.evaluate(() => {
  (window as any).failAutosave = true;
});
await page.getByRole('button', { name: 'Add page', exact: true }).click();
const before = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
// Page-only documents must be protected even when they contain no canvas nodes.
await page.evaluate(() => window.sugarMaple.fileCommand('new'));
assert.deepEqual(
  (await page.evaluate(() => window.sugarMaple.dispatch('document.get'))).document,
  before.document,
);
page.once('dialog', (dialog) => dialog.dismiss());
await page.evaluate(() => window.sugarMaple.fileCommand('open'));
assert.equal(
  await page.evaluate(
    () => (window as any).fileCalls.filter((c: any) => c.action === 'file.open').length,
  ),
  0,
);
await page.evaluate(() => window.sugarMaple.fileCommand('save'));
await page.evaluate(() => window.sugarMaple.fileCommand('saveAs'));
const saves = await page.evaluate(() =>
  (window as any).fileCalls.filter((c: any) => c.action === 'file.save'),
);
assert.equal(saves.length, 2);
assert.equal(saves[0].saveAs, false);
assert.equal(saves[1].saveAs, true);
assert.deepEqual(saves[0].value.document, before.document);
await page.keyboard.press('Meta+s');
assert.equal(
  await page.evaluate(
    () => (window as any).fileCalls.filter((c: any) => c.action === 'file.save').length,
  ),
  2,
);
await page.evaluate(() => window.sugarMaple.fileCommand('open'));
assert.deepEqual(
  (await page.evaluate(() => window.sugarMaple.dispatch('document.get'))).document,
  before.document,
);
await page.evaluate(() => window.sugarMaple.fileCommand('new'));
const after = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
assert.notEqual(after.document.id, before.document.id);
assert.equal(after.document.pages.length, 1);
await page.getByRole('button', { name: 'Add artboard', exact: true }).click();
const authored = await page.evaluate(async () => {
  const d = await window.sugarMaple.dispatch('document.get'), root = d.document.nodes[0];
  await window.sugarMaple.dispatch('transaction.apply', {
    documentId:d.documentId, expectedRevision:d.revision, requestId:crypto.randomUUID(),
    operations:[{type:'node.add',node:{id:'clipboard-label',pageId:root.pageId,parentId:root.id,kind:'text',text:'مرحبا ☕',name:'Offline label'}}],
  });
  await window.sugarMaple.dispatch('selection.set',{id:root.id});
  return window.sugarMaple.dispatch('document.get');
});
await page.getByRole('button', { name: 'Developer', exact: true }).click();
await page.getByRole('button', { name: 'Copy element', exact: true }).click();
const structured = await page.evaluate(() => (window as any).fileCalls.filter((c:any) => c.action === 'clipboard.write').at(-1));
assert.equal(structured.format,'editable');
assert.equal(JSON.parse(structured.text).format,'sugar-maple-elements');
assert.equal(JSON.parse(structured.text).version,2);
assert.equal(JSON.parse(structured.text).nodes[1].text,'مرحبا ☕');
await page.getByRole('button', { name: 'Copy name', exact: true }).click();
assert.equal(await page.evaluate(() => (window as any).fileCalls.filter((c:any) => c.action === 'clipboard.write').at(-1).format),'text');
await page.locator('[data-copy-current-target]').click();
assert.equal(await page.evaluate(() => (window as any).fileCalls.filter((c:any) => c.action === 'clipboard.write').at(-1).format),'text');
await page.evaluate(text => { (window as any).nativeClipboard = text; },structured.text);
await page.getByRole('button', { name: 'Design', exact: true }).click();
await page.locator('.viewport').click({position:{x:500,y:400}});
await page.keyboard.press('Meta+v');
await expect.poll(async() => (await page.evaluate(() => window.sugarMaple.dispatch('document.get'))).document.nodes.length).toBe(4);
const pasted = await page.evaluate(() => window.sugarMaple.dispatch('document.get'));
assert.equal(new Set(pasted.document.nodes.map((n:any) => n.id)).size,4);
assert.equal(pasted.document.nodes.filter((n:any) => n.text === 'مرحبا ☕').length,2);
await page.evaluate(async() => {
  const d=await window.sugarMaple.dispatch('document.get');
  await window.sugarMaple.dispatch('history.undo',{documentId:d.documentId,expectedRevision:d.revision});
});
assert.deepEqual((await page.evaluate(() => window.sugarMaple.dispatch('document.get'))).document,authored.document);
await page.screenshot({ path: 'build/evidence/native-file-menu-editor.png' });
await browser.close();
console.log(
  'PASS: native file/menu routing and cancellation; structured editable copy vs text name/code, UTF-8 hierarchy paste with remapped IDs and one undo (stubbed native I/O)',
);
