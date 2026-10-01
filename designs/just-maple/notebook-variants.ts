import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { homedir } from "node:os";
import { DocumentStore } from "../../src/web/src/app/model/store";
import { exportNode } from "../../src/web/src/app/model/export";
const m = await Bun.file("designs/just-maple/screens.json").json();
if (m.roots.workbook) throw Error("Already added");
const c = new Client({ name: "Notebook variants", version: "1" }),
  token = await Bun.file(
    `${homedir()}/Library/Application Support/SugarMaple/mcp-token`,
  ).text();
await c.connect(
  new StreamableHTTPClientTransport(new URL("http://127.0.0.1:48480/mcp"), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);
async function t(name: string, args: any = {}) {
  const r: any = await c.callTool({ name, arguments: args });
  if (r.isError) throw Error(JSON.stringify(r));
  return JSON.parse(r.content[0].text);
}
const s = await t("document.get"),
  saved = await Bun.file(
    "designs/just-maple/Just Maple.syrup/document.json",
  ).json(),
  ops: any[] = [],
  patches: any[] = [];
for (const [key, title, heading, number, count, copy] of [
  [
    "work",
    "Working thoughts",
    "Questions for the next chapter",
    "02",
    "8",
    [
      "What do I want more of in my next role?",
      "",
      "Time to think. People to learn from.",
      "A little more ownership of the work.",
      "",
      "Questions for the next conversation:",
      "How does the team make difficult decisions?",
      "",
      "What would a good first month look like?",
    ],
  ],
  [
    "out",
    "Out & about",
    "A walk without a destination",
    "03",
    "6",
    [
      "Took the long way home today.",
      "",
      "A new bookshop on the corner.",
      "The first leaves turning along the path.",
      "",
      "Something worth remembering:",
      "Good ideas often arrive when I slow down.",
      "",
      "Come back here next weekend.",
    ],
  ],
]) {
  const ids = {
    book: `jm-${crypto.randomUUID()}`,
    fresh: `jm-${crypto.randomUUID()}`,
  };
  for (const fresh of [false, true]) {
    const sourceRoot = m.roots[fresh ? "newnote" : "notebook"],
      newRoot = ids[fresh ? "fresh" : "book"],
      pageId = `jm-${crypto.randomUUID()}`,
      variantKey = key + (fresh ? "note" : "book");
    m.roots[variantKey] = newRoot;
    const page = {
      id: pageId,
      name: `${m.pages.length + 1} · ${title} / ${fresh ? "new note" : "open notebook"}`,
      order: m.pages.length,
    };
    m.pages.push(page);
    ops.push({ type: "page.add", id: pageId, name: page.name });
    const source = s.document.nodes.filter(
      (n: any) => n.id === sourceRoot || n.parentId === sourceRoot,
    );
    for (const old of source) {
      const n = {
        ...old,
        id: old.id === sourceRoot ? newRoot : `jm-${crypto.randomUUID()}`,
        pageId,
        parentId: old.id === sourceRoot ? null : newRoot,
        targetId: null,
      };
      if (old.id === sourceRoot) n.name = page.name;
      if (n.text.includes("Everyday"))
        n.text = n.text.replaceAll("Everyday", title);
      if (n.text === "EVERYDAY") n.text = title.toUpperCase();
      if (n.text.startsWith("MEMO BOOK 01"))
        n.text = `MEMO BOOK ${number} · ${count} NOTES`;
      if (n.text === "A quieter morning") n.text = heading;
      if (n.text.includes("Note 012"))
        n.text = n.text.replace("012", count.padStart(3, "0"));
      if (n.x === 611 && n.y >= 350 && n.y <= 606) {
        const idx = (n.y - 350) / 32;
        if (Number.isInteger(idx)) n.text = copy[idx] || "";
      }
      ops.push({ type: "node.add", node: n });
      if (old.targetId) {
        let target =
          old.targetId === m.roots.notebook
            ? ids.book
            : old.targetId === m.roots.newnote
              ? ids.fresh
              : old.targetId;
        patches.push({
          type: "node.update",
          id: n.id,
          patch: { targetId: target },
        });
      }
    }
  }
  for (const n of s.document.nodes.filter(
    (n: any) => n.parentId === m.roots.notes && n.targetId === m.roots.notebook,
  )) {
    if (
      (key === "work" && n.x >= 590 && n.x < 927) ||
      (key === "out" && n.x >= 927)
    )
      patches.push({
        type: "node.update",
        id: n.id,
        patch: { targetId: ids.book },
      });
  }
}
let rev = s.revision;
for (let i = 0; i < ops.length; i += 240) {
  const r = await t("transaction.apply", {
    documentId: s.documentId,
    expectedRevision: rev,
    requestId: crypto.randomUUID(),
    operations: ops.slice(i, i + 240),
  });
  rev = r.revision;
}
await t("transaction.apply", {
  documentId: s.documentId,
  expectedRevision: rev,
  requestId: crypto.randomUUID(),
  operations: patches,
});
const live = await t("document.get");
saved.document.pages = m.pages;
saved.document.nodes = live.document.nodes.filter((n: any) =>
  m.pages.some((p: any) => p.id === n.pageId),
);
m.nodeCount = saved.document.nodes.length;
await Bun.write("designs/just-maple/screens.json", JSON.stringify(m, null, 2));
await Bun.write(
  "designs/just-maple/Just Maple.syrup/document.json",
  JSON.stringify(new DocumentStore(saved.document).checkpoint(), null, 2),
);
for (const [key, id] of Object.entries(m.roots))
  await Bun.write(
    `designs/just-maple/previews/${key}.html`,
    `<!doctype html><html><meta charset="utf-8"><style>p{white-space:pre-wrap}</style><body style="margin:0;background:#fdfbf7">${exportNode(saved.document, id as string, "html")}</body></html>`,
  );
await c.close();
console.log(
  "All three covers now open their matching notebook and new-note screen.",
);
