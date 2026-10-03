// Production DOM interactions shared by Chrome and WK. Physical input/VoiceOver are separate.
window.canvasTransformAcceptance = async function () {
  const check = (ok, message) => {
      if (!ok) throw Error(message);
    },
    checks = [];
  const get = () => window.sugarMaple.dispatch("document.get");
  const checkpoint = async () =>
    JSON.stringify(await window.sugarMaple.dispatch("document.checkpoint"));
  const settle = () => window.sugarMaple.dispatch("layout.inspect");
  const tx = async (operations) => {
    const d = await get();
    await window.sugarMaple.dispatch("transaction.apply", {
      documentId: d.documentId,
      expectedRevision: d.revision,
      requestId: crypto.randomUUID(),
      operations,
    });
    await settle();
  };
  const undo = async () => {
    const d = await get();
    await window.sugarMaple.dispatch("history.undo", {
      documentId: d.documentId,
      expectedRevision: d.revision,
    });
    await settle();
  };
  const click = async (selector, text) => {
    const b = [...document.querySelectorAll(selector)].find(
      (b) => b.textContent.trim() === text,
    );
    check(b, "Missing " + text);
    b.click();
    await settle();
  };
  const key = async (el, value) => {
    el.focus();
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: value,
        bubbles: true,
        cancelable: true,
      }),
    );
    await settle();
  };
  const change = async (selector, value) => {
    const el = document.querySelector(selector);
    check(el, "Missing " + selector);
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
  };
  const selected = async (id) => {
    await window.sugarMaple.dispatch("selection.set", { id });
    await settle();
  };
  const mode = (name) => click('[aria-label="Editor mode"] button', name);
  const initial = await get(),
    pageId = initial.document.pages[0].id;
  const title = () => document.querySelector("page-title button");
  const beforeRename = await checkpoint();
  await key(title(), "F2");
  let name = document.querySelector('[aria-label="Page name"]');
  check(name, "F2 exposes page rename");
  name.value = "Cancelled name";
  name.dispatchEvent(new Event("input", { bubbles: true }));
  await key(name, "Escape");
  check(
    (await checkpoint()) === beforeRename,
    "Escape preserves exact checkpoint",
  );
  await key(title(), "F2");
  name = document.querySelector('[aria-label="Page name"]');
  name.value = "Keyboard page";
  name.dispatchEvent(new Event("input", { bubbles: true }));
  await key(name, "Enter");
  check(
    (await get()).document.pages[0].name === "Keyboard page",
    "Enter commits page name",
  );
  check(document.activeElement === title(), "Rename returns keyboard focus");
  await undo();
  check(
    (await get()).document.pages[0].name === initial.document.pages[0].name,
    "One page rename undo",
  );
  checks.push("page rename");
  await tx([
    {
      type: "node.add",
      node: {
        id: "qa-root",
        pageId,
        kind: "artboard",
        name: "Screen A",
        width: 700,
        height: 600,
      },
    },
    {
      type: "node.add",
      node: {
        id: "qa-destination",
        pageId,
        kind: "artboard",
        name: "Screen B",
        x: 800,
        width: 400,
        height: 400,
      },
    },
    {
      type: "node.add",
      node: {
        id: "qa-frame",
        pageId,
        parentId: "qa-root",
        kind: "frame",
        name: "Group",
        width: 300,
        height: 300,
      },
    },
    {
      type: "node.add",
      node: {
        id: "qa-leaf",
        pageId,
        parentId: "qa-frame",
        kind: "text",
        name: "Leaf",
        text: "Example",
      },
    },
    ...["rectangle", "ellipse", "button", "input", "image", "path"].map(
      (kind, i) => ({
        type: "node.add",
        node: {
          id: "qa-" + kind,
          pageId,
          parentId: "qa-root",
          kind,
          name: "Kind " + kind,
          x: 20 + i * 50,
          y: 100,
          width: 80,
          height: 40,
          ...(kind === "path" ? { pathData: "M 0 0 L 40 30" } : {}),
        },
      }),
    ),
  ]);
  await click('[aria-label="Sidebar sections"] button', "Layers");
  const root = () =>
    document.querySelector('[data-layer-id="qa-root"] [role="treeitem"]');
  const baselineTree = await checkpoint();
  root().querySelector('[aria-label="Collapse"]').click();
  await settle();
  check(
    root().getAttribute("aria-expanded") === "false" &&
      !document.querySelector('[data-layer-id="qa-leaf"]'),
    "Collapse removes nested rows",
  );
  await key(root(), "ArrowRight");
  check(root().getAttribute("aria-expanded") === "true", "Right expands");
  await key(root(), "ArrowLeft");
  check(root().getAttribute("aria-expanded") === "false", "Left collapses");
  const search = document.querySelector('[aria-label="Find layer"]');
  search.value = "Leaf";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
  check(
    document.querySelector('[data-layer-id="qa-leaf"]'),
    "Search reveals collapsed matching ancestry",
  );
  search.value = "";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
  check(
    root().getAttribute("aria-expanded") === "false",
    "Search preserves collapse preference",
  );
  await selected("qa-leaf");
  check(
    root().getAttribute("aria-expanded") === "true",
    "External selection reveals ancestors",
  );
  check(
    (await checkpoint()) === baselineTree,
    "Tree navigation/expansion preserve exact checkpoint",
  );
  const icons = [
    "rectangle",
    "ellipse",
    "button",
    "input",
    "image",
    "path",
  ].map(
    (kind) =>
      document.querySelector(`[data-layer-id="qa-${kind}"] .row-icon svg`)
        ?.innerHTML,
  );
  check(
    icons.every(Boolean) && new Set(icons).size === 6,
    "Layer kinds have distinct real glyphs",
  );
  checks.push("layer expansion and icons");
  await selected("qa-button");
  await mode("Prototype");
  await change('[aria-label="Navigate to"]', "qa-destination");
  await change('[aria-label="Prototype action"]', "back");
  check(
    !document.querySelector('[aria-label="Navigate to"]'),
    "Back hides destination",
  );
  check(
    (await get()).document.nodes.find((n) => n.id === "qa-button").targetId ===
      "qa-destination",
    "Back preserves stored destination",
  );
  await change('[aria-label="Prototype action"]', "openOverlay");
  check(
    document.querySelector('[aria-label="Navigate to"]').value ===
      "qa-destination",
    "Overlay restores destination",
  );
  checks.push("contextual prototype destination");
  await tx([{ type: "node.remove", id: "qa-destination" }]);
  check(
    document
      .querySelector('prototype-inspector [role="status"]')
      ?.textContent.includes("Choose a visible artboard"),
    "Deleted target explained",
  );
  await undo();
  check(
    document.querySelector('[aria-label="Navigate to"]').value ===
      "qa-destination",
    "Target deletion undo restores route",
  );
  await tx([{ type: "node.remove", id: "qa-destination" }]);
  await change('[aria-label="Prototype action"]', "back");
  const pending = await checkpoint();
  await change('[aria-label="Prototype action"]', "navigate");
  check(
    (await checkpoint()) === pending,
    "Missing-destination action remains an unauthored choice",
  );
  await change('[aria-label="Navigate to"]', "qa-root");
  const configured = (await get()).document.nodes.find(
    (n) => n.id === "qa-button",
  );
  check(
    configured.prototypeAction === "navigate" &&
      configured.targetId === "qa-root",
    "Action and valid target commit together",
  );
  await undo();
  check(
    (await get()).document.nodes.find((n) => n.id === "qa-button")
      .prototypeAction === "back",
    "One undo restores whole interaction",
  );
  checks.push("valid destination and deletion undo");
  await click("prototype-inspector button", "Remove interaction");
  check(
    (await get()).document.nodes.find((n) => n.id === "qa-button").targetId ===
      null && !document.querySelector("prototype-inspector button"),
    "Explicit removal unwires interaction",
  );
  await undo();
  checks.push("explicit interaction removal");
  await mode("Developer");
  await change('[aria-label="Export target"]', "css-declarations");
  const copy = document.querySelector("[data-copy-current-target]"),
    payload = document.querySelector("pre[data-copy-payload]");
  check(
    copy.textContent.trim() === "Copy CSS declarations only",
    "Copy action names exact output",
  );
  check(
    payload.getAttribute("aria-label") === "CSS declarations only payload" &&
      payload.tabIndex === 0,
    "Named selectable fallback",
  );
  check(
    payload.textContent ===
      (
        await window.sugarMaple.dispatch("code.export", {
          id: "qa-button",
          target: "css-declarations",
        })
      ).code,
    "Visible payload matches actual export",
  );
  checks.push("developer output labeling");
  await mode("Prototype");
  check(
    document.querySelector('[aria-label="Lock Kind button"]').disabled,
    "Layer authoring controls disabled outside Design",
  );
  checks.push("layer mode guard");
  await tx([
    { type: "node.update", id: "qa-frame", patch: { locked: true } },
    {
      type: "comment.add",
      pageId,
      text: "Review the spacing and contrast. " + "long_token_".repeat(24),
      anchor: { x: 20, y: 20 },
    },
  ]);
  const beforeMatrix = await checkpoint(),
    workspace = document.querySelector(".workspace"),
    originalColumns = workspace.style.gridTemplateColumns,
    appearance = document.querySelector('[aria-label="Chrome appearance"]'),
    originalTheme = appearance.value,
    geometry = [];
  for (const theme of ["dark", "light"]) {
    appearance.value = theme;
    appearance.dispatchEvent(new Event("change", { bubbles: true }));
    for (const width of [260, 320, 420]) {
      workspace.style.gridTemplateColumns = `280px minmax(0, 1fr) ${width}px`;
      await settle();
      await selected("qa-leaf");
      await mode("Design");
      check(
        document.querySelector('[aria-label="Layer name"]').disabled,
        "Inherited locked selection read-only",
      );
      await mode("Prototype");
      check(
        document.querySelector('[aria-label="Prototype action"]').disabled,
        "Inherited locked prototype read-only",
      );
      await click(".inspector button", "Comments");
      const article = document.querySelector("page-comments article"),
        reply = article.querySelector("textarea");
      reply.focus();
      await settle();
      const panel = document
          .querySelector(".inspector")
          .getBoundingClientRect(),
        box = article.getBoundingClientRect();
      check(
        box.x >= panel.x &&
          box.right <= panel.right + 1 &&
          article.scrollWidth <= article.clientWidth + 1,
        "Comment content contained",
      );
      check(
        parseFloat(getComputedStyle(reply).outlineWidth) >= 2,
        "Reply focus visible",
      );
      geometry.push({ theme, width, commentWidth: box.width });
      await click(".inspector button", "Details");
    }
  }
  check(
    (await checkpoint()) === beforeMatrix,
    "Locked/comment/theme matrix preserves exact checkpoint",
  );
  checks.push("locked and comment appearance matrix");
  workspace.style.gridTemplateColumns = originalColumns;
  appearance.value = originalTheme;
  appearance.dispatchEvent(new Event("change", { bubbles: true }));
  await mode("Developer");
  await selected("qa-button");
  await settle();
  return {
    passed: true,
    checks: checks.length,
    cases: checks,
    geometry,
    scope:
      "Production DOM keyboard/page/tree/prototype/copy/locked/comments acceptance. No physical native input or VoiceOver claim.",
  };
};
