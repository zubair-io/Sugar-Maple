// Real production WKWebView controls; synthetic pointer IDs use a local capture
// shim. This does not claim native OS pointer-capture or VoiceOver acceptance.
window.canvasTransformAcceptance = async function () {
  let checks = 0;
  const check = (ok, message) => {
    if (!ok) throw Error(message);
  };
  const equal = (a, b, message) =>
    check(JSON.stringify(a) === JSON.stringify(b), message);
  const checkpoint = () => window.sugarMaple.dispatch("document.checkpoint");
  const settle = () => window.sugarMaple.dispatch("layout.inspect");
  const get = () => window.sugarMaple.dispatch("document.get");
  const initial = await get(),
    grid = initial.document.nodes.find((n) => n.repeatTemplateId).id;
  const cells = (document) =>
    document.nodes.filter((n) => n.parentId === grid && n.repeatIndex !== null);
  const select = async () => {
    await window.sugarMaple.dispatch("selection.set", { id: grid });
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
  const slider = (kind) =>
    document.querySelector(`[data-repeat-handle=${kind}]`);
  const canvas = document.querySelector(".viewport canvas"),
    methods = [
      "setPointerCapture",
      "releasePointerCapture",
      "hasPointerCapture",
    ].map((name) => [name, canvas[name]]);
  let captured = false;
  canvas.setPointerCapture = () => {
    captured = true;
  };
  canvas.releasePointerCapture = () => {
    captured = false;
  };
  canvas.hasPointerCapture = () => captured;
  const pointer = (target, type, x, y) => {
    const event = new PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      isPrimary: true,
      pointerType: "pen",
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      pressure: 0.5,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return { x: event.clientX, y: event.clientY };
  };
  const down = async (kind, delta, zoom) => {
    const element = slider(kind);
    check(element, "Missing Repeat Grid " + kind);
    const b = element.getBoundingClientRect(),
      x = b.x + b.width / 2,
      y = b.y + b.height / 2;
    const start = pointer(element, "pointerdown", x, y);
    const end = pointer(
      canvas,
      "pointermove",
      x + (kind === "rows" ? 0 : delta * zoom),
      y + (kind === "rows" ? delta * zoom : 0),
    );
    await settle();
    return { start, end };
  };
  const key = (target, key, shiftKey = false) =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        shiftKey,
        bubbles: true,
        cancelable: true,
      }),
    );
  try {
    await select();
    await window.sugarMaple.dispatch("viewport.fit");
    await settle();
    // No render opportunity between this command and a new pointer gesture:
    // cancellation effects from the command must preserve the current gesture.
    const beforeCommand = await get();
    await window.sugarMaple.dispatch("transaction.apply", {
      documentId: beforeCommand.documentId,
      expectedRevision: beforeCommand.revision,
      requestId: crypto.randomUUID(),
      operations: [
        { type: "document.rename", name: "Immediate new repeat gesture" },
      ],
    });
    const beforePaint = window.sugarMaple.viewport.stats(),
      handoffCheckpoint = await checkpoint();
    const handoff = await down(
      "columns",
      216,
      window.sugarMaple.viewport.camera().zoom,
    );
    check(
      window.sugarMaple.viewport.hasDraft() &&
        window.sugarMaple.viewport.stats().total > beforePaint.total,
      "Fresh command handoff lost current Repeat Grid preview: " +
        JSON.stringify({
          before: beforePaint,
          after: window.sugarMaple.viewport.stats(),
          draft: window.sugarMaple.viewport.hasDraft(),
        }),
    );
    equal(
      await checkpoint(),
      handoffCheckpoint,
      "Fresh handoff preview is unauthored",
    );
    key(canvas, "Escape");
    pointer(canvas, "pointerup", handoff.end.x, handoff.end.y);
    await settle();
    equal(
      await checkpoint(),
      handoffCheckpoint,
      "Fresh handoff cancellation preserves exact checkpoint",
    );
    await undo();
    checks++;
    for (const zoom of [0.5, 1.5]) {
      const control = document.querySelector("[aria-label=Zoom]");
      control.value = String(zoom);
      control.dispatchEvent(new Event("input", { bubbles: true }));
      await settle();
      for (const [kind, delta, count] of [
        ["columns", 216, 3],
        ["rows", 236, 4],
        ["gap", 12, 2],
      ]) {
        await select();
        const before = await checkpoint(),
          frames = window.sugarMaple.viewport.stats();
        const delivery = await down(kind, delta, zoom);
        equal(await checkpoint(), before, "WK preview is not authored");
        check(window.sugarMaple.viewport.hasDraft(), "WK preview is guarded");
        check(
          window.sugarMaple.viewport.stats().frames > frames.frames,
          "WK preview is actually painted",
        );
        if (kind !== "gap")
          check(
            window.sugarMaple.viewport.stats().total > frames.total,
            "WK new cells are projected during drag: " +
              JSON.stringify({
                kind,
                zoom,
                before: frames,
                after: window.sugarMaple.viewport.stats(),
                delivery,
                handleValue: slider(kind)?.getAttribute("aria-valuenow"),
                camera: window.sugarMaple.viewport.camera(),
              }),
          );
        let rejected = false;
        try {
          const d = await get();
          await window.sugarMaple.dispatch("render.ready", {
            documentId: d.documentId,
            expectedRevision: d.revision,
          });
        } catch (error) {
          rejected = String(error).includes("Finish or cancel");
        }
        check(rejected, "WK capture rejects a pending grid gesture");
        pointer(canvas, "pointerup", delivery.end.x, delivery.end.y);
        await settle();
        const after = await checkpoint();
        check(
          after.journal.length === before.journal.length + 1,
          "WK one resize command",
        );
        check(cells(after.document).length === count, "WK expected cells");
        equal(
          cells(after.document)
            .slice(0, 2)
            .map((n) => n.id),
          cells(before.document).map((n) => n.id),
          "WK stable surviving IDs",
        );
        check(
          after.document.nodes.find((n) => n.id === "title").text === "First",
          "WK local text survives",
        );
        check(
          after.document.nodes.find((n) => n.id === "photo").asset ===
            before.document.nodes.find((n) => n.id === "photo").asset,
          "WK local image survives",
        );
        if (kind === "gap")
          check(
            Math.abs(
              after.document.nodes.find((n) => n.id === grid).gap -
                (16 + (2 * (delivery.end.x - delivery.start.x)) / zoom),
            ) < 0.1,
            "WK delivered gutter geometry",
          );
        await undo();
        equal(
          (await checkpoint()).document,
          before.document,
          "WK exact repeat undo",
        );
        checks++;
      }
      await select();
      const before = await checkpoint(),
        escape = await down("columns", 216, zoom);
      key(canvas, "Escape");
      pointer(canvas, "pointerup", escape.end.x, escape.end.y);
      await settle();
      equal(await checkpoint(), before, "WK Escape has no history");
      check(slider("columns"), "WK Escape retains grid selection");
      checks++;
      const canceled = await down("columns", 216, zoom);
      pointer(canvas, "pointercancel", canceled.end.x, canceled.end.y);
      pointer(canvas, "pointerup", canceled.end.x, canceled.end.y);
      await settle();
      equal(await checkpoint(), before, "WK pointercancel has no history");
      checks++;
      const stale = await down("columns", 216, zoom);
      await tx([
        { type: "document.rename", name: "Concurrent native repeat " + zoom },
      ]);
      pointer(canvas, "pointerup", stale.end.x, stale.end.y);
      await settle();
      check(
        cells((await get()).document).length === 2,
        "WK stale resize rejected",
      );
      await undo();
      checks++;
      const deleted = await down("columns", 216, zoom);
      await tx([{ type: "node.remove", id: grid }]);
      pointer(canvas, "pointerup", deleted.end.x, deleted.end.y);
      await settle();
      check(
        cells((await get()).document).length === 0,
        "WK concurrent delete retained",
      );
      check(!slider("columns"), "WK deleted grid has no stale controls");
      await undo();
      await select();
      checks++;
    }
    await select();
    const before = await checkpoint();
    const focused = await down("columns", 0, 1.5);
    pointer(canvas, "pointerup", focused.end.x, focused.end.y);
    await settle();
    check(
      document.activeElement === slider("columns"),
      "WK clicked slider retains keyboard focus",
    );
    key(document.activeElement, "ArrowRight");
    await settle();
    check(cells((await get()).document).length === 3, "WK keyboard columns");
    await undo();
    equal((await checkpoint()).document, before.document, "WK keyboard undo");
    checks++;
    key(slider("gap"), "ArrowRight", true);
    await settle();
    check(
      (await get()).document.nodes.find((n) => n.id === grid).gap === 26,
      "WK Shift gutter units",
    );
    await undo();
    checks++;
    await tx([{ type: "node.update", id: "board", patch: { locked: true } }]);
    check(!slider("columns"), "WK inherited lock suppresses handles");
    await undo();
    checks++;
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Developer")
      .click();
    await settle();
    check(!slider("columns"), "WK Developer mode has no modifying handles");
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Design")
      .click();
    await settle();
    checks++;
    await tx([
      { type: "repeat.resize", id: grid, rows: 2, columns: 3, count: 5 },
    ]);
    await select();
    key(slider("gap"), "ArrowRight");
    await settle();
    check(
      cells((await get()).document).length === 5,
      "WK gutter preserves the partial last row",
    );
    await undo();
    await undo();
    checks++;
    return {
      passed: true,
      checks,
      zoom: [0.5, 1.5],
      scope:
        "Actual production WK Canvas repeat controls, projected cells and capture guard, typed resize/undo, local data, cancellation and keyboard/lock/read-only guards; synthetic DOM pointer IDs use a local capture shim",
    };
  } finally {
    for (const [name, method] of methods) canvas[name] = method;
  }
};
