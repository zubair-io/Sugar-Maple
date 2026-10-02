// Real production WK controls; synthetic DOM clicks, independent world geometry.
window.canvasTransformAcceptance = async function () {
  const check = (yes, message) => {
      if (!yes) throw Error(message);
    },
    near = (a, b) => check(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
  const get = () => window.sugarMaple.dispatch("document.get"),
    settle = () => window.sugarMaple.dispatch("layout.inspect");
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
  const button = (label, root = document) =>
    [...root.querySelectorAll("button")].find(
      (b) =>
        b.getAttribute("aria-label") === label ||
        b.textContent.trim() === label,
    );
  const d = await get(),
    pageId = d.document.pages[0].id;
  await tx(
    [
      ["a", 70, 70, 60, 35, 20],
      ["b", 210, 160, 80, 60, -10],
      ["c", 340, 280, 90, 60, 40],
    ].map(([id, x, y, width, height, rotation]) => ({
      type: "node.add",
      node: {
        id,
        name: id,
        pageId,
        parentId: "parent",
        kind: "rectangle",
        x,
        y,
        width,
        height,
        rotation,
      },
    })),
  );
  button("Layers").click();
  await settle();
  await window.sugarMaple.dispatch("selection.set", { id: "a" });
  await settle();
  for (const id of ["b", "c"]) {
    const el = document.querySelector(
      `[data-layer-id="${id}"] [role="treeitem"]`,
    );
    check(!!el, "WK layer target " + id);
    el.dispatchEvent(
      new MouseEvent("click", { bubbles: true, shiftKey: true }),
    );
    await settle();
  }
  check(
    JSON.stringify(
      (await window.sugarMaple.dispatch("editor.discover")).selectionIds,
    ) === JSON.stringify(["a", "b", "c"]),
    "WK multi-selection",
  );
  const absolute = (n, nodes) => {
    const parent = nodes.find((p) => p.id === n.parentId),
      p = parent ? absolute(parent, nodes) : { x: 0, y: 0 };
    return {
      x: p.x + (parent?.strokeWidth ?? 0) + n.x,
      y: p.y + (parent?.strokeWidth ?? 0) + n.y,
      width: n.width,
      height: n.height,
    };
  };
  const bounds = (n, nodes) => {
    const b = absolute(n, nodes),
      points = [
        [b.x, b.y],
        [b.x + b.width, b.y],
        [b.x, b.y + b.height],
        [b.x + b.width, b.y + b.height],
      ].map(([initialX, initialY]) => {
        let x = initialX,
          y = initialY;
        for (
          let node = n;
          node;
          node = nodes.find((p) => p.id === node.parentId)
        ) {
          const box = absolute(node, nodes),
            cx = box.x + box.width / 2,
            cy = box.y + box.height / 2,
            r = (node.rotation * Math.PI) / 180,
            dx = x - cx,
            dy = y - cy;
          x = cx + Math.cos(r) * dx - Math.sin(r) * dy;
          y = cy + Math.sin(r) * dx + Math.cos(r) * dy;
        }
        return { x, y };
      });
    const x = Math.min(...points.map((p) => p.x)),
      y = Math.min(...points.map((p) => p.y));
    return {
      x,
      y,
      width: Math.max(...points.map((p) => p.x)) - x,
      height: Math.max(...points.map((p) => p.y)) - y,
    };
  };
  let checks = 0;
  for (const zoom of [0.5, 1.5]) {
    const slider = document.querySelector('[aria-label="Zoom"]');
    slider.value = String(zoom);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    for (const [label, axis, size, factor] of [
      ["Align left", "x", "width", 0],
      ["Align horizontal center", "x", "width", 0.5],
      ["Align right", "x", "width", 1],
      ["Align top", "y", "height", 0],
      ["Align vertical middle", "y", "height", 0.5],
      ["Align bottom", "y", "height", 1],
    ]) {
      const before = await get(),
        root = document.querySelector('[aria-label="Align selected layers"]'),
        control = button(label, root);
      check(!!control && !control.disabled, "WK alignment enabled");
      control.click();
      await settle();
      const after = await get();
      check(
        after.revision === before.revision + 1,
        "WK one alignment history step",
      );
      const values = after.document.nodes
        .filter((n) => ["a", "b", "c"].includes(n.id))
        .map((n) => {
          const b = bounds(n, after.document.nodes);
          return b[axis] + b[size] * factor;
        });
      for (const v of values) near(v, values[0]);
      await undo();
      check(
        JSON.stringify((await get()).document) ===
          JSON.stringify(before.document),
        "WK alignment exact undo",
      );
      checks++;
    }
    for (const axis of ["x", "y"]) {
      const before = await get(),
        control = button(
          axis === "x"
            ? "Distribute horizontal spacing"
            : "Distribute vertical spacing",
        );
      check(!control.disabled, "WK distribution enabled");
      control.click();
      await settle();
      const after = await get();
      check(after.revision === before.revision + 1, "WK distribution history");
      const boxes = after.document.nodes
          .filter((n) => ["a", "b", "c"].includes(n.id))
          .map((n) => bounds(n, after.document.nodes))
          .sort((a, b) => a[axis] - b[axis]),
        size = axis === "x" ? "width" : "height";
      near(
        boxes[1][axis] - boxes[0][axis] - boxes[0][size],
        boxes[2][axis] - boxes[1][axis] - boxes[1][size],
      );
      control.click();
      await settle();
      check((await get()).revision === after.revision, "WK no-op distribution");
      await undo();
      check(
        JSON.stringify((await get()).document) ===
          JSON.stringify(before.document),
        "WK distribution exact undo",
      );
      checks++;
    }
  }
  const checkpoint = JSON.stringify(
      await window.sugarMaple.dispatch("document.checkpoint"),
    ),
    snap = button("Snapping");
  check(snap.getAttribute("aria-pressed") === "true", "WK snapping enabled");
  snap.click();
  await settle();
  check(snap.getAttribute("aria-pressed") === "false", "WK snapping disabled");
  check(
    JSON.stringify(await window.sugarMaple.dispatch("document.checkpoint")) ===
      checkpoint,
    "WK snapping preference is not authored/history data",
  );
  await tx([{ type: "node.update", id: "parent", patch: { locked: true } }]);
  check(
    button(
      "Align left",
      document.querySelector('[aria-label="Align selected layers"]'),
    ).disabled,
    "WK inherited alignment lock",
  );
  check(
    button("Distribute horizontal spacing").disabled,
    "WK inherited distribution lock",
  );
  check(
    window.canvasTransformErrors.length === 0,
    "WK console errors: " + JSON.stringify(window.canvasTransformErrors),
  );
  return {
    passed: true,
    checks,
    consoleErrors: window.canvasTransformErrors,
    scope:
      "Production WKWebView DOM alignment/distribution/toggle controls and independent rotated geometry at zoom 0.5/1.5; synthetic DOM input, not native OS pointer/VoiceOver acceptance",
  };
};
