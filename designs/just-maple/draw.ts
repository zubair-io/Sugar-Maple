import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { homedir } from "node:os";
import { DocumentStore } from "../../src/web/src/app/model/store";
import {
  NodeSchema,
  validateDocument,
} from "../../src/web/src/app/model/schema";
import { exportNode } from "../../src/web/src/app/model/export";
const C = {
  bg: "#fdfbf7",
  surface: "#ffffff",
  alt: "#f5f2eb",
  ink: "#292524",
  muted: "#78716c",
  line: "#e7e5e4",
  accent: "#993629",
  tint: "#f5e6e4",
  green: "#166534",
  greenBg: "#dcfce7",
};
const run = crypto.randomUUID().slice(0, 8),
  pages: any[] = [],
  nodes: any[] = [],
  links: any[] = [];
let pageId = "",
  root = "",
  counter = 0;
const roots: Record<string, string> = {};
function node(
  kind: string,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: any = {},
  parent = root,
) {
  const id = `jm-${run}-${++counter}`;
  nodes.push(
    NodeSchema.parse({
      id,
      pageId,
      parentId: parent,
      kind,
      name,
      x,
      y,
      width: w,
      height: h,
      padding: 0,
      fill: C.surface,
      color: C.ink,
      order: counter,
      ...extra,
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
  fill = C.surface,
  radius = 12,
  border = false,
) {
  return node("frame", name, x, y, w, h, {
    fill,
    radius,
    stroke: C.line,
    strokeWidth: border ? 1 : 0,
    fillToken: `jm-${Object.entries(C).find(([, v]) => v === fill)?.[0] ?? "surface"}`,
  });
}
function text(
  value: string,
  x: number,
  y: number,
  w = 500,
  size = 16,
  color = C.ink,
  weight = 400,
  h?: number,
) {
  return node(
    "text",
    value.replace(/\n/g, " ").slice(0, 100),
    x,
    y,
    w,
    h ?? Math.ceil(size * 1.25 * value.split("\n").length + 4),
    {
      text: value,
      fontSize: size,
      color,
      fontWeight: weight,
      fillEnabled: false,
    },
  );
}
function button(
  label: string,
  x: number,
  y: number,
  w = 160,
  primary = true,
  target?: string,
) {
  const id = node("button", label, x, y, w, 44, {
    text: label,
    fontSize: 14,
    fontWeight: 600,
    fill: primary ? C.accent : C.surface,
    fillToken: primary ? "jm-accent" : "jm-surface",
    color: primary ? "#ffffff" : C.ink,
    radius: 8,
    stroke: C.line,
    strokeWidth: primary ? 0 : 1,
  });
  if (target) links.push({ id, target });
  return id;
}
function pill(
  label: string,
  x: number,
  y: number,
  w: number,
  fill = C.alt,
  color = C.muted,
) {
  box(label, x, y, w, 28, fill, 14);
  text(label, x + 12, y + 6, w - 20, 12, color, 600);
}
const paths: Record<string, string> = {
  leaf: "M12 2 L15 8 L20 5 L18 11 L23 12 L16 16 L17 21 L12 19 L7 21 L8 16 L1 12 L6 11 L4 5 L9 8 Z",
  home: "M3 11 L12 3 L21 11 M6 9 L6 21 L18 21 L18 9 M10 21 L10 14 L14 14 L14 21",
  person: "M16 7 A4 4 0 1 1 8 7 A4 4 0 1 1 16 7 M4 22 C4 13 20 13 20 22",
  mail: "M3 5 L21 5 L21 19 L3 19 Z M3 5 L12 13 L21 5",
  calendar: "M4 5 L20 5 L20 21 L4 21 Z M4 10 L20 10 M8 2 L8 8 M16 2 L16 8",
  file: "M6 2 L15 2 L20 7 L20 22 L6 22 Z M15 2 L15 7 L20 7 M9 12 L17 12 M9 16 L17 16",
  check: "M4 12 L10 18 L21 5",
  shield:
    "M12 2 L21 6 L20 15 Q18 20 12 23 Q6 20 4 15 L3 6 Z M8 12 L11 15 L17 9",
  search: "M16 10 A6 6 0 1 1 4 10 A6 6 0 1 1 16 10 M15 15 L22 22",
  spark: "M12 2 L15 9 L22 12 L15 15 L12 22 L9 15 L2 12 L9 9 Z",
  jobs: "M4 7 L20 7 L20 21 L4 21 Z M8 7 L8 3 L16 3 L16 7 M4 12 L20 12",
  activity: "M2 12 L6 12 L10 3 L14 21 L18 12 L22 12",
  link: "M10 7 L13 4 Q19 0 22 6 Q24 9 20 13 L17 16 M14 17 L11 20 Q5 24 2 18 Q0 15 4 11 L7 8 M8 16 L16 8",
  phone: "M7 2 L17 2 L17 22 L7 22 Z M10 18 L14 18",
  arrow: "M3 12 L21 12 M15 6 L21 12 L15 18",
};
function icon(
  which: string,
  x: number,
  y: number,
  size = 22,
  color = C.accent,
) {
  return node("path", `${which} icon`, x, y, size, size, {
    pathData: paths[which] ?? paths.spark,
    viewBox: "0 0 24 24",
    fillEnabled: which === "leaf",
    fill: color,
    stroke: color,
    strokeWidth: which === "leaf" ? 0 : 1.5,
  });
}
function window(name: string, key: string) {
  pageId = `jm-${run}-page-${key}`;
  pages.push({ id: pageId, name, order: pages.length });
  root = `jm-${run}-screen-${key}`;
  roots[key] = root;
  nodes.push(
    NodeSchema.parse({
      id: root,
      pageId,
      parentId: null,
      kind: "artboard",
      name,
      width: 1280,
      height: 900,
      fill: C.bg,
      fillToken: "jm-bg",
      padding: 0,
      order: counter++,
    }),
  );
  box("Mac title bar", 0, 0, 1280, 54, C.bg, 0);
  ["#ff6058", "#ffbd2e", "#28c840"].forEach((fill, i) =>
    node("ellipse", "Window control", 20 + i * 20, 21, 12, 12, { fill }),
  );
  text("Just Maple", 582, 19, 140, 13, C.muted, 600);
  box("Title separator", 0, 53, 1280, 1, C.line, 0);
}
const steps = [
  "Hello",
  "About you",
  "Your starting point",
  "Your connections",
  "Your intelligence",
  "Your world",
];
function wizard(
  name: string,
  key: string,
  step: number,
  kicker: string,
  title: string,
  sub: string,
) {
  window(name, key);
  box("Onboarding rail", 0, 54, 280, 846, C.alt, 0);
  icon("leaf", 34, 91, 28);
  text("Just Maple", 76, 96, 160, 21, C.ink, 600);
  text("A little context.\nA clearer everyday.", 34, 161, 214, 21, C.ink, 500);
  steps.forEach((s, i) => {
    if (i === step) box("Current step", 22, 257 + i * 52, 236, 42, C.tint, 8);
    if (i < step) icon("check", 37, 269 + i * 52, 17);
    else
      text(
        String(i + 1).padStart(2, "0"),
        38,
        269 + i * 52,
        24,
        12,
        i === step ? C.accent : C.muted,
        600,
      );
    text(
      s,
      77,
      268 + i * 52,
      171,
      14,
      i === step ? C.accent : C.muted,
      i === step ? 600 : 400,
    );
  });
  icon("shield", 34, 764, 20, C.muted);
  text("Your knowledge lives here.", 64, 765, 195, 12, C.muted, 600);
  text("On your Mac. In your control.", 34, 794, 221, 12, C.muted);
  text(kicker.toUpperCase(), 344, 112, 850, 12, C.accent, 600);
  text(title, 344, 148, 864, 36, C.ink, 600);
  text(sub, 344, 207, 834, 16, C.muted, 400, 55);
  text("You can change this anytime.", 344, 839, 400, 12, C.muted);
}
function footer(next: string, target: string, back?: string, skip?: string) {
  if (back) button("Back", 344, 770, 90, false, back);
  if (skip) button("Skip for now", 916, 770, 130, false, skip);
  button(next, 1062, 770, 154, true, target);
}
// 01 Welcome
window("01 · Welcome", "welcome");
pill("PRIVATE BY DESIGN", 88, 152, 178, C.tint, C.accent);
text(
  "Your personal\nintelligence,\nbuilt around you.",
  88,
  224,
  570,
  56,
  C.ink,
  600,
);
text(
  "Connect the information already in your life.\nMaple helps you understand what matters,\nand keeps that understanding yours.",
  90,
  468,
  550,
  19,
  C.muted,
  400,
  90,
);
button("Get started  →", 90, 604, 192, true, "about");
text(
  "Local first  ·  You control your data  ·  Correct anything",
  90,
  684,
  550,
  13,
  C.muted,
);
box("Welcome illustration field", 730, 137, 464, 589, C.alt, 28);
icon("leaf", 927, 172, 60);
box("Personal context preview", 766, 264, 392, 123, C.surface, 16, true);
pill("YOU, RIGHT NOW", 787, 284, 144, C.tint, C.accent);
text("Home. Focused. A little ahead.", 788, 332, 346, 21, C.ink, 500);
box("Useful signal preview", 794, 414, 338, 148, C.surface, 16, true);
icon("spark", 815, 436);
text("The things worth noticing", 848, 437, 262, 16, C.ink, 600);
text(
  "A changed plan. An important reply.\nThe next step toward your goals.",
  816,
  478,
  290,
  14,
  C.muted,
);
box("Trust preview", 766, 590, 392, 88, C.surface, 16, true);
icon("shield", 788, 618, 25);
text("Always a reason. Always your say.", 832, 622, 303, 14, C.ink, 500);
text("A calmer way to keep up with your world.", 789, 747, 400, 14, C.muted);
// 02 About
wizard(
  "02 · About you",
  "about",
  1,
  "Start with the simple things",
  "What should Maple call you?",
  "Just the essentials. We can discover the rest together.",
);
text("YOUR NAME", 344, 324, 500, 12, C.muted, 600);
node("input", "Your name", 344, 355, 588, 60, {
  text: "Zubair",
  fontSize: 24,
  fill: C.surface,
  radius: 10,
  stroke: C.line,
  strokeWidth: 1,
});
text("This is how Maple will greet you.", 344, 432, 650, 14, C.muted);
box("Control reminder", 344, 527, 834, 114, C.alt, 12);
icon("person", 367, 557, 26);
text("You are more than a profile form.", 414, 549, 707, 19, C.ink, 600);
text(
  "Add what feels useful. Leave the rest for later.",
  414,
  585,
  707,
  15,
  C.muted,
);
footer("Continue  →", "import", "welcome");
// 03 Import
wizard(
  "03 · Bring your context",
  "import",
  2,
  "A starting point",
  "You already have a story.",
  "Give Maple something that describes you. A résumé or short bio is a good start.",
);
box("Document drop zone", 344, 296, 834, 293, C.surface, 16, true);
icon("file", 724, 328, 48);
text("Drop your résumé here", 604, 407, 425, 24, C.ink, 600);
text(
  "PDF or DOCX  ·  Choose only what you want to share",
  532,
  453,
  620,
  14,
  C.muted,
);
button("Choose file", 678, 505, 166, false, "learned");
box("Import disclosure", 344, 625, 834, 68, C.alt, 10);
icon("shield", 366, 647);
text(
  "You review every suggestion before it becomes part of your profile.",
  405,
  650,
  742,
  14,
  C.muted,
);
footer("Use sample  →", "learned", "about", "connect");
// 04 Learned
wizard(
  "04 · Review imported facts",
  "learned",
  2,
  "From your résumé",
  "Here’s a first picture of you.",
  "These are suggestions, not a final word. Keep what is right and change what is not.",
);
pill("SAMPLE DOCUMENT · résumé.pdf", 344, 276, 272, C.alt);
box("Imported profile", 344, 327, 834, 341, C.surface, 14, true);
text("Zubair Lawrence", 372, 354, 500, 27, C.ink, 600);
pill("Needs your review", 982, 352, 168, C.tint, C.accent);
const facts = [
  ["ROLE", "Software engineer"],
  ["LOCATION", "New York"],
  ["FOCUS", "Distributed systems · TypeScript"],
  ["EXPERIENCE", "Netflix · Staff Engineer"],
];
facts.forEach(([label, value], i) => {
  let y = 418 + i * 57;
  text(label, 372, y, 150, 11, C.muted, 600);
  text(value, 528, y - 2, 470, 16);
  text("Edit", 1108, y, 42, 13, C.accent, 600);
  if (i < 3) box("Row divider", 372, y + 37, 778, 1, C.line, 0);
});
text(
  "Source: résumé.pdf · Imported just now · All facts are editable",
  344,
  695,
  850,
  13,
  C.muted,
);
footer("Keep & continue", "connect", "import");
// 05 connectors
wizard(
  "05 · Connect your world",
  "connect",
  3,
  "Your connections",
  "Connect the places life happens.",
  "Start with one or two. Each connection can be paused or removed whenever you like.",
);
const connectors = [
  [
    "mail",
    "Gmail",
    "Conversations & commitments",
    "Connected · 38 people found",
  ],
  [
    "calendar",
    "Google Calendar",
    "Events, people & plans",
    "Connected · 4 upcoming events",
  ],
  ["mail", "iMessage", "People you keep close", "Connect"],
  ["calendar", "Apple Calendar", "Your calendars on this Mac", "Connect"],
  ["file", "Files & notes", "A folder you choose", "Choose folder"],
  ["home", "Home Assistant", "A little context from home", "Connect"],
];
connectors.forEach(([ic, title, sub, state], i) => {
  const x = 344 + (i % 2) * 432,
    y = 287 + Math.floor(i / 2) * 142;
  box(title + " connection", x, y, 402, 124, C.surface, 12, true);
  icon(ic, x + 20, y + 22, 24);
  text(title, x + 60, y + 20, 312, 18, C.ink, 600);
  text(sub, x + 60, y + 51, 314, 13, C.muted);
  text(
    state.startsWith("Connected") ? "✓ " + state : state + "  →",
    x + 60,
    y + 87,
    322,
    12,
    state.startsWith("Connected") ? C.green : C.accent,
    600,
  );
});
text(
  "Pair your iPhone later for location and presence.",
  344,
  737,
  700,
  13,
  C.muted,
);
footer("Continue  →", "providers", "learned", "providers");
// 06 Intelligence
wizard(
  "06 · Choose intelligence",
  "providers",
  4,
  "Your intelligence",
  "Your knowledge stays yours.",
  "Choose what helps Maple reason. Your personal model belongs to the app, not a provider.",
);
const providers = [
  [
    "Claude",
    "Connect your Claude account",
    "For deeper reasoning",
    "Connect",
    "spark",
  ],
  [
    "ChatGPT / Codex",
    "Connect your ChatGPT account",
    "For deeper reasoning",
    "Connect",
    "spark",
  ],
  [
    "Local model",
    "Reason on this Mac",
    "Keep reasoning on-device",
    "Configure",
    "shield",
  ],
];
providers.forEach(([title, sub, note, action, ic], i) => {
  let x = 344 + i * 286;
  box(title, x, 309, 262, 268, C.surface, 14, true);
  icon(ic, x + 24, 334, 30);
  text(title, x + 24, 389, 228, 22, C.ink, 600);
  text(sub, x + 24, 438, 217, 14, C.muted, 400, 40);
  text(note, x + 24, 480, 225, 12, C.muted);
  button(action, x + 24, 514, 214, false);
});
box("Provider disclosure", 344, 621, 834, 91, C.alt, 10);
icon("shield", 367, 646, 24);
text("You decide what leaves this Mac.", 412, 640, 725, 16, C.ink, 600);
text(
  "A cloud provider may receive relevant context when you use it. Review sharing in Connections.",
  412,
  671,
  722,
  13,
  C.muted,
);
footer("Continue  →", "review", "connect", "review");
// 07 Review
wizard(
  "07 · Your first understanding",
  "review",
  5,
  "Your world, taking shape",
  "Does this feel like you?",
  "A starting point, grounded in the sources you chose. Nothing here is beyond correction.",
);
box("Profile summary", 344, 288, 834, 103, C.surface, 14, true);
node("ellipse", "Profile monogram background", 366, 308, 62, 62, {
  fill: C.tint,
});
text("Z", 386, 320, 38, 30, C.accent, 600);
text("Zubair Lawrence", 452, 309, 540, 24, C.ink, 600);
text("Software engineer  ·  New York", 452, 350, 550, 14, C.muted);
button("Edit profile", 1003, 320, 151, false, "learned");
const summaries = [
  ["person", "People", "38 people, a few familiar faces", "From Gmail"],
  [
    "calendar",
    "Coming up",
    "Design catch-up · Tomorrow, 10 AM",
    "From Google Calendar",
  ],
  [
    "jobs",
    "In progress",
    "Job search · Offer accepted",
    "Suggested from your email",
  ],
];
summaries.forEach(([ic, title, value, source], i) => {
  let y = 416 + i * 87;
  icon(ic, 360, y + 12, 24);
  text(title, 405, y + 2, 700, 13, C.muted, 600);
  text(value, 405, y + 25, 710, 18, C.ink, 500);
  text(source, 405, y + 54, 710, 12, C.muted);
});
text(
  "Your connections keep this picture current. You can correct it at any time.",
  344,
  706,
  850,
  14,
  C.muted,
);
footer("Looks good  →", "home", "providers");
function shell(name: string, key: string) {
  window(name, key);
  box("Sidebar", 0, 54, 226, 846, C.alt, 0);
  icon("leaf", 26, 86, 27);
  text("Just Maple", 67, 91, 150, 20, C.ink, 600);
  const nav = [
    ["home", "Home"],
    ["person", "Me"],
    ["person", "People"],
    ["jobs", "Jobs"],
    ["home", "Places"],
    ["activity", "Activity"],
    ["search", "Search"],
  ];
  nav.forEach(([ic, label], i) => {
    let y = 160 + i * 49 + (i > 4 ? 24 : 0);
    if (i === 0) box("Selected navigation", 14, y - 9, 198, 41, C.tint, 8);
    icon(ic, 29, y, 20, i === 0 ? C.accent : C.muted);
    text(
      label,
      65,
      y + 1,
      144,
      14,
      i === 0 ? C.accent : C.ink,
      i === 0 ? 600 : 400,
    );
  });
  box("Sidebar divider", 25, 405, 176, 1, C.line, 0);
  icon("link", 29, 738, 20, C.muted);
  text("Connections", 65, 739, 144, 14);
  node("ellipse", "Account avatar", 26, 812, 34, 34, { fill: C.tint });
  text("Z", 37, 820, 24, 16, C.accent, 600);
  text("Zubair", 72, 810, 128, 14, C.ink, 600);
  text("Local workspace", 72, 833, 139, 11, C.muted);
  text("MONDAY, SEPTEMBER 21", 266, 85, 600, 11, C.muted, 600);
  pill("On this Mac", 1113, 78, 126, C.alt);
  text("Good morning, Zubair.", 266, 119, 950, 34, C.ink, 600);
  text("Home  ·  Working  ·  Next event in 1h 20m", 268, 172, 800, 14, C.muted);
  box("Ask bar", 266, 816, 972, 58, C.surface, 12, true);
  icon("spark", 286, 834, 22);
  text("Ask about anything in your world…", 323, 837, 775, 15, C.muted);
  pill("⌘ K", 1162, 832, 56, C.alt);
}
// 08 Home
shell("08 · Home / morning brief", "home");
text("Needs your attention", 266, 233, 620, 21, C.ink, 600);
pill("1 to review", 1117, 230, 120, C.tint, C.accent);
box("Interview conflict", 266, 278, 608, 219, C.surface, 14, true);
box("Attention accent", 266, 295, 3, 44, C.accent, 0);
icon("mail", 289, 303, 23);
text("Close the loop with Acme?", 326, 302, 501, 21, C.ink, 600);
text(
  "They asked to schedule another interview.\nYour job search says you’ve accepted an offer.",
  290,
  345,
  559,
  16,
  C.muted,
  400,
  49,
);
text("Gmail  ·  12 min ago  ·  Based on 2 sources", 291, 409, 555, 12, C.muted);
button("Review", 291, 443, 120, true, "why");
button("Dismiss", 426, 443, 113, false);
text("Why this?", 748, 457, 108, 13, C.accent, 600);
box("Upcoming card", 896, 278, 342, 219, C.alt, 14);
pill("UP NEXT · 10:00 AM", 918, 299, 179, C.surface);
text("Design catch-up", 918, 347, 295, 23, C.ink, 600);
text(
  "With Maya and Jon\nGoogle Calendar · In 1h 20m",
  918,
  387,
  290,
  14,
  C.muted,
  400,
  40,
);
text("Review meeting context  →", 918, 455, 298, 14, C.accent, 600);
text("Your world", 266, 526, 560, 20, C.ink, 600);
const world = [
  ["person", "You", "Home · Working"],
  ["person", "People", "38 known · 6 recent"],
  ["jobs", "Jobs", "3 active"],
  ["home", "Places", "Home · All quiet"],
];
world.forEach(([ic, title, sub], i) => {
  let x = 266 + i * 249;
  box(title + " world card", x, 566, 225, 102, C.surface, 12, true);
  icon(ic, x + 17, 584, 21);
  text(title, x + 50, 585, 160, 16, C.ink, 600);
  text(sub, x + 17, 628, 198, 13, C.muted);
});
text("Active in your life", 266, 701, 540, 18, C.ink, 600);
text("Job search", 266, 742, 230, 15, C.ink, 500);
pill("Offer accepted", 433, 735, 137, C.tint, C.accent);
text("Fitness", 619, 742, 180, 15, C.ink, 500);
text("3 workouts this week", 727, 744, 233, 13, C.muted);
text("Recently learned", 997, 701, 237, 18, C.ink, 600);
text("Sarah is your sister", 997, 740, 238, 14);
text("Messages · Review →", 997, 765, 238, 12, C.accent);
// 09 Explainable detail
shell("09 · Home / evidence and correction", "why");
text("NEEDS YOUR ATTENTION", 266, 229, 800, 12, C.accent, 600);
text("Close the loop with Acme?", 266, 267, 916, 30, C.ink, 600);
text(
  "A scheduling request may conflict with your current plans.",
  266,
  312,
  950,
  16,
  C.muted,
);
box("Evidence panel", 266, 365, 594, 359, C.surface, 14, true);
text("Why Maple brought this up", 290, 391, 550, 20, C.ink, 600);
const reasons = [
  ["1", "A new interview request", "Acme recruiting · Gmail · Today, 8:48 AM"],
  ["2", "An accepted offer", "Offer confirmation · Gmail · Friday"],
  [
    "3",
    "Your job search is winding down",
    "Inferred from those messages · Needs confirmation",
  ],
];
reasons.forEach(([n, title, detail], i) => {
  let y = 447 + i * 86;
  pill(n, 289, y, 32, C.tint, C.accent);
  text(title, 336, y + 1, 499, 17, C.ink, 600);
  text(detail, 336, y + 32, 490, 12, C.muted);
});
box("Decision panel", 883, 365, 355, 359, C.alt, 14);
text("What would you like to do?", 905, 392, 309, 21, C.ink, 600, 55);
text(
  "You are in control. Maple hasn’t\nsent a message or changed\nyour job search.",
  905,
  464,
  306,
  15,
  C.muted,
  400,
  65,
);
button("Keep reviewing", 905, 557, 311, true, "home");
button("My status is wrong", 905, 617, 311, false, "correct");
text("Open source ↗", 291, 750, 250, 14, C.accent, 600);
text("Dismiss this suggestion", 966, 750, 286, 14, C.muted);
// 10 Correction
shell("10 · Correct an understanding", "correct");
text("YOUR UNDERSTANDING", 266, 229, 800, 12, C.accent, 600);
text("Where is your job search now?", 266, 267, 940, 30, C.ink, 600);
text(
  "Your correction takes priority over what Maple inferred.",
  266,
  317,
  940,
  16,
  C.muted,
);
box("Correction form", 266, 374, 972, 344, C.surface, 14, true);
text("CURRENT BELIEF", 294, 400, 900, 12, C.muted, 600);
pill("Offer accepted · Inferred", 294, 429, 229, C.tint, C.accent);
text("Replace with", 294, 493, 900, 15, C.ink, 600);
["Still interviewing", "Offer accepted", "Taking a break"].forEach((v, i) => {
  box(v, 294 + i * 301, 531, 280, 62, i === 0 ? C.tint : C.bg, 9, true);
  text(
    (i === 0 ? "●  " : "○  ") + v,
    313 + i * 301,
    552,
    249,
    15,
    i === 0 ? C.accent : C.ink,
    500,
  );
});
text(
  "This updates your current state. The original evidence stays available.",
  294,
  626,
  888,
  14,
  C.muted,
);
button("Save correction", 1049, 746, 189, true, "home");
button("Cancel", 930, 746, 101, false, "why");
// 11 quieter home / first-run state
shell("11 · Home / first day", "quiet");
text("A little more context, at your pace.", 266, 251, 951, 30, C.ink, 600);
text(
  "Nothing needs your attention right now. Maple is just getting to know your world.",
  266,
  307,
  950,
  16,
  C.muted,
);
box("First day next step", 266, 373, 972, 200, C.surface, 14, true);
icon("calendar", 296, 405, 38);
text("Bring your day into view", 356, 403, 822, 23, C.ink, 600);
text(
  "Connect a calendar to see upcoming plans and the people involved.",
  356,
  448,
  816,
  16,
  C.muted,
);
button("Connect a calendar", 356, 501, 212, true, "connect");
text("Or keep exploring", 266, 621, 931, 20, C.ink, 600);
const empty = [
  [
    "person",
    "Your profile",
    "Review the starting point you shared.",
    "learned",
  ],
  ["jobs", "What matters to you", "Add a goal when you are ready.", "review"],
  [
    "shield",
    "Your data, your call",
    "Manage connections and sharing.",
    "connect",
  ],
];
empty.forEach(([ic, title, sub, target], i) => {
  let x = 266 + i * 332;
  box(title, x, 663, 308, 112, C.alt, 12);
  icon(ic, x + 18, 682, 22);
  text(title, x + 53, 683, 249, 16, C.ink, 600);
  text(sub, x + 18, 724, 271, 13, C.muted, 400, 38);
});
const linkOps = links.map((l) => ({
  type: "node.update",
  id: l.id,
  patch: { targetId: roots[l.target], transition: "dissolve" },
}));
const client = new Client({ name: "Just Maple design author", version: "1" });
const token = await Bun.file(
  `${homedir()}/Library/Application Support/SugarMaple/mcp-token`,
).text();
await client.connect(
  new StreamableHTTPClientTransport(new URL("http://127.0.0.1:48480/mcp"), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);
async function tool(name: string, args: any = {}) {
  const r: any = await client.callTool({ name, arguments: args });
  if (r.isError) throw Error(JSON.stringify(r));
  return JSON.parse(r.content[0].text);
}
try {
  const before = await tool("document.get");
  let revision = before.revision;
  const ops: any[] = [
    ...pages.map((p) => ({ type: "page.add", id: p.id, name: p.name })),
    ...Object.entries(C).map(([key, value]) => ({
      type: "token.set",
      name: `jm-${key}`,
      value,
    })),
    ...nodes.map((n) => ({ type: "node.add", node: n })),
    ...linkOps,
  ];
  for (let i = 0; i < ops.length; i += 240) {
    const r = await tool("transaction.apply", {
      documentId: before.documentId,
      expectedRevision: revision,
      requestId: crypto.randomUUID(),
      operations: ops.slice(i, i + 240),
    });
    revision = r.revision;
  }
  const current = await tool("document.get");
  const document = {
    version: 1,
    id: `just-maple-${run}`,
    name: "Just Maple · Mac onboarding & Home · Light",
    pages,
    nodes: current.document.nodes.filter((n: any) =>
      pages.some((p) => p.id === n.pageId),
    ),
    tokens: Object.fromEntries(
      Object.entries(C).map(([k, v]) => [`jm-${k}`, v]),
    ),
  };
  validateDocument(document as any);
  const checkpoint = new DocumentStore(document as any).checkpoint();
  DocumentStore.fromCheckpoint(checkpoint);
  await Bun.write(
    "designs/just-maple/Just Maple.syrup/document.json",
    JSON.stringify(checkpoint, null, 2),
  );
  await Bun.write(
    "designs/just-maple/screens.json",
    JSON.stringify({ roots, pages, nodeCount: document.nodes.length }, null, 2),
  );
  for (const [key, id] of Object.entries(roots)) {
    const html = exportNode(document as any, id, "html");
    await Bun.write(
      `designs/just-maple/previews/${key}.html`,
      `<!doctype html><html><meta charset="utf-8"><title>Just Maple · ${key}</title><style>p{white-space:pre-wrap}</style><body style="margin:0;background:${C.bg};font-family:system-ui">${html}</body></html>`,
    );
  }
  await tool("selection.set", { id: roots.home });
  await tool("viewport.fit");
  const image: any = await client.callTool({
    name: "render.capture",
    arguments: { documentId: before.documentId, expectedRevision: revision },
  });
  if (image.isError) throw Error(JSON.stringify(image));
  await Bun.write(
    "designs/just-maple/previews/sugar-maple-native.png",
    Buffer.from(image.content[0].data, "base64"),
  );
  console.log(
    JSON.stringify({
      pages: pages.length,
      nodes: document.nodes.length,
      links: links.length,
      revision,
      document: "designs/just-maple/Just Maple.syrup",
    }),
  );
} finally {
  await client.close();
}
