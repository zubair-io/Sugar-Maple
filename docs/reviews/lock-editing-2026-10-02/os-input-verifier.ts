import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { strict as assert } from 'node:assert';
const directory = 'build/canvas-lock-mcp', mode = process.argv[2];
const client = new Client({ name: 'Owned native OS input evidence', version: '1' });
await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:48494/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${(await Bun.file(`${directory}/profile/mcp-token`).text()).trim()}` } },
}));
async function call(name: string, args: any = {}) {
  const result: any = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result.structuredContent)); return result;
}
const data = async (name: string, args: any = {}) => (await call(name, args)).structuredContent;
try {
  if (mode === 'snapshot') {
    await data('selection.set', { id: 'child' });
    const before = { checkpoint: await data('document.checkpoint'), revision: (await data('document.get')).revision };
    await Bun.write(`${directory}/os-before.json`, JSON.stringify(before, null, 2));
    console.log(JSON.stringify({ revision: before.revision, layout: await data('layout.inspect') }));
  } else if (mode === 'verify-locked') {
    const before = await Bun.file(`${directory}/os-before.json`).json();
    assert.deepEqual(await data('document.checkpoint'), before.checkpoint);
    await Bun.write(`${directory}/os-locked.json`, JSON.stringify({ sourceHead: (await Bun.$`git rev-parse HEAD`.text()).trim(), before, after: await data('document.get') }, null, 2));
    console.log('PASS: native OS Delete/duplicate under locked ancestor leave exact checkpoint unchanged');
  } else if (mode === 'verify-edit') {
    const before = await Bun.file(`${directory}/os-before.json`).json(), current = await data('document.get');
    assert.equal(current.revision, before.revision + 1, 'One OS input edit commits once');
    const checkpoint = await data('document.checkpoint');
    assert.equal(checkpoint.journal.length, before.checkpoint.journal.length + 1);
    assert.equal(checkpoint.journal.at(-1).origin, 'human');
    const oldNode = before.checkpoint.document.nodes.find((node: any) => node.id === 'child'), node = current.document.nodes.find((node: any) => node.id === 'child');
    assert.notDeepEqual(node, oldNode, 'Native input actually changes the selected node');
    const result = { sourceHead: (await Bun.$`git rev-parse HEAD`.text()).trim(), before, after: current, scope: process.argv[3] };
    await Bun.write(`${directory}/os-${process.argv[3]}.json`, JSON.stringify(result, null, 2));
    const capture = await call('render.capture', { documentId: current.documentId, expectedRevision: current.revision });
    await Bun.write(`${directory}/os-${process.argv[3]}.png`, Buffer.from(capture.content[0].data, 'base64'));
    console.log(JSON.stringify({ oldNode, node, revision: current.revision }));
  } else if (mode === 'verify-undo') {
    const before = await Bun.file(`${directory}/os-before.json`).json(), current = await data('document.get');
    assert.deepEqual(current.document, before.checkpoint.document, 'Native OS Undo restores exact authored document');
    await Bun.write(`${directory}/os-undo.json`, JSON.stringify({ revision: current.revision, document: current.document }));
    console.log('PASS: native OS Undo restores exact authored document');
  } else throw Error('Unknown evidence mode');
} finally { await client.close(); }
