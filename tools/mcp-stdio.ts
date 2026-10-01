import { tokenFile, mcpEndpoint } from './mcp-config';
import { createInterface } from "node:readline";
const path = tokenFile;
for await (const line of createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})) {
  if (!line.trim()) continue;
  let request: any;
  try {
    request = JSON.parse(line);
    const token = (await Bun.file(path).text().catch(() => {
      throw Error('Sugar Maple MCP credentials are unavailable; launch Sugar Maple and check its MCP status.');
    })).trim();
    const response = await fetch(mcpEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(25000),
    });
    if (request.id === undefined) continue;
    if (!response.ok)
      throw Error(
        `MCP HTTP ${response.status}; launch Sugar Maple and check its MCP status`,
      );
    console.log(JSON.stringify(await response.json()));
  } catch (error) {
    if (request?.id !== undefined)
      console.log(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32603,
            message:
              error instanceof Error ? `Sugar Maple MCP request failed: ${error.message}. Launch Sugar Maple and check its MCP status before retrying.` : "MCP request failed; launch Sugar Maple and retry.",
          },
        }),
      );
    else
      console.error(
        "Sugar Maple stdio: malformed notification or host unavailable",
      );
  }
}
