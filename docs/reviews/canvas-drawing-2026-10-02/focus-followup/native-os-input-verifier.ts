import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { strict as assert } from 'node:assert';
const directory = 'build/canvas-drawing-mcp', mode = process.argv[2], scope = process.argv[3] ?? 'line';
const client = new Client({ name: 'Owned native drawing OS input evidence', version: '1' });
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
    await data('selection.set', { id: 'parent' });
    const before = { checkpoint: await data('document.checkpoint'), revision: (await data('document.get')).revision };
    await Bun.write(`${directory}/os-before.json`, JSON.stringify(before, null, 2));
    console.log(JSON.stringify({ revision: before.revision, layout: await data('layout.inspect') }));
  } else if (mode === 'verify-draft') {
    const before = await Bun.file(`${directory}/os-before.json`).json(), checkpoint = await data('document.checkpoint');
    await Bun.write(`${directory}/os-${scope}-draft.json`, JSON.stringify({ sourceHead: (await Bun.$`git rev-parse HEAD`.text()).trim(), before, checkpoint }, null, 2));
    assert.deepEqual(checkpoint, before.checkpoint, 'Polyline point editing stays out of document/history');
    console.log('PASS: native polyline draft leaves exact checkpoint unchanged');
  } else if (mode === 'verify-drawing') {
    const before = await Bun.file(`${directory}/os-before.json`).json(), current = await data('document.get');
    assert.equal(current.revision, before.revision + 1, 'One native drawing gesture commits once');
    const checkpoint = await data('document.checkpoint');
    assert.equal(checkpoint.journal.length, before.checkpoint.journal.length + 1);
    assert.equal(checkpoint.journal.at(-1).origin, 'human');
    const priorIds = new Set(before.checkpoint.document.nodes.map((node: any) => node.id));
    const added = current.document.nodes.filter((node: any) => !priorIds.has(node.id));
    assert.equal(added.length, 1); const node = added[0];
    assert.equal(node.kind, 'path'); assert.equal(node.parentId, 'parent'); assert.ok(node.pathData.startsWith('M'));
    if (scope === 'path') assert.ok(node.pathData.endsWith(' Z'), 'Native Shift+Enter closes the polyline');
    for (const old of before.checkpoint.document.nodes) assert.deepEqual(current.document.nodes.find((item: any) => item.id === old.id), old);
    const exported = await data('code.export', { id: node.id, target: 'svg' }); assert.ok(exported.code.includes(node.pathData));
    const result = { sourceHead: (await Bun.$`git rev-parse HEAD`.text()).trim(), before, after: current, node, layout: await data('layout.inspect'), scope };
    await Bun.write(`${directory}/os-${scope}.json`, JSON.stringify(result, null, 2));
    const capture = await call('render.capture', { documentId: current.documentId, expectedRevision: current.revision });
    await Bun.write(`${directory}/os-${scope}.png`, Buffer.from(capture.content[0].data, 'base64'));
    console.log(JSON.stringify({ node, revision: current.revision }));
  } else if (mode === 'verify-undo') {
    const before = await Bun.file(`${directory}/os-before.json`).json(), current = await data('document.get');
    assert.deepEqual(current.document, before.checkpoint.document, 'Native Cmd+Z restores exact authored document');
    await Bun.write(`${directory}/os-${scope}-undo.json`, JSON.stringify({ sourceHead: (await Bun.$`git rev-parse HEAD`.text()).trim(), revision: current.revision, document: current.document }));
    console.log('PASS: native Cmd+Z restores exact authored document');
  } else throw Error('Unknown evidence mode');
} finally { await client.close(); }
