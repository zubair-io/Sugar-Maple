import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { strict as assert } from 'node:assert';
const directory = 'build/canvas-drawing-mcp', output = 'build/native-text-os', mode = process.argv[2];
const client = new Client({ name: 'Owned native textarea OS input QA', version: '1' });
await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:48494/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${(await Bun.file(`${directory}/profile/mcp-token`).text()).trim()}` } },
}));
async function call(name: string, args: any = {}) {
  const result: any = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result)); return result.structuredContent;
}
const head = (await Bun.$`git rev-parse HEAD`.text()).trim();
try {
  if (mode === 'select') {
    await call('selection.set', { id: 'text-a' });
  } else if (mode === 'setup') {
    await call('document.new', { name: 'Owned native text session QA' });
    const d = await call('document.get');
    await call('transaction.apply', { documentId: d.documentId, expectedRevision: d.revision, requestId: crypto.randomUUID(),
      operations: [{ id: 'text-a', name: 'Alpha label', text: 'Alpha', x: 40 }, { id: 'text-b', name: 'Beta label', text: 'Beta', x: 250 }]
        .map(node => ({ type: 'node.add', node: { ...node, pageId: d.document.pages[0].id, kind: 'text', y: 40, width: 180, height: 80 } })) });
    await call('selection.set', { id: 'text-a' });
    const before = { sourceHead: head, checkpoint: await call('document.checkpoint'), document: await call('document.get') };
    await Bun.write(`${output}/before.json`, JSON.stringify(before, null, 2));
    console.log('PASS: fresh owned text fixture selected through real native MCP');
  } else if (mode === 'composition') {
    const before = await Bun.file(`${output}/before.json`).json();
    const result: any = await client.callTool({ name: 'selection.set', arguments: { id: 'text-b' } });
    await Bun.write(`${output}/composition-selection.json`, JSON.stringify({ sourceHead: head, result, checkpoint: await call('document.checkpoint') }, null, 2));
    assert.ok(result.isError && JSON.stringify(result).includes('Finish text composition'), JSON.stringify(result));
    assert.deepEqual(await call('document.checkpoint'), before.checkpoint);
    console.log('PASS: actual native marked-text composition rejects selection changes and retains full checkpoint');
  } else if (mode === 'draft') {
    const before = await Bun.file(`${output}/before.json`).json(), d = await call('document.get'), checkpoint = await call('document.checkpoint');
    assert.deepEqual(checkpoint, before.checkpoint);
    const errors = [];
    for (const name of ['transaction.apply', 'history.undo', 'render.capture']) {
      const result: any = await client.callTool({ name, arguments: { documentId: d.documentId, expectedRevision: d.revision,
        ...(name === 'transaction.apply' ? { requestId: crypto.randomUUID(), operations: [{ type: 'document.rename', name: 'Agent while typing' }] } : {}) } });
      assert.ok(result.isError && JSON.stringify(result).includes('Finish or cancel'), JSON.stringify(result));
      errors.push({ name, result });
    }
    assert.deepEqual(await call('document.checkpoint'), before.checkpoint);
    await Bun.write(`${output}/draft.json`, JSON.stringify({ sourceHead: head, checkpoint, errors }, null, 2));
    console.log('PASS: actual OS draft leaves full checkpoint unchanged and native SDK rejects mutation/history/capture');
  } else if (mode === 'commit') {
    const expected = process.argv[3]; assert.ok(expected);
    const before = await Bun.file(`${output}/before.json`).json();
    await call('selection.set', { id: 'text-b' });
    const after = await call('document.checkpoint');
    assert.equal(after.journal.length, before.checkpoint.journal.length + 1);
    assert.equal(after.journal.at(-1).origin, 'human');
    assert.equal(after.document.nodes.find((node: any) => node.id === 'text-a').text, expected);
    assert.equal(after.document.nodes.find((node: any) => node.id === 'text-b').text, 'Beta');
    const exported = await call('code.export', { id: 'text-a', target: 'svg' });
    assert.equal((exported.code.match(/<tspan\b/g) ?? []).length, expected.split(/\r\n?|\n/).length);
    const current = await call('document.get');
    const capture: any = await client.callTool({ name: 'render.capture', arguments: { documentId: current.documentId, expectedRevision: current.revision } });
    assert.ok(!capture.isError, JSON.stringify(capture));
    const image = capture.content.find((content: any) => content.type === 'image'); assert.ok(image);
    await Bun.write(`${output}/committed-canvas.png`, Buffer.from(image.data, 'base64'));
    await Bun.write(`${output}/committed.svg`, exported.code);
    await Bun.write(`${output}/committed.json`, JSON.stringify({ sourceHead: head, before: before.checkpoint, after, expected }, null, 2));
    console.log('PASS: native MCP selection finishes actual OS draft on original node as one human edit; next node is unchanged');
  } else if (mode === 'undo' || mode === 'cancel') {
    const before = await Bun.file(`${output}/before.json`).json(), after = await call('document.checkpoint');
    await Bun.write(`${output}/${mode}.json`, JSON.stringify({ sourceHead: head, before: before.checkpoint, after }, null, 2));
    if (mode === 'undo') assert.deepEqual(after.document, before.checkpoint.document);
    else assert.deepEqual(after, before.checkpoint);
    console.log(`PASS: actual native ${mode === 'undo' ? 'Cmd+Z restores complete authored document' : 'Escape cancels without any document/history change'}`);
  } else throw Error('Unknown evidence mode');
} finally { await client.close(); }
