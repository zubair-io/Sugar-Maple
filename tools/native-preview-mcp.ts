import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { strict as assert } from 'node:assert';
import { supportDirectory, tokenFile, mcpEndpoint } from './mcp-config';
import fixture from './preview-fixture';
if (!supportDirectory.endsWith('/build/native-preview-qa/profile') || process.env['SUGAR_MAPLE_MCP_PORT'] !== '48490' || tokenFile !== `${supportDirectory}/mcp-token`)
  throw Error('Native preview acceptance requires its owned QA profile and port 48490.');
const client = new Client({name:'Sugar Maple separate-window preview acceptance',version:'1'});
await client.connect(new StreamableHTTPClientTransport(new URL(mcpEndpoint),{requestInit:{headers:{Authorization:`Bearer ${(await Bun.file(tokenFile).text()).trim()}`}}}));
async function call(name: string, args: any = {}) {
  const result: any = await client.callTool({name,arguments:args});
  if (result.isError) throw Error(JSON.stringify(result));
  return result.structuredContent;
}
const baseline = `${supportDirectory}/preview-baseline.json`;
try {
  if (process.argv.includes('--setup')) {
    await call('document.new',{name:'Separate native preview QA'});
    const d = await call('document.get');
    await call('transaction.apply',{documentId:d.documentId,expectedRevision:d.revision,requestId:crypto.randomUUID(),operations:fixture.document.nodes.map(n=>({type:'node.add',node:{...n,pageId:d.document.pages[0].id}}))});
    await call('selection.set',{id:'login'}); await call('viewport.fit');
    await Bun.write(baseline,JSON.stringify(await call('document.checkpoint')));
    console.log('PASS: actual native MCP created the owned two-screen/overlay/nested-component fixture. Ready for separate-window native input/Inspect QA.');
  } else if (process.argv.includes('--live-edit') || process.argv.includes('--remove-destination') || process.argv.includes('--remove-root')) {
    const d = await call('document.get');
    const operations = process.argv.includes('--live-edit') ? [{type:'node.update',id:'go',patch:{text:'Continue live'}}]
      : [{type:'node.remove',id:process.argv.includes('--remove-root') ? 'login' : 'welcome'}];
    await call('transaction.apply',{documentId:d.documentId,expectedRevision:d.revision,requestId:crypto.randomUUID(),operations});
    await Bun.write(baseline,JSON.stringify(await call('document.checkpoint')));
    console.log('PASS: actual native MCP applied the intentional design edit; verify live preview state/diagnostic in the separate window.');
  } else {
    assert.deepEqual(await call('document.checkpoint'),await Bun.file(baseline).json());
    console.log('PASS: separate native preview input/Inspect/viewport/navigation/reset/close left the complete authored checkpoint and undo journal unchanged since the last intentional design edit.');
  }
} finally { await client.close(); }
