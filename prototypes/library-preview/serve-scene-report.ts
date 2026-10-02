import { resolve } from "node:path";
export async function serveSceneReport(
  folder = resolve("docs/reviews/library-scene-comparison-2026-10-02"),
) {
  const comparison = await Bun.file(resolve(folder, "comparison.json")).json();
  if (
    !comparison.passed ||
    !Array.isArray(comparison.records) ||
    comparison.records.length > 20
  )
    throw Error("Passing bounded comparison evidence required");
  const files = new Set(["index.html", "comparison.json"]);
  for (const record of comparison.records) {
    if (!/^[a-z-]{1,40}$/.test(record.name))
      throw Error("Invalid captured phase");
    for (const renderer of [
      "canvas",
      "dom",
      "web",
      ...(record.native.supported ? ["native"] : []),
    ])
      files.add(`${record.name}-${renderer}.png`);
  }
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url),
        name = url.pathname.slice(1) || "index.html";
      if (request.method !== "GET" || url.search || !files.has(name))
        return new Response("Not found", { status: 404 });
      return new Response(Bun.file(resolve(folder, name)), {
        headers: {
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
        },
      });
    },
  });
}
if (import.meta.main)
  console.log("Authored-scene comparison: " + (await serveSceneReport()).url);
