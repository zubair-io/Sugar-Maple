import { homedir } from "node:os";
import { writeFile, mkdir } from "node:fs/promises";
const token = await Bun.file(
  `${homedir()}/Library/Application Support/SugarMaple/mcp-token`,
).text();
let sequence = 0;
async function rpc(method: string, params: any = {}) {
  const response = await fetch("http://127.0.0.1:48480/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++sequence, method, params }),
  });
  const body = (await response.json()) as any;
  if (!response.ok || body.error) throw Error(JSON.stringify(body));
  return body.result;
}
async function call(name: string, args: any = {}) {
  const result = await rpc("tools/call", { name, arguments: args });
  if (result.isError) throw Error(JSON.stringify(result));
  return result;
}
console.log(
  "Initialize:",
  (
    await rpc("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "smoke", version: "1" },
    })
  ).serverInfo,
);
console.log(
  "Tools:",
  (await rpc("tools/list")).tools.map((t: any) => t.name),
);
const state = JSON.parse((await call("document.get")).content[0].text);
console.log("Document:", state.document.name, "revision:", state.revision);
const image = await call("render.capture", {
  documentId: state.documentId,
  expectedRevision: state.revision,
});
await mkdir("build/evidence", { recursive: true });
await writeFile(
  "build/evidence/mac-editor.png",
  Buffer.from(image.content[0].data, "base64"),
);
console.log("Captured native editor");
