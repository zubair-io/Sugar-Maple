window.canvasTransformAcceptance = async function () {
  const check = (v, m) => {
    if (!v) throw Error(m);
  };
  const settle = () => window.sugarMaple.dispatch("layout.inspect");
  const baseline = JSON.stringify(
    await window.sugarMaple.dispatch("document.checkpoint"),
  );
  const visible = (el) =>
    el.getBoundingClientRect().width > 0 &&
    el.getBoundingClientRect().height > 0;
  const grip = (side) =>
    document.querySelector('[aria-label="Resize ' + side + ' panel"]');
  const toggle = (side) =>
    document.querySelector('[aria-label="Toggle ' + side + ' panel"]');
  const open = async (side) => {
    if (!visible(grip(side))) toggle(side).click();
    await settle();
  };
  const key = async (side, name) => {
    grip(side).focus();
    grip(side).dispatchEvent(
      new KeyboardEvent("keydown", { key: name, bubbles: true }),
    );
    await settle();
  };
  await open("left");
  await key("left", "End");
  check(grip("left").getAttribute("aria-valuenow") === "400", "Left max");
  await key("left", "Home");
  await key("left", "ArrowRight");
  check(
    grip("left").getAttribute("aria-valuenow") === "230",
    "Left keyboard step",
  );
  await open("right");
  await key("right", "End");
  check(grip("right").getAttribute("aria-valuenow") === "420", "Right max");
  await key("right", "Home");
  check(grip("right").getAttribute("aria-valuenow") === "260", "Right min");
  const preference = JSON.parse(
    localStorage.getItem("sugar-maple.workspace.v1"),
  );
  check(
    preference.version === 1 &&
      preference.left === 230 &&
      preference.right === 260,
    "Versioned local preference stored",
  );
  const results = [];
  for (const theme of ["dark", "light"]) {
    const appearance = document.querySelector(
      '[aria-label="Chrome appearance"]',
    );
    appearance.value = theme;
    appearance.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    check(
      document.querySelector(".topbar").getBoundingClientRect().height === 48,
      "Header48",
    );
    check(
      document.querySelector("footer").getBoundingClientRect().height === 28,
      "Footer28",
    );
    const canvas = document.querySelector(".viewport").getBoundingClientRect(),
      toolbar = document.querySelector(".canvas-toolbar");
    check(canvas.width >= 320, "Usable canvas at " + window.innerWidth);
    check(toolbar.scrollWidth <= toolbar.clientWidth + 1, "Toolbar contained");
    const status = document.querySelector(
      '[aria-label="MCP connection details"]',
    );
    check(visible(status), "MCP visible");
    status.focus();
    status.click();
    await settle();
    check(
      document
        .querySelector(".connection-details")
        ?.textContent.includes("MCP connection"),
      "Actual connection details",
    );
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settle();
    check(document.activeElement === status, "MCP Escape restores focus");
    const popup = document.querySelector(".connection-details");
    check(!popup, "Popover dismissed");
    check(
      JSON.stringify(
        await window.sugarMaple.dispatch("document.checkpoint"),
      ) === baseline,
      "Workspace/theme/focus preserve exact checkpoint",
    );
    results.push({
      theme,
      width: window.innerWidth,
      height: window.innerHeight,
      canvas: canvas.width,
      leftVisible: visible(grip("left")),
      rightVisible: visible(grip("right")),
    });
  }
  // These explicit authoring commands prove status separately from chrome invariance above.
  const beforeAgent = await window.sugarMaple.dispatch("document.get");
  await window.sugarMaple.dispatch("transaction.apply", {
    documentId: beforeAgent.documentId,
    expectedRevision: beforeAgent.revision,
    requestId: crypto.randomUUID(),
    operations: [{ type: "document.rename", name: "Workspace status fixture" }],
  });
  const committed = await window.sugarMaple.dispatch("document.get");
  let rejected = false;
  try {
    await window.sugarMaple.dispatch("transaction.apply", {
      documentId: committed.documentId,
      expectedRevision: beforeAgent.revision,
      requestId: crypto.randomUUID(),
      operations: [{ type: "document.rename", name: "Must reject" }],
    });
  } catch {
    rejected = true;
  }
  check(rejected, "Stale transaction rejected");
  document.querySelector('[aria-label="MCP connection details"]').click();
  await settle();
  const beforeWrongDocument = JSON.stringify(
    await window.sugarMaple.dispatch("document.checkpoint"),
  );
  let wrongDocumentRejected = false;
  try {
    await window.sugarMaple.dispatch("transaction.apply", {
      documentId: "background-document-fixture",
      expectedRevision: 73,
      requestId: crypto.randomUUID(),
      operations: [{ type: "document.rename", name: "Must not appear here" }],
    });
  } catch {
    wrongDocumentRejected = true;
  }
  check(wrongDocumentRejected, "Wrong document transaction rejected");
  await settle();
  check(
    JSON.stringify(await window.sugarMaple.dispatch("document.checkpoint")) ===
      beforeWrongDocument,
    "Wrong document rejection preserves exact checkpoint",
  );
  const content = document.querySelector(".connection-details").textContent;
  check(
    content.includes("Committed · revision " + committed.revision),
    "Actual committed revision displayed",
  );
  check(
    content.includes("Rejected · expected revision " + beforeAgent.revision),
    "Actual rejected revision displayed",
  );
  check(
    !content.includes("expected revision 73"),
    "Background rejection not attributed to active document",
  );
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await window.sugarMaple.dispatch("history.undo", {
    documentId: committed.documentId,
    expectedRevision: committed.revision,
  });
  await settle();
  check(
    JSON.stringify(
      (await window.sugarMaple.dispatch("document.get")).document,
    ) === JSON.stringify(beforeAgent.document),
    "Explicit agent fixture undo restores document",
  );
  return {
    passed: true,
    checks: 4,
    states: results,
    scope:
      "Actual sized production WKWebView, DOM keyboard resizing and stored preference, chrome geometry/themes/MCP focus; pointer/reload are separately tested in Chrome. No physical input or native restart persistence claim.",
  };
};
