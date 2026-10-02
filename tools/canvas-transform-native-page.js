// Production WKWebView keyboard/geometry checks. Events are synthetic DOM
// keyboard events; this is not OS pointer-input or full VoiceOver acceptance.
window.canvasTransformAcceptance = async function () {
  const check = (condition, message) => {
    if (!condition) throw Error(message);
  };
  const near = (a, b, message, tolerance = 1e-6) =>
    check(Math.abs(a - b) <= tolerance, `${message}: ${a} != ${b}`);
  const settle = () => window.sugarMaple.dispatch("layout.inspect");
  const get = () => window.sugarMaple.dispatch("document.get");
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
  const directions = {
    nw: [-1, -1],
    n: [0, -1],
    ne: [1, -1],
    e: [1, 0],
    se: [1, 1],
    s: [0, 1],
    sw: [-1, 1],
    w: [-1, 0],
  };
  const box = (n, nodes) => {
    const parent = nodes.find((p) => p.id === n.parentId);
    const p = parent ? box(parent, nodes) : { x: 0, y: 0 };
    return {
      x: p.x + (parent?.strokeWidth ?? 0) + n.x,
      y: p.y + (parent?.strokeWidth ?? 0) + n.y,
      width: n.width,
      height: n.height,
    };
  };
  // Independent fixed/free-layout world-point calculation, including every
  // ancestor's rotation about its center and border offset.
  const world = (n, nodes, fx, fy) => {
    const b = box(n, nodes);
    let x = b.x + fx * b.width,
      y = b.y + fy * b.height;
    for (
      let current = n;
      current;
      current = nodes.find((p) => p.id === current.parentId)
    ) {
      const b = box(current, nodes),
        cx = b.x + b.width / 2,
        cy = b.y + b.height / 2;
      const r = (current.rotation * Math.PI) / 180,
        dx = x - cx,
        dy = y - cy;
      x = cx + Math.cos(r) * dx - Math.sin(r) * dy;
      y = cy + Math.sin(r) * dx + Math.cos(r) * dy;
    }
    return { x, y };
  };
  await window.sugarMaple.dispatch("selection.set", { id: "child" });
  await settle();
  let checks = 0;
  for (const zoom of [0.5, 1.5]) {
    const slider = document.querySelector('[aria-label="Zoom"]');
    slider.value = String(zoom);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    check(
      document.querySelectorAll("[data-transform-handle]").length === 9,
      "Nine keyboard grips",
    );
    for (const [kind, [nx, ny]] of Object.entries(directions)) {
      const before = await get(),
        n = before.document.nodes.find((n) => n.id === "child");
      const pinned = world(
        n,
        before.document.nodes,
        (1 - nx) / 2,
        (1 - ny) / 2,
      );
      const point = world(n, before.document.nodes, (nx + 1) / 2, (ny + 1) / 2);
      const handle = document.querySelector(
          `[data-transform-handle="${kind}"]`,
        ),
        rect = handle.getBoundingClientRect();
      const viewport = document
          .querySelector(".viewport")
          .getBoundingClientRect(),
        camera = window.sugarMaple.viewport.camera();
      near(
        rect.x + rect.width / 2,
        viewport.x + camera.pan.x + point.x * zoom,
        "WK handle x",
        1 / 64,
      );
      near(
        rect.y + rect.height / 2,
        viewport.y + camera.pan.y + point.y * zoom,
        "WK handle y",
        1 / 64,
      );
      handle.focus();
      handle.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
      await settle();
      const after = await get(),
        resized = after.document.nodes.find((n) => n.id === "child");
      check(after.revision === before.revision + 1, "One keyboard undo step");
      const anchor = world(
        resized,
        after.document.nodes,
        (1 - nx) / 2,
        (1 - ny) / 2,
      );
      near(anchor.x, pinned.x, "WK pinned x");
      near(anchor.y, pinned.y, "WK pinned y");
      await undo();
      check(
        JSON.stringify((await get()).document) ===
          JSON.stringify(before.document),
        "WK exact undo",
      );
      checks++;
    }
    const before = await get(),
      n = before.document.nodes.find((n) => n.id === "child"),
      center = world(n, before.document.nodes, 0.5, 0.5);
    const rotate = document.querySelector('[data-transform-handle="rotate"]');
    rotate.focus();
    rotate.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        shiftKey: true,
        bubbles: true,
      }),
    );
    await settle();
    const after = await get(),
      rotated = after.document.nodes.find((n) => n.id === "child"),
      changedCenter = world(rotated, after.document.nodes, 0.5, 0.5);
    check(rotated.rotation === n.rotation + 10, "WK keyboard rotation");
    check(after.revision === before.revision + 1, "WK rotation history");
    near(changedCenter.x, center.x, "WK center x");
    near(changedCenter.y, center.y, "WK center y");
    await undo();
    checks++;
  }
  await tx([{ type: "node.update", id: "parent", patch: { locked: true } }]);
  check(
    document.querySelectorAll("[data-transform-handle]").length === 0,
    "WK inherited lock",
  );
  await tx([
    {
      type: "node.update",
      id: "parent",
      patch: { locked: false, hidden: true },
    },
  ]);
  check(
    document.querySelectorAll("[data-transform-handle]").length === 0,
    "WK inherited visibility",
  );
  await tx([{ type: "node.update", id: "parent", patch: { hidden: false } }]);
  check(
    document.querySelectorAll("[data-transform-handle]").length === 9,
    "WK handles restored",
  );
  const d = await get(),
    camera = window.sugarMaple.viewport.camera();
  return {
    checks,
    grips: 9,
    zooms: [0.5, 1.5],
    revision: d.revision,
    camera,
    scope:
      "Production WKWebView DOM keyboard and independent fixed/free rotated geometry; synthetic DOM events, no native OS pointer/VoiceOver or filesystem/MCP capability",
    passed: true,
  };
};
