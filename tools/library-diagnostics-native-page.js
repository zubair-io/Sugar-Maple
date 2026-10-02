// Production WKWebView UI checks using synthetic DOM events and the editor's
// real dispatcher. No OS clipboard, filesystem, MCP server or source execution.
window.canvasTransformAcceptance = async function () {
  let checks = 0;
  const check = (value, message) => {
    if (!value) throw Error(message);
  };
  const get = () => window.sugarMaple.dispatch("document.get");
  const checkpoint = () => window.sugarMaple.dispatch("document.checkpoint");
  const settle = () => window.sugarMaple.dispatch("layout.inspect");
  const select = async (id) => {
    await window.sugarMaple.dispatch("selection.set", { id });
    await settle();
  };
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
  const text = () =>
    document.querySelector('[aria-label="Library appearance diagnostics"]')
      ?.textContent ?? "";
  const yellowPixels = () => {
    const canvas = document.querySelector("canvas.drawing-canvas"),
      pixels = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (
        pixels[i] > 220 &&
        pixels[i + 1] > 220 &&
        pixels[i + 2] < 50 &&
        pixels[i + 3] > 220
      )
        count++;
    return count;
  };
  const waitPaint = async (present) => {
    const deadline = Date.now() + 2000;
    while (yellowPixels() > 0 !== present) {
      check(
        Date.now() < deadline,
        "Actual Canvas yellow paint did not " + (present ? "appear" : "reset"),
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return yellowPixels();
  };
  const choose = async (label, value) => {
    const control = document.querySelector(`[aria-label="${label}"]`);
    check(control && !control.disabled, label + " enabled");
    control.value = value;
    control.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
  };
  const click = async (label) => {
    const control = [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === label,
    );
    check(control, label + " visible action");
    control.click();
    await settle();
  };
  await select("button");
  const initial = await checkpoint();
  check(
    text().includes("Canvas and Preview use authored semantic appearance."),
    "Semantic appearance identified",
  );
  check(
    text().includes(
      "Package appearance is shown only in the isolated library preview experiment.",
    ),
    "Package runtime boundary identified",
  );
  check(
    text().includes("supported properties for Default"),
    "Default property support",
  );
  check(
    JSON.stringify(await checkpoint()) === JSON.stringify(initial),
    "Reading diagnostics has no history",
  );
  checks++;
  await choose("Library variant", "Primary");
  check(
    text().includes("Source: Web Awesome Button · Primary"),
    "Source variant identity",
  );
  check(text().includes("variant = brand"), "Real source appearance property");
  check(
    text().includes("native Button variant Primary is unsupported"),
    "Actionable native variant diagnostic",
  );
  check(
    text().includes(
      "Mapped SwiftUI copy (macOS): Unsupported native platform/variant",
    ),
    "Actual native copy limit",
  );
  const primary = await checkpoint(),
    before = initial.document.nodes.find((n) => n.id === "button"),
    after = primary.document.nodes.find((n) => n.id === "button");
  for (const name of ["fill", "color", "stroke", "radius"])
    check(before[name] === after[name], name + " semantic paint unchanged");
  check(
    primary.journal.length === initial.journal.length + 1,
    "Variant remains one command",
  );
  checks++;
  await undo();
  check(
    JSON.stringify((await get()).document) === JSON.stringify(initial.document),
    "Exact source undo",
  );
  check(
    text().includes("Source: Web Awesome Button · Default"),
    "Diagnostics update on undo",
  );
  checks++;
  await choose("Library prop appearance", "outlined");
  check(
    text().includes("native Button property appearance is unsupported"),
    "Native-only source property identified",
  );
  check(
    text().includes(
      "Mapped SwiftUI copy (macOS): Unsupported native property: appearance",
    ),
    "Exporter actual property support",
  );
  check(
    text().includes("Mapped web copy: Available for this selection."),
    "Web property supported independently",
  );
  checks++;
  await undo();
  await tx([
    { type: "node.update", id: "button", patch: { color: "#ffff00" } },
  ]);
  check(
    text().includes(
      "Mapped web copy: Unsupported mapped library style override: color",
    ),
    "Web override diagnostic",
  );
  check(
    text().includes(
      "Mapped SwiftUI copy (macOS): Available for this selection.",
    ),
    "Swift support differs from mapped web",
  );
  checks++;
  const beforeReset = await checkpoint(),
    beforeYellow = await waitPaint(true);
  await click("Reset library overrides");
  const resetDocument = await get(),
    resetNode = resetDocument.document.nodes.find((n) => n.id === "button");
  check(
    resetNode.color === "#18181b" &&
      resetNode.libraryRef.localOverrides.length === 0,
    "Reset restores actual source paint and metadata",
  );
  const afterYellow = await waitPaint(false);
  check(
    (await checkpoint()).journal.length === beforeReset.journal.length + 1,
    "Reset is one command",
  );
  await undo();
  check(
    JSON.stringify((await get()).document) ===
      JSON.stringify(beforeReset.document),
    "Reset exact undo restores style",
  );
  await waitPaint(true);
  await click("Reset library overrides");
  await waitPaint(false);
  check(
    text().includes("Mapped web copy: Available for this selection."),
    "Copy guidance refreshes after reset",
  );
  checks++;
  await select("input");
  await tx([
    { type: "node.update", id: "input", patch: { fill: "#763cba", radius: 7 } },
  ]);
  check(
    text().includes("native Input style fill is unsupported"),
    "Native input paint identified",
  );
  check(
    text().includes("native Input style radius is unsupported"),
    "Native input radius identified",
  );
  checks++;
  await undo();
  check(
    text().includes("supported properties for Default"),
    "Native property guidance refreshes after undo",
  );
  checks++;
  const modeBefore = await checkpoint();
  await click("Developer");
  check(
    document.querySelector('[aria-label="Library variant"]').disabled,
    "Developer source controls read-only",
  );
  check(
    text().includes("Source: Web Awesome Input · Default"),
    "Developer diagnostic context",
  );
  check(
    JSON.stringify(await checkpoint()) === JSON.stringify(modeBefore),
    "Mode/diagnostics are not authored mutations",
  );
  checks++;
  await click("Design");
  await select("button");
  await choose("Library variant", "Primary");
  document
    .querySelector('[aria-label="Library appearance diagnostics"]')
    .scrollIntoView({ block: "center" });
  check(
    window.canvasTransformErrors?.length === 0,
    "No WK startup/interaction errors",
  );
  checks++;
  return {
    passed: true,
    checks,
    diagnostics: text(),
    revision: (await get()).revision,
    resetPaint: {
      beforeYellowPixels: beforeYellow,
      afterYellowPixels: afterYellow,
    },
    scope:
      "Production WKWebView library inspector and canonical dispatcher; synthetic DOM changes/clicks, no physical OS input or whole-product accessibility claim",
  };
};
