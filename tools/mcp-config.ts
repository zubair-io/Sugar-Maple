import { homedir } from "node:os";
export const supportDirectory =
  process.env["SUGAR_MAPLE_SUPPORT_DIR"] ??
  `${homedir()}/Library/Application Support/SugarMaple`;
export const tokenFile =
  process.env["SUGAR_MAPLE_TOKEN_FILE"] ?? `${supportDirectory}/mcp-token`;
const port = Number(process.env["SUGAR_MAPLE_MCP_PORT"] ?? 48480);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error("SUGAR_MAPLE_MCP_PORT must be a valid TCP port");
export const mcpEndpoint = `http://127.0.0.1:${port}/mcp`;
