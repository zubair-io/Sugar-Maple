import { homedir } from "node:os";
import { createInterface } from "node:readline";
const path =
  process.env["SUGAR_MAPLE_TOKEN_FILE"] ??
  `${homedir()}/Library/Application Support/SugarMaple/mcp-token`;
for await (const line of createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})) {
  if (!line.trim()) continue;
  let request: any;
  try {
    request = JSON.parse(line);
    const token = (await Bun.file(path).text()).trim();
    const response = await fetch("http://127.0.0.1:48480/mcp", {
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
              error instanceof Error ? error.message : "MCP request failed",
          },
        }),
      );
    else
      console.error(
        "Sugar Maple stdio: malformed notification or host unavailable",
      );
  }
}
