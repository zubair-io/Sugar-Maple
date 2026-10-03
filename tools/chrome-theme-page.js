// Runs against the production bundle in Chrome and an actual WKWebView.
window.canvasTransformAcceptance = async function () {
  const check = (ok, why) => {
    if (!ok) throw Error(why);
  };
  const dispatch = (name, args) => window.sugarMaple.dispatch(name, args);
  const settle = () => dispatch("layout.inspect");
  const start = await dispatch("document.get");
  await dispatch("transaction.apply", {
    documentId: start.documentId,
    expectedRevision: start.revision,
    requestId: crypto.randomUUID(),
    operations: [
      {
        type: "node.add",
        node: {
          id: "theme-card",
          pageId: start.document.pages[0].id,
          kind: "frame",
          name: "Card",
          x: 80,
          y: 80,
          width: 180,
          height: 100,
        },
      },
      {
        type: "node.add",
        node: {
          id: "theme-title",
          pageId: start.document.pages[0].id,
          parentId: "theme-card",
          kind: "text",
          name: "Title",
          text: "First",
          width: 160,
          height: 32,
        },
      },
      { type: "repeat.create", id: "theme-card", count: 2, columns: 2 },
    ],
  });
  const current = await dispatch("document.get");
  const grid = current.document.nodes.find((n) => !!n.repeatTemplateId);
  check(grid, "Real Repeat Grid fixture exists");
  await dispatch("selection.set", { id: grid.id });
  await settle();
  const checkpoint = JSON.stringify(await dispatch("document.checkpoint"));
  const change = (selector, value) => {
    const el = document.querySelector(selector);
    check(el, selector + " exists");
    el.value = value;
    el.dispatchEvent(
      new Event(el.tagName === "TEXTAREA" ? "input" : "change", {
        bubbles: true,
      }),
    );
    return el;
  };
  const button = (name) =>
    [...document.querySelectorAll("repeat-inspector button")].find(
      (b) => b.textContent.trim() === name,
    );
  const lum = (c) => {
    const v = c
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map((x) => {
        const s = Number(x) / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const contrast = (fg, bg, base = "rgb(0, 0, 0)") => {
    const parts = bg.match(/[\d.]+/g).map(Number);
    if (parts.length === 4 && parts[3] < 1) {
      const under = base
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
      bg = `rgb(${parts
        .slice(0, 3)
        .map((v, i) => v * parts[3] + under[i] * (1 - parts[3]))
        .join(", ")})`;
    }
    const a = lum(fg),
      b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const results = [];
  for (const theme of ["dark", "light"]) {
    change('[aria-label="Chrome appearance"]', theme);
    await settle();
    const toolbar = document.querySelector(".drawing-toolbar");
    const toolbarStyle = getComputedStyle(toolbar);
    check(
      toolbarStyle.backgroundColor ===
        getComputedStyle(document.querySelector(".canvas-toolbar"))
          .backgroundColor,
      theme + ": drawing and creation chrome share their theme surface",
    );
    check(
      contrast(toolbarStyle.color, toolbarStyle.backgroundColor) >= 4.5,
      theme + ": drawing text contrast",
    );
    // Pinned Just-Maple sidebar paints. A missing SCSS-only token used to
    // leave the dark panels transparent; the source light color is warm stone.
    const sidebarPaint =
      theme === "dark" ? "rgb(41, 37, 36)" : "rgb(245, 242, 235)";
    for (const selector of [".sidebar", ".inspector"]) {
      check(
        getComputedStyle(document.querySelector(selector)).backgroundColor ===
          sidebarPaint,
        theme + ": source palette paints " + selector,
      );
    }
    const activeControls = [
      ...document.querySelectorAll(
        '.drawing-toolbar button[aria-pressed="true"], .canvas-toolbar button[aria-pressed="true"]',
      ),
    ];
    check(
      activeControls.length >= 2,
      theme + ": selected tool and snapping are visible",
    );
    // Sample settled paints, not a frame halfway through a theme transition.
    await Promise.all(
      activeControls.flatMap((control) =>
        control
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
    for (const control of activeControls) {
      const style = getComputedStyle(control);
      check(
        contrast(
          style.color,
          style.backgroundColor,
          toolbarStyle.backgroundColor,
        ) >= 4.5,
        theme + ": readable active control " + control.textContent.trim(),
      );
    }
    const section = document.querySelector("repeat-inspector section");
    const input = document.querySelector('[aria-label="Grid rows"]');
    const normal = button("Resize grid");
    const inputStyle = getComputedStyle(input),
      normalStyle = getComputedStyle(normal);
    check(
      contrast(inputStyle.color, inputStyle.backgroundColor) >= 4.5,
      theme + ": Repeat Grid input contrast",
    );
    check(
      contrast(normalStyle.color, normalStyle.backgroundColor) >= 4.5,
      theme + ": Repeat Grid button contrast",
    );
    input.focus();
    await settle();
    check(
      getComputedStyle(input).outlineStyle !== "none",
      theme + ": visible field focus",
    );
    change('[aria-label="Named grid data"]', "title\nFirst\nSecond");
    button("Read fields").click();
    await settle();
    change('[aria-label="Map Title text"]', "title");
    button("Preview import").click();
    await settle();
    const table = document.querySelector("repeat-inspector table");
    check(
      table?.textContent.includes("Second"),
      theme + ": real mapping preview",
    );
    const tableStyle = getComputedStyle(table);
    check(
      contrast(
        tableStyle.color,
        getComputedStyle(section.closest(".inspector")).backgroundColor,
      ) >= 4.5,
      theme + ": mapping table text contrast",
    );
    button("Cancel import").click();
    await settle();
    change('[aria-label="Named grid data"]', "");
    button("Read fields").click();
    await settle();
    const alert = section.querySelector('[role="alert"]');
    check(alert?.textContent.trim(), theme + ": real import validation error");
    const errorContrast = contrast(
      getComputedStyle(alert).color,
      getComputedStyle(section.closest(".inspector")).backgroundColor,
    );
    check(errorContrast >= 4.5, theme + ": readable error text");
    const zone = section.querySelector(".drop-zone");
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(["title\nFirst"], "theme.csv", { type: "text/csv" }),
    );
    zone.dispatchEvent(
      new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    );
    await settle();
    check(
      zone.classList.contains("drop-active"),
      theme + ": real active file drop state",
    );
    const drop = getComputedStyle(zone);
    check(
      contrast(
        drop.color,
        drop.backgroundColor,
        getComputedStyle(section.closest(".inspector")).backgroundColor,
      ) >= 4.5,
      theme + ": readable active drop",
    );
    zone.dispatchEvent(
      new DragEvent("dragleave", { bubbles: true, dataTransfer: transfer }),
    );
    await settle();
    check(
      JSON.stringify(await dispatch("document.checkpoint")) === checkpoint,
      theme + ": draft/appearance/focus preserve exact scene/history",
    );
    results.push({
      theme,
      inputContrast: contrast(inputStyle.color, inputStyle.backgroundColor),
      buttonContrast: contrast(normalStyle.color, normalStyle.backgroundColor),
      errorContrast,
      drawing: toolbarStyle.backgroundColor,
    });
  }
  document
    .querySelector('[aria-label="Grid rows"]')
    .scrollIntoView({ block: "center" });
  await settle();
  return {
    passed: true,
    checks: 2,
    themes: results,
    scope:
      "Rendered production chrome and Repeat Grid draft/preview/error/focus/drop states; exact scene/history preservation. Synthetic DOM events do not prove physical input or VoiceOver.",
  };
};
