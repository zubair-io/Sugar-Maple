import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

if (process.platform !== 'darwin') throw Error('Native acceptance requires macOS and its Swift SDK.');
const root = resolve(import.meta.dir, '..');
const output = resolve(root, 'build/native-acceptance');
mkdirSync(output, { recursive: true });
const sources = [
  'src/apple/Sugar Maple/DocumentPackage.swift',
  'src/apple/Sugar Maple/NativeAccessPolicy.swift',
];
const cases = [
  ['native-persistence', [...sources, 'tools/native-persistence-test.swift']],
  ['native-autosave', [...sources, 'src/apple/Sugar Maple/DocumentPersistence.swift', 'tools/native-autosave-test.swift']],
  ['native-access', [...sources, 'tools/native-access-test.swift']],
  ['native-mcp', ['src/apple/Sugar Maple/NativeHostError.swift', 'src/apple/Sugar Maple/MCPTools.swift', 'src/apple/Sugar Maple/MCPServer.swift', 'tools/native-mcp-test.swift']],
] as const;
async function run(cmd: string[]) {
  const process = Bun.spawn(cmd, { cwd: root, stdout: 'inherit', stderr: 'inherit' });
  if (await process.exited) throw Error(`Native acceptance failed: ${cmd[0]}`);
}
for (const [name, files] of cases) {
  const executable = resolve(output, name);
  await run(['swiftc', ...files, '-o', executable]);
  await run([executable]);
}

await run([process.execPath, 'tools/mcp-stdio-test.ts']);
