// Production editor UI/dispatcher checks; no OS clipboard or hardware input claim.
window.canvasTransformAcceptance = async () => {
  const check = (value, message) => {
    if (!value) throw Error(message);
  };
  const call = (method, args) => window.sugarMaple.dispatch(method, args);
  const wait = async (predicate) => {
    const deadline = performance.now() + 5000;
    while (!predicate()) {
      check(performance.now() < deadline, "Copy inspector did not settle");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };
  const d = await call("document.get"),
    pageId = d.document.pages[0].id;
  await call("transaction.apply", {
    documentId: d.documentId,
    expectedRevision: d.revision,
    requestId: crypto.randomUUID(),
    operations: [
      { type: "token.set", name: "brand.primary", value: "#2468ac" },
      {
        type: "node.add",
        node: {
          id: "copy-card",
          pageId,
          kind: "frame",
          name: "Copy Card",
          layout: "vertical",
          widthMode: "percent",
          widthPercent: 80,
          height: 220,
          padding: 12,
          strokeWidth: 2.5,
        },
      },
      {
        type: "node.add",
        node: {
          id: "copy-action",
          pageId,
          parentId: "copy-card",
          kind: "button",
          name: "Continue action",
          text: "Continue & <next>",
          fontFamily: "Maple Sans",
          widthMode: "fill",
          height: 44,
          fillToken: "brand.primary",
          prototypeAction: "back",
        },
      },
    ],
  });
  await call("selection.set", { id: "copy-action" });
  await call("layout.inspect");
  const before = JSON.stringify(await call("document.checkpoint"));
  const exported = {};
  for (const target of [
    "html",
    "tailwind",
    "tailwind-classes",
    "css",
    "css-declarations",
    "html-css",
  ])
    exported[target] = await call("code.export", {
      id:
        target === "css" || target === "html-css" ? "copy-card" : "copy-action",
      target,
    });
  check(
    exported["tailwind-classes"].code.includes(
      "[background:var(--brand-primary)]",
    ) && !exported["tailwind-classes"].code.includes("<button"),
    "Pure classes retain bound token",
  );
  check(
    exported["css-declarations"].code.includes("--brand-primary:#2468ac") &&
      !exported["css-declarations"].code.includes(".node-"),
    "Pure declarations retain bound token",
  );
  check(
    exported.css.code.includes(".node-copy-action{") &&
      exported["html-css"].code.includes('class="node-copy-action"'),
    "Complete subtree rules and markup",
  );
  check(
    exported["tailwind-classes"].setup.includes("@font-face") &&
      exported["css-declarations"].setup.includes("data:font/woff2;base64,"),
    "Font prerequisites accompany pure fragments",
  );
  check(
    exported["html-css"].notes.some((note) => note.includes("Unwired action")),
    "Application actions are identified",
  );
  const developer = [...document.querySelectorAll("button")].find(
    (button) => button.textContent.trim() === "Developer",
  );
  check(developer, "Developer mode control");
  developer.click();
  await wait(() =>
    document.querySelector('select[aria-label="Export target"]'),
  );
  const selector = document.querySelector('select[aria-label="Export target"]');
  selector.value = "tailwind-classes";
  selector.dispatchEvent(new Event("change", { bubbles: true }));
  await wait(
    () =>
      document.querySelector("pre")?.textContent ===
      exported["tailwind-classes"].code,
  );
  check(
    document.querySelector("summary")?.textContent === "Required font CSS",
    "Associated font setup is visible",
  );
  check(
    document.querySelector('pre[aria-label="Required font CSS"]')
      ?.textContent === exported["tailwind-classes"].setup,
    "Displayed setup equals MCP setup",
  );
  const codeBox = document.querySelector("pre[data-copy-payload]");
  codeBox.focus();
  codeBox.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "a",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  check(
    window.getSelection()?.toString() === exported["tailwind-classes"].code,
    "Keyboard selects only the code payload",
  );
  const copyKey = new KeyboardEvent("keydown", {
    key: "c",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  codeBox.dispatchEvent(copyKey);
  check(
    !copyKey.defaultPrevented,
    "Native selected-text copy is not hijacked by editable-element copy",
  );
  codeBox.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  check(
    JSON.stringify(await call("document.checkpoint")) === before,
    "Read-only handoff preserves exact source and history",
  );
  return {
    passed: true,
    checks: 7,
    exported,
    sourceUnchanged: true,
    limitation:
      "Native UI checks use DOM events; OS clipboard/input and full VoiceOver are separate.",
  };
};
