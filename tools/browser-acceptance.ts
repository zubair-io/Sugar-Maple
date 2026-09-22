// Reuse an existing development server, or own and clean up one for this test run.
let server: ReturnType<typeof Bun.spawn> | undefined;
async function ready() {
  try {
    return (await fetch("http://127.0.0.1:4200")).ok;
  } catch {
    return false;
  }
}
try {
  if (!(await ready())) {
    server = Bun.spawn([process.execPath, "run", "dev"], {
      stdout: "ignore",
      stderr: "inherit",
    });
    const deadline = Date.now() + 60000;
    while (!(await ready())) {
      if (Date.now() > deadline || server.exitCode !== null)
        throw Error("Editor test server failed to start");
      await Bun.sleep(200);
    }
  }
  for (const name of [
    "editor-e2e",
    "file-menu-e2e",
    "autosave-e2e",
    "selection-e2e",
    "responsive-e2e",
    "handoff-e2e",
    "web-consumer",
    "maple-design-e2e",
    "components-e2e",
    "folders-e2e",
    "comments-e2e",
  ]) {
    const test = Bun.spawn([process.execPath, `src/web/tests/${name}.ts`], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if (await test.exited) throw Error(`${name} failed`);
  }
} finally {
  server?.kill();
}
