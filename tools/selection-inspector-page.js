window.canvasTransformAcceptance = async function () {
  const check = (v, m) => {
    if (!v) throw Error(m);
  };
  const dispatch = (name, args) => window.sugarMaple.dispatch(name, args);
  const settle = () => dispatch("layout.inspect");
  const checkpoint = async () =>
    JSON.stringify(await dispatch("document.checkpoint"));
  const clickText = (selector, text) => {
    const b = [...document.querySelectorAll(selector)].find(
      (b) => b.textContent.trim() === text,
    );
    check(b, text + " exists");
    b.click();
  };
  const mode = async (name) => {
    clickText(".mode-switch button", name);
    await settle();
  };
  const field = (label) =>
    document.querySelector('[aria-label="Selection ' + label + '"]');
  const change = async (label, value) => {
    const el = field(label);
    check(el, label + " exists");
    el.value = String(value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
  };
  const tx = async (operations) => {
    const d = await dispatch("document.get");
    await dispatch("transaction.apply", {
      documentId: d.documentId,
      expectedRevision: d.revision,
      requestId: crypto.randomUUID(),
      operations,
    });
    await settle();
  };
  const undo = async () => {
    const d = await dispatch("document.get");
    await dispatch("history.undo", {
      documentId: d.documentId,
      expectedRevision: d.revision,
    });
    await settle();
  };
  let checks = 0;
  // Empty-canvas creation stays guarded outside Design; normal MCP writes remain supported.
  for (const name of ["Prototype", "Developer"]) {
    await mode(name);
    const before = await checkpoint();
    const create = document.querySelector(".empty-canvas button");
    check(create?.disabled, name + ": empty creation disabled");
    create.click();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", bubbles: true }),
    );
    await settle();
    check(
      (await checkpoint()) === before,
      name + ": pointer/shortcut attempts do not mutate",
    );
    checks++;
  }
  const d = await dispatch("document.get"),
    pageId = d.document.pages[0].id;
  await tx([
    {
      type: "node.add",
      node: {
        id: "multi-a",
        pageId,
        name: "Alpha",
        kind: "rectangle",
        x: 80,
        y: 80,
        width: 100,
        height: 80,
        fill: "#ff0000",
      },
    },
    {
      type: "node.add",
      node: {
        id: "multi-b",
        pageId,
        name: "Beta",
        kind: "rectangle",
        x: 240,
        y: 100,
        width: 160,
        height: 80,
        fill: "#00ff00",
      },
    },
    {
      type: "node.add",
      node: {
        id: "multi-text-a",
        pageId,
        name: "Text A",
        kind: "text",
        x: 20,
        y: 240,
        width: 160,
        height: 40,
        fontWeight: 400,
        text: "A",
      },
    },
    {
      type: "node.add",
      node: {
        id: "multi-text-b",
        pageId,
        name: "Text B",
        kind: "text",
        x: 220,
        y: 240,
        width: 160,
        height: 40,
        fontWeight: 700,
        text: "B",
      },
    },
    {
      type: "node.add",
      node: {
        id: "multi-parent",
        pageId,
        name: "Rotated",
        kind: "frame",
        x: 450,
        y: 300,
        width: 300,
        height: 200,
        rotation: 30,
      },
    },
    {
      type: "node.add",
      node: {
        id: "multi-child",
        pageId,
        parentId: "multi-parent",
        name: "Nested",
        kind: "rectangle",
        x: 30,
        y: 40,
        width: 50,
        height: 50,
      },
    },
    {
      type: "node.add",
      node: {
        id: "multi-managed",
        pageId,
        name: "Stack",
        kind: "frame",
        layout: "vertical",
        x: 20,
        y: 400,
        width: 160,
        height: 180,
      },
    },
    {
      type: "node.add",
      node: {
        id: "multi-managed-child",
        pageId,
        parentId: "multi-managed",
        name: "Managed",
        kind: "rectangle",
        width: 80,
        height: 60,
      },
    },
    { type: "component.create", id: "multi-a" },
  ]);
  await mode("Design");
  clickText('[aria-label="Sidebar sections"] button', "Layers");
  await settle();
  const select = async (ids) => {
    await dispatch("selection.set", { id: ids[0] });
    await settle();
    for (const id of ids.slice(1)) {
      const el = document.querySelector(
        '[data-layer-id="' + id + '"] [role="treeitem"]',
      );
      check(el, id + " mounted");
      el.dispatchEvent(
        new MouseEvent("click", { bubbles: true, shiftKey: true }),
      );
      await settle();
    }
    check(
      document.querySelector("selection-inspector"),
      "Multi-selection inspector is visible",
    );
  };
  await select(["multi-a", "multi-b"]);
  check(
    field("Fill").placeholder === "Mixed" && field("Fill").value === "",
    "Differing fills expose Mixed",
  );
  check(field("Height").value === "80", "Shared height exposed");
  check(
    !document.querySelector('selection-inspector [aria-label="Layer name"]'),
    "Single-node names not offered as batch",
  );
  checks++;
  const beforeFill = (await dispatch("document.get")).document;
  await change("Fill", "#abcdef");
  let current = (await dispatch("document.get")).document;
  check(
    ["multi-a", "multi-b"].every(
      (id) => current.nodes.find((n) => n.id === id).fill === "#abcdef",
    ),
    "Fill changes both roots",
  );
  await undo();
  check(
    JSON.stringify((await dispatch("document.get")).document) ===
      JSON.stringify(beforeFill),
    "One undo restores both fills",
  );
  checks++;
  const beforeMove = await settle();
  const priorA = beforeMove.nodes.find((n) => n.id === "multi-a").bounds,
    priorB = beforeMove.nodes.find((n) => n.id === "multi-b").bounds;
  const oldX = Number(field("X").value);
  await change("X", oldX + 40);
  const afterMove = await settle();
  for (const [id, b] of [
    ["multi-a", priorA],
    ["multi-b", priorB],
  ]) {
    const next = afterMove.nodes.find((n) => n.id === id).bounds;
    check(
      Math.abs(next.x - b.x - 40 * window.sugarMaple.viewport.camera().zoom) <
        0.01 && Math.abs(next.y - b.y) < 0.01,
      "World delta moves " + id,
    );
  }
  await undo();
  checks++;
  await select(["multi-b", "multi-child"]);
  const beforeNested = await settle(),
    oldBounds = beforeNested.nodes.find((n) => n.id === "multi-child").bounds;
  await change("X", Number(field("X").value) + 25);
  const newBounds = (await settle()).nodes.find(
    (n) => n.id === "multi-child",
  ).bounds;
  check(
    Math.abs(
      newBounds.x - oldBounds.x - 25 * window.sugarMaple.viewport.camera().zoom,
    ) < 0.01 && Math.abs(newBounds.y - oldBounds.y) < 0.01,
    "Rotated-parent batch translates in world coordinates",
  );
  await undo();
  checks++;
  await select(["multi-parent", "multi-child"]);
  check(
    document
      .querySelector("selection-inspector")
      .textContent.includes("1 editing roots"),
    "Selected descendant excluded",
  );
  const beforeAncestor = (await dispatch("document.get")).document;
  await change("Opacity", 0.5);
  current = (await dispatch("document.get")).document;
  check(
    current.nodes.find((n) => n.id === "multi-parent").opacity === 0.5 &&
      current.nodes.find((n) => n.id === "multi-child").opacity === 1,
    "Ancestor edit does not double-edit child",
  );
  await undo();
  check(
    JSON.stringify((await dispatch("document.get")).document) ===
      JSON.stringify(beforeAncestor),
    "Ancestor batch undoes once",
  );
  checks++;
  await select(["multi-text-a", "multi-text-b"]);
  check(
    field("Font weight").placeholder === "Mixed",
    "Mixed typography exposed",
  );
  await change("Font weight", 600);
  current = (await dispatch("document.get")).document;
  check(
    ["multi-text-a", "multi-text-b"].every(
      (id) => current.nodes.find((n) => n.id === id).fontWeight === 600,
    ),
    "Typography edits both compatible nodes",
  );
  await undo();
  checks++;
  await select(["multi-a", "multi-text-a"]);
  check(
    !field("Fill") && !field("Font weight") && field("Opacity"),
    "Mixed-kind applicability truthful",
  );
  checks++;
  await select(["multi-a", "multi-managed-child"]);
  check(
    field("X").disabled && field("Y").disabled,
    "Managed positioning disables whole batch",
  );
  const managed = await checkpoint();
  await change("X", 400);
  check(
    (await checkpoint()) === managed,
    "Managed handler guard preserves exact checkpoint",
  );
  checks++;
  await tx([
    { type: "node.update", id: "multi-parent", patch: { locked: true } },
  ]);
  await select(["multi-a", "multi-child"]);
  const locked = await checkpoint();
  check(
    field("Opacity").matches(":disabled"),
    "Inherited lock disables atomic batch",
  );
  await change("Opacity", 0.2);
  check((await checkpoint()) === locked, "Forced disabled event cannot mutate");
  checks++;
  await tx([
    { type: "node.update", id: "multi-parent", patch: { locked: false } },
  ]);
  await select(["multi-a", "multi-b"]);
  const invalid = await checkpoint();
  await change("Fill", "invalid");
  check(
    (await checkpoint()) === invalid,
    "Invalid shared color rejected atomically",
  );
  checks++;
  // Components use the same Design guard in both other modes.
  clickText('[aria-label="Sidebar sections"] button', "Assets");
  await settle();
  for (const name of ["Prototype", "Developer"]) {
    await mode(name);
    const insert = document.querySelector(
      '[aria-label="Insert component Alpha"]',
    );
    check(insert?.disabled, name + ": component insert disabled");
    const before = await checkpoint();
    insert.click();
    await settle();
    check(
      (await checkpoint()) === before,
      name + ": component attempt unchanged",
    );
    checks++;
  }
  await mode("Design");
  clickText('[aria-label="Sidebar sections"] button', "Layers");
  await select(["multi-a", "multi-b"]);
  return {
    passed: true,
    checks,
    scope:
      "Production multi-selection shared/Mixed/applicability, world transforms, root filtering, atomic undo, lock/managed/invalid guards and read-only mode insertion. DOM events do not prove physical native input.",
  };
};
