import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root = mkdtempSync(join(tmpdir(), 'sugar-maple-stdio-'));
try {
  const process = Bun.spawn([Bun.argv[0], 'tools/mcp-stdio.ts'], {
    env: { ...Bun.env, SUGAR_MAPLE_SUPPORT_DIR: root, SUGAR_MAPLE_TOKEN_FILE: join(root, 'missing-token') },
    stdin: new Blob([JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) + '\n']),
    stdout: 'pipe', stderr: 'pipe',
  });
  const stdout = await new Response(process.stdout).text();
  assert.equal(await process.exited, 0);
  const response = JSON.parse(stdout);
  assert.equal(response.id, 1);
  assert.equal(response.error.code, -32603);
  assert.match(response.error.message, /credentials are unavailable/i);
  assert.match(response.error.message, /launch Sugar Maple/i);
  assert.equal(await new Response(process.stderr).text(), '');
  console.log('PASS: unavailable-host stdio returns actionable JSON-RPC error and keeps stdout protocol-clean');
} finally { rmSync(root, { recursive: true, force: true }); }
