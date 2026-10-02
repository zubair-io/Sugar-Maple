import { resolve } from "node:path";
const folder = resolve("build/library-scene-comparison");
const comparison = await Bun.file(resolve(folder, "comparison.json")).json();
if (!comparison.passed || !comparison.records?.length)
  throw Error("Passing real scene comparison required");
const escape = (value: unknown) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const names = {
  canvas: "Canvas editor",
  dom: "Semantic DOM",
  web: "Web Awesome 3.14",
  native: "System SwiftUI",
};
const phases = comparison.records
  .map((record: any) => {
    if (!/^[a-z-]{1,40}$/.test(record.name))
      throw Error("Unsupported phase name");
    return `<section class="phase" data-phase="${record.name}"><h2>${escape(record.name.replaceAll("-", " "))}</h2><p>Source revision ${record.sourceRevision} · same authored document and settled Canvas model · maximum outer-box differences ${Object.entries(
      record.maxDelta,
    )
      .map(([name, delta]) => `${escape(name)} ${Number(delta).toFixed(4)}`)
      .join(", ")} logical points.</p><div class="grid">${Object.entries(names)
      .map(
        ([name, title]) =>
          `<article><h3>${title}</h3>${name === "native" && !record.native.supported ? `<div class="unsupported"><strong>Unsupported source appearance</strong><p>${escape(record.native.message)}</p><p>The current supported scene is retained. No substituted native image is presented.</p></div>` : `<img src="${record.name}-${name}.png" alt="Actual ${title} rendering at ${escape(record.name)}" />`}</article>`,
      )
      .join(
        "",
      )}</div><details><summary>Source contract, geometry and accessibility observations</summary><pre>${escape(JSON.stringify(record, null, 2))}</pre></details></section>`;
  })
  .join("");
const timingRows = Object.entries(names)
  .map(
    ([name, title]) =>
      `<tr><th>${title}</th><td>${comparison.pipelineTimings[name].p50.toFixed(2)} ms</td><td>${comparison.pipelineTimings[name].p95.toFixed(2)} ms</td><td>${escape(comparison.timingDefinitions[name])}</td></tr>`,
  )
  .join("");
const bytes = (n: number) => (n / 1024).toFixed(1) + " KiB";
const web = comparison.costs.web.hashes,
  native = comparison.costs.native;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authored-scene library comparison · Sugar Maple</title><style>
*{box-sizing:border-box}body{margin:0;background:#f3f6fb;color:#17233d;font-family:system-ui}main{max-width:1500px;margin:auto;padding:32px}h1{max-width:950px;font-size:34px}h2{text-transform:capitalize}p{line-height:1.6;max-width:1100px}.decision{padding:20px;background:#fff4df;border:1px solid #ebc981;border-radius:12px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin:24px 0}article{background:white;border:1px solid #dbe3ef;border-radius:10px;padding:16px;min-width:0}img{display:block;width:100%;height:auto;border:1px solid #edf0f5}h3{font-size:17px}.unsupported{padding:18px;background:#fff4df;min-height:250px;font-size:14px}.phase[hidden]{display:none}select{font:inherit;background:white;padding:10px;border:1px solid #b9c6dc;border-radius:6px}.scroll{overflow:auto;background:white;margin:20px 0}table{border-collapse:collapse;width:100%;min-width:700px}th,td{padding:14px;text-align:left;border-bottom:1px solid #e2e7ef;font-size:13px}details{background:white;padding:14px;border:1px solid #dbe3ef;border-radius:8px}pre{overflow:auto;max-height:350px;font-size:11px}a{color:#1d4ed8}.note{font-size:13px;color:#55627a}@media(max-width:1000px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){main{padding:20px}.grid{grid-template-columns:1fr}h1{font-size:28px}}
</style></head><body><main><p class="note">SUGAR MAPLE · REAL EDITOR AND REAL CONSUMERS · ${escape(comparison.recordedAt)}</p><h1>The bounded scene feed preserves supported authored geometry across real renderers.</h1><p>The actual editor’s settled Canvas model is the source for every scene. The semantic DOM, pinned Web Awesome controls and separately sandboxed SwiftUI helper consume the same immutable source revision. Each capture below is a real rendered fixture, with unsupported native appearance shown explicitly.</p>
<div class="decision"><strong>GO for the supported, explicitly trusted scene experiment. Production integration and arbitrary code import remain NO-GO.</strong><p>Outer presentation boxes pass the unchanged ${comparison.toleranceLogicalPoints}-point tolerance. Intrinsic control chrome, typography and focus paint remain platform-specific. The native mapping rejects Primary, while the package displays its brand appearance. Final-head review/CI, current-base integration and verified resulting main are still required.</p></div>
<p><label>Compare source state <select id="phase"><option value="all">All tested states</option>${comparison.records.map((r: any) => `<option value="${r.name}">${escape(r.name.replaceAll("-", " "))}</option>`).join("")}</select></label></p>${phases}
<h2>Interaction and editability</h2><p>One canonical inspector edit produces one history step; undo restores the exact source document. Consumers do not mutate that document. Real semantic and web inputs retain ephemeral values across source updates and undo, then reset to their authored initial value. The web input retains focus and returns typed node-ID action/change events. Native physical keyboard and accessible-name observations remain separate source-bound evidence, not a whole-product VoiceOver claim.</p>
<h2>Instrumented completion observations</h2><p>Thirty sequential updates use the same editor source stream. Their completion boundaries differ and include instrumentation; these measurements cannot rank physical input latency or FPS. Native snapshots include an intentional 50 ms scheduling wait.</p><div class="scroll"><table><thead><tr><th>Path</th><th>p50</th><th>p95</th><th>Measured boundary</th></tr></thead><tbody>${timingRows}</tbody></table></div>
<h2>Asset costs</h2><p>The actual pinned web runtime adds ${bytes(web["runtime.js"].bytes + web["runtime.css"].bytes)} of raw JavaScript/CSS. Its experiment host adds ${bytes(web["host.js"].bytes + web["host.css"].bytes)}. The built native helper contains ${bytes(native.bundleBytes)} plus a ${bytes(native.launcherBytes)} resource-limit launcher; system frameworks are excluded. These are fixture asset costs, not installed memory, distribution size or initial-load network measurements.</p>
<h2>Remaining delivery</h2><p><a href="https://github.com/zubair-io/Sugar-Maple/issues/88">#88</a> and <a href="https://github.com/zubair-io/Sugar-Maple/issues/51">#51</a> remain open for verified review and delivery. Broader native styling, whole-product accessibility/performance, library import UX and arbitrary-source isolation need their own acceptance. The editor continues to show authored semantic appearance and actionable copy/preview limitations.</p><details><summary>Scope, checks and limits</summary><pre>${escape(JSON.stringify({ checks: comparison.checks, limitations: comparison.limitations, productionDecision: comparison.productionDecision }, null, 2))}</pre></details></main><script>document.querySelector('#phase').addEventListener('change',event=>{const selected=event.target.value;document.querySelectorAll('[data-phase]').forEach(section=>{section.hidden=selected!=='all'&&section.dataset.phase!==selected;});});</script></body></html>`;
await Bun.write(resolve(folder, "index.html"), html);
console.log(
  "PASS: authored-scene comparison report generated from measured captures and explicit unsupported records",
);
