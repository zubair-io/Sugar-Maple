// Standalone fixtures may target an explicitly selected editor. The complete
// acceptance runner supplies its own source-owned ephemeral address.
export function editorURL(path = ''): string {
  const base = process.env.SUGAR_MAPLE_TEST_URL ?? 'http://127.0.0.1:4200/';
  return path ? new URL(path, base).href : new URL(base).origin;
}
