import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { homedir } from "node:os";
import { NodeSchema } from "../../src/web/src/app/model/schema";
import { DocumentStore } from "../../src/web/src/app/model/store";
import { exportNode } from "../../src/web/src/app/model/export";
const meta = await Bun.file("designs/just-maple/screens.json").json();
if (meta.roots.notes)
  throw Error(
    "Notebook designs already exist; edit the existing pages instead.",
  );
const c = new Client({ name: "Notebook design author", version: "1" });
const token = await Bun.file(
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
const current = await t("document.get"),
  saved = await Bun.file(
    "designs/just-maple/Just Maple.syrup/document.json",
  ).json();
const home = current.document.nodes.find((n: any) => n.id === meta.roots.home);
if (!home) throw Error("Open the Just Maple design document first.");
const C = {
  bg: "#fdfbf7",
  paper: "#fffdf5",
  alt: "#f5f2eb",
  ink: "#292524",
  muted: "#78716c",
  line: "#e7e5e4",
  accent: "#993629",
  tint: "#f5e6e4",
  kraft: "#c4a77d",
};
const run = crypto.randomUUID().slice(0, 8),
  added: any[] = [],
  ops: any[] = [],
  newPages: any[] = [],
  newRoots: any = {};
let root = "",
  pageId = "",
  count = 0;
for (const key of ["notes", "notebook", "newnote"]) {
  newRoots[key] = `jm-${run}-${key}`;
  newPages.push({
    id: `jm-${run}-p-${key}`,
    name: {
      notes: "12 · Notes / notebook shelf",
      notebook: "13 · Everyday / open notebook",
      newnote: "14 · Everyday / new note",
    }[key],
    order: meta.pages.length + newPages.length,
  });
}
function n(
  kind: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  more: any = {},
) {
  const id = `jm-${run}-n-${++count}`;
  added.push(
    NodeSchema.parse({
      id,
      pageId,
      parentId: root,
      kind,
      name,
      x,
      y,
      width,
      height,
      padding: 0,
      order: 2000 + count,
      fill: C.bg,
      color: C.ink,
      ...more,
    }),
  );
  return id;
}
function box(
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fill = C.bg,
  radius = 0,
  strokeWidth = 0,
) {
  return n("frame", name, x, y, w, h, {
    fill,
    radius,
    strokeWidth,
    stroke: C.line,
  });
}
function text(
  text: string,
  x: number,
  y: number,
  w = 700,
  size = 16,
  color = C.ink,
  weight = 400,
  h?: number,
  targetId?: string,
) {
  return n(
    "text",
    text.replace(/\n/g, " ").slice(0, 100),
    x,
    y,
    w,
    h ?? Math.ceil(size * 1.3 * text.split("\n").length + 4),
    {
      text,
      fontSize: size,
      color,
      fontWeight: weight,
      fillEnabled: false,
      targetId: targetId ?? null,
    },
  );
}
function btn(
  label: string,
  x: number,
  y: number,
  w: number,
  target: string,
  primary = false,
) {
  return n("button", label, x, y, w, 40, {
    text: label,
    fontSize: 14,
    fontWeight: 600,
    fill: primary ? C.accent : C.bg,
    color: primary ? "#ffffff" : C.ink,
    radius: 7,
    stroke: C.line,
    strokeWidth: primary ? 0 : 1,
    targetId: target,
  });
}
const notePath =
  "M5 2 L20 2 L20 22 L5 22 Z M2 6 L7 6 M2 12 L7 12 M2 18 L7 18 M10 7 L16 7 M10 12 L16 12";
function noteIcon(x: number, y: number, color = C.muted) {
  return n("path", "Notebook icon", x, y, 20, 20, {
    pathData: notePath,
    viewBox: "0 0 24 24",
    fillEnabled: false,
    stroke: color,
    strokeWidth: 1.5,
    targetId: newRoots.notes,
  });
}
function navNodes() {
  text("Notes", 65, 414, 144, 14, C.accent, 600, 23, newRoots.notes);
  noteIcon(29, 413, C.accent);
}
// Add real prototype destinations to the existing Home-family sidebar.
for (const key of ["home", "why", "correct", "quiet"]) {
  const id = meta.roots[key];
  for (const old of current.document.nodes.filter(
    (v: any) => v.parentId === id,
  )) {
    if (
      old.text === "Activity" ||
      old.text === "Search" ||
      ["activity icon", "search icon"].includes(old.name)
    )
      ops.push({ type: "node.update", id: old.id, patch: { y: old.y + 49 } });
    if (old.name === "Sidebar divider")
      ops.push({ type: "node.update", id: old.id, patch: { y: 454 } });
    if (old.text === "Home")
      ops.push({
        type: "node.update",
        id: old.id,
        patch: { targetId: meta.roots.home },
      });
  }
  root = id;
  pageId = current.document.nodes.find((v: any) => v.id === id).pageId;
  text("Notes", 65, 414, 144, 14, C.ink, 400, 23, newRoots.notes);
  noteIcon(29, 413);
}
function shell(key: string) {
  const page = newPages.find((p) => p.id === `jm-${run}-p-${key}`);
  root = newRoots[key];
  pageId = page.id;
  added.push(
    NodeSchema.parse({
      ...home,
      id: root,
      pageId,
      name: page.name,
      order: 2000 + count++,
    }),
  );
  for (const old of current.document.nodes.filter(
    (v: any) => v.parentId === home.id && (v.x < 226 || v.y < 60),
  )) {
    const copy = {
      ...old,
      id: `jm-${run}-n-${++count}`,
      pageId,
      parentId: root,
      order: 2000 + count,
      targetId: null,
    };
    if (copy.name === "Selected navigation") copy.y = 405;
    if (copy.text === "Home") {
      copy.color = C.ink;
      copy.fontWeight = 400;
      copy.targetId = meta.roots.home;
    }
    if (copy.name === "home icon") {
      copy.stroke = C.muted;
      copy.fill = C.muted;
    }
    if (
      copy.text === "Activity" ||
      copy.text === "Search" ||
      ["activity icon", "search icon"].includes(copy.name)
    )
      copy.y += 49;
    if (copy.name === "Sidebar divider") copy.y = 454;
    added.push(copy);
  }
  navNodes();
}
shell("notes");
text("YOUR OWN WORDS", 266, 89, 750, 11, C.accent, 600);
text("Notes & notebooks", 266, 126, 900, 35, C.ink, 600);
text("A place for the things you want to keep.", 267, 184, 940, 15, C.muted);
btn("+ New note", 1097, 126, 141, newRoots.newnote, true);
text("NOTEBOOKS", 267, 239, 900, 11, C.muted, 600);
const books = [
  [
    "EVERYDAY",
    "01",
    "Small things. Good ideas.",
    "12 notes · Updated today",
    C.kraft,
    C.ink,
  ],
  [
    "WORKING\nTHOUGHTS",
    "02",
    "Space to work things out.",
    "8 notes · Updated yesterday",
    "#8b9173",
    "#172116",
  ],
  [
    "OUT &\nABOUT",
    "03",
    "Things noticed along the way.",
    "6 notes · Updated Sunday",
    "#806154",
    "#fff8e9",
  ],
];
books.forEach(([title, number, desc, metaText, fill, ink], i) => {
  const x = 267 + i * 331,
    y = 274;
  box("Notebook paper edge", x + 5, y + 7, 278, 354, "#e9e0cd", 10);
  const cover = box(`${title} notebook cover`, x, y, 278, 354, fill, 9);
  added.find((v) => v.id === cover).targetId = newRoots.notebook;
  box("Folded spine", x + 13, y + 12, 1, 330, i === 0 ? "#a98b65" : "#657057");
  text("MAPLE / MEMO BOOK", x + 28, y + 29, 225, 11, ink, 600);
  text(title, x + 28, y + 84, 228, 34, ink, 800, 100);
  box("Cover rule", x + 28, y + 196, 220, 1, ink);
  text(
    "No. " + number + "   /   PERSONAL NOTES",
    x + 28,
    y + 215,
    228,
    10,
    ink,
    600,
  );
  text(desc, x + 28, y + 261, 227, 14, ink, 400, 39);
  text("RULED  /  LOCAL FIRST", x + 28, y + 319, 227, 9, ink, 600);
  text(metaText, x, y + 376, 291, 12, C.muted);
  btn("Open notebook  →", x, y + 408, 278, newRoots.notebook);
});
text("Recently written", 267, 764, 650, 19, C.ink, 600);
text("A quieter morning", 267, 809, 368, 16, C.ink, 500, 27, newRoots.notebook);
text("Everyday · Today, 8:12 AM", 267, 841, 450, 12, C.muted);
text(
  "Questions for the next chapter",
  761,
  809,
  452,
  16,
  C.ink,
  500,
  27,
  newRoots.notebook,
);
text("Working thoughts · Yesterday", 761, 841, 450, 12, C.muted);
function notebook(key: string, blank = false) {
  shell(key);
  text(
    "Notes  /  Everyday",
    266,
    91,
    600,
    13,
    C.accent,
    500,
    24,
    newRoots.notes,
  );
  btn("All notebooks", 266, 134, 155, newRoots.notes);
  btn("+ New note", 1087, 84, 151, newRoots.newnote, true);
  box("Contents panel", 246, 199, 251, 657, C.alt, 12);
  text("EVERYDAY", 267, 223, 208, 17, C.ink, 700);
  text("MEMO BOOK 01 · 12 NOTES", 267, 253, 220, 10, C.muted, 600);
  const titles = [
    "A quieter morning",
    "A few things to remember",
    "Weekend observations",
    "Ideas without a home",
  ];
  titles.forEach((v, i) => {
    const y = 311 + i * 94;
    if (!blank && i === 0) box("Current note", 256, y - 10, 229, 80, C.tint, 7);
    text(
      v,
      270,
      y,
      206,
      14,
      i === 0 && !blank ? C.accent : C.ink,
      500,
      38,
      newRoots.notebook,
    );
    text(
      i === 0 ? "Today · 8:12 AM" : "September " + (20 - i),
      270,
      y + 47,
      205,
      11,
      C.muted,
    );
  });
  text("Only what you write here.", 267, 779, 215, 12, C.muted);
  text("Kept on this Mac.", 267, 803, 210, 12, C.muted);
  box("Paper shadow", 532, 204, 703, 657, "#e9e0cd", 10);
  box("Notebook paper", 527, 199, 703, 657, C.paper, 10);
  box("Binding gutter", 547, 210, 1, 630, "#e1d8c5");
  box("Left paper margin", 587, 218, 1, 612, "#dcc0b5");
  for (let y = 375; y < 823; y += 32)
    box("Ruled paper", 559, y, 642, 1, "#e7dfcc");
  text(
    blank ? "A fresh page" : "MONDAY, SEPTEMBER 21",
    611,
    227,
    579,
    11,
    C.muted,
    600,
  );
  text(
    blank ? "Untitled note" : "A quieter morning",
    611,
    274,
    579,
    30,
    C.ink,
    600,
  );
  text(
    blank ? "Everyday  /  New note" : "Everyday  /  Note 012",
    611,
    326,
    578,
    12,
    C.muted,
  );
  if (blank) {
    text(
      "Start with something worth remembering…",
      611,
      386,
      569,
      17,
      C.muted,
      400,
      30,
    );
    text("Your words. No prompt required.", 611, 450, 566, 15, C.muted);
    btn("Back to notebook", 994, 151, 234, newRoots.notebook);
  } else {
    const lines = [
      "Less input before the first cup of coffee.",
      "",
      "Leave a little room in the morning.",
      "Write down the one thing that matters today.",
      "",
      "A thought to keep:",
      "Not everything needs to become a task.",
      "",
      "Walk before lunch. Call Sarah this evening.",
    ];
    lines.forEach((line, i) => {
      if (line) text(line, 611, 350 + i * 32, 580, 16, C.ink, 400, 26);
    });
    text("Written by you · Today, 8:12 AM", 611, 817, 585, 11, C.muted);
  }
}
notebook("notebook");
notebook("newnote", true);
const mutations = [
  ...newPages.map((p) => ({ type: "page.add", id: p.id, name: p.name })),
  ...added.map((node) => ({
    type: "node.add",
    node: { ...node, targetId: null },
  })),
  ...added
    .filter((n) => n.targetId)
    .map((n) => ({
      type: "node.update",
      id: n.id,
      patch: { targetId: n.targetId },
    })),
  ...ops,
];
let revision = current.revision;
for (let i = 0; i < mutations.length; i += 240) {
  const receipt = await t("transaction.apply", {
    documentId: current.documentId,
    expectedRevision: revision,
    requestId: crypto.randomUUID(),
    operations: mutations.slice(i, i + 240),
  });
  revision = receipt.revision;
}
const live = await t("document.get");
meta.pages.push(...newPages);
Object.assign(meta.roots, newRoots);
saved.document.pages = meta.pages;
saved.document.nodes = live.document.nodes.filter((n: any) =>
  meta.pages.some((p: any) => p.id === n.pageId),
);
meta.nodeCount = saved.document.nodes.length;
await Bun.write(
  "designs/just-maple/Just Maple.syrup/document.json",
  JSON.stringify(new DocumentStore(saved.document).checkpoint(), null, 2),
);
await Bun.write(
  "designs/just-maple/screens.json",
  JSON.stringify(meta, null, 2),
);
for (const [key, id] of Object.entries(meta.roots))
  await Bun.write(
    `designs/just-maple/previews/${key}.html`,
    `<!doctype html><html><meta charset="utf-8"><style>p{white-space:pre-wrap}</style><body style="margin:0;background:#fdfbf7">${exportNode(saved.document, id as string, "html")}</body></html>`,
  );
await t("selection.set", { id: newRoots.notes });
await t("viewport.fit");
await c.close();
console.log(
  JSON.stringify({
    addedScreens: 3,
    totalScreens: meta.pages.length,
    nodes: meta.nodeCount,
  }),
);
