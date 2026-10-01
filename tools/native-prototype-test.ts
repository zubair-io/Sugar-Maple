import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { tokenFile, mcpEndpoint, supportDirectory } from './mcp-config';
import { strict as assert } from 'node:assert';
if (!supportDirectory.endsWith('/build/prototype-qa/profile') || process.env['SUGAR_MAPLE_MCP_PORT'] !== '48487')
  throw Error('Prototype acceptance requires the isolated prototype QA profile and port 48487.');
const client = new Client({ name: 'Sugar Maple native prototype acceptance', version: '1' });
await client.connect(new StreamableHTTPClientTransport(new URL(mcpEndpoint), {
  requestInit: { headers: { Authorization: `Bearer ${await Bun.file(tokenFile).text()}` } },
}));
async function call(name: string, args: any = {}) {
  const result: any = await client.callTool({ name, arguments: args });
  if (result.isError) throw Error(JSON.stringify(result));
  return JSON.parse(result.content[0].text);
}
const baseline = `${supportDirectory}/prototype-baseline.json`;
try {
  if (process.argv.includes('--setup')) {
    await call('document.new', { name: 'Prototype Forms QA' });
    const tools = await client.listTools(), schema = JSON.stringify(tools.tools.find(t => t.name === 'transaction.apply')!.inputSchema);
    for (const property of ['inputType', 'initialValue', 'accessibleLabel', 'disabled', 'prototypeAction']) assert.ok(schema.includes(property));
    const d = await call('document.get'), pageId = d.document.pages[0].id;
    const nodes = [
      { id: 'login', kind: 'artboard', name: 'Sign in', layout: 'vertical', width: 400, height: 600, padding: 24, gap: 12 },
      { id: 'email', parentId: 'login', kind: 'input', name: 'Email field', text: 'Email address', inputType: 'email', initialValue: 'mock@example.test', accessibleLabel: 'Email', width: 352, height: 44 },
      { id: 'password', parentId: 'login', kind: 'input', name: 'Password field', text: 'Password', inputType: 'password', initialValue: 'DemoOnly', accessibleLabel: 'Password', width: 352, height: 44 },
      { id: 'disabled', parentId: 'login', kind: 'input', name: 'Unavailable field', accessibleLabel: 'Unavailable', initialValue: 'Locked', disabled: true, width: 352, height: 44 },
      { id: 'open', parentId: 'login', kind: 'button', text: 'Open terms', prototypeAction: 'openOverlay', targetId: 'terms', width: 352, height: 44 },
      { id: 'go', parentId: 'login', kind: 'button', text: 'Continue', targetId: 'welcome', transition: 'dissolve', width: 352, height: 44 },
      { id: 'terms', kind: 'artboard', name: 'Terms overlay', layout: 'vertical', width: 320, height: 260, padding: 24, gap: 12 },
      { id: 'terms-text', parentId: 'terms', kind: 'text', text: 'These are prototype terms.', width: 272, height: 60 },
      { id: 'close', parentId: 'terms', kind: 'button', text: 'Done', prototypeAction: 'closeOverlay', width: 272, height: 44 },
      { id: 'welcome', kind: 'artboard', name: 'Welcome', width: 400, height: 600 },
    ];
    await call('transaction.apply', { documentId: d.documentId, expectedRevision: d.revision, requestId: crypto.randomUUID(), operations: nodes.map(node => ({ type: 'node.add', node: { ...node, pageId } })) });
    await call('selection.set', { id: 'login' }); await call('viewport.fit');
    await Bun.write(baseline, JSON.stringify(await call('document.checkpoint')));
    const swift = await call('code.export', { id: 'login', target: 'swiftui' });
    assert.match(swift.code, /SecureField/); assert.match(swift.code, /emailAddress/);
    assert.doesNotMatch((await call('code.export', { id: 'password', target: 'svg' })).code, /DemoOnly/);
    console.log('PASS: actual native MCP advertises typed forms/actions, creates the durable fixture and exports secure SwiftUI/password-masked SVG. Ready for native keyboard/focus QA.');
  } else if (process.argv.includes('--remove-overlay')) {
    const d = await call('document.get');
    await call('transaction.apply', { documentId: d.documentId, expectedRevision: d.revision, requestId: crypto.randomUUID(), operations: [{ type: 'node.remove', id: 'terms' }] });
    await Bun.write(baseline, JSON.stringify(await call('document.checkpoint')));
    console.log('PASS: native MCP removed the open overlay destination; verify the preview closes it and reports the removal.');
  } else {
    assert.deepEqual(await call('document.checkpoint'), await Bun.file(baseline).json());
    if (process.argv.includes('--capture')) {
      const d = await call('document.get');
      const result: any = await client.callTool({ name: 'render.capture', arguments: { documentId: d.documentId, expectedRevision: d.revision } });
      assert.equal(result.isError ?? false, false);
      assert.equal(result.structuredContent.rendered, true);
      assert.equal(result.structuredContent.durable, true);
      const image = result.content.find((item: any) => item.type === 'image');
      assert.ok(image); await Bun.write('build/evidence/native-prototype.png', Buffer.from(image.data, 'base64'));
    }
    console.log('PASS: actual native preview editing/navigation/overlay/reset/close left the authored checkpoint and undo journal unchanged.');
  }
} finally { await client.close(); }
