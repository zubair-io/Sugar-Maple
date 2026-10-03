// Shared production Chrome/WKWebView visual geometry checks. Width variations
// constrain the layout fixture; they do not claim a shipped panel-resize control.
window.canvasTransformAcceptance = async function () {
  const check = (value, message) => {
    if (!value) throw Error(message);
  };
  const settle = () => window.sugarMaple.dispatch("layout.inspect");
  const doc = await window.sugarMaple.dispatch("document.get");
  const ids = ["inspector-a", "inspector-b", "inspector-c"];
  await window.sugarMaple.dispatch("transaction.apply", {
    documentId: doc.documentId,
    expectedRevision: doc.revision,
    requestId: crypto.randomUUID(),
    operations: ids.map((id, i) => ({
      type: "node.add",
      node: {
        id,
        pageId: doc.document.pages[0].id,
        name: `Inspector fixture ${i + 1}`,
        kind: "rectangle",
        x: 1234.5 + i * 80,
        y: 60 + i * 20,
        width: 120,
        height: 80,
        strokeWidth: 2,
      },
    })),
  });
  await window.sugarMaple.dispatch("selection.set", { id: ids[0] });
  await settle();
  const baseline = await window.sugarMaple.dispatch("document.checkpoint");
  const workspace = document.querySelector(".workspace");
  const results = [];
  const bounds = (element) => {
    const b = element.getBoundingClientRect();
    return {
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      right: b.right,
      bottom: b.bottom,
    };
  };
  for (const width of [260, 320, 420]) {
    workspace.style.gridTemplateColumns = `280px minmax(0, 1fr) ${width}px`;
    await settle();
    const panel = document.querySelector(".inspector"),
      section = document.querySelector("#transform-details");
    const buttons = [
      ...section.querySelectorAll(
        '[aria-label="Align selected layers"] button',
      ),
    ];
    check(buttons.length === 6, "All six alignment actions remain available");
    const boxes = buttons.map(bounds),
      sectionBox = bounds(section);
    for (const [i, button] of buttons.entries()) {
      check(
        button.querySelector("svg") && !button.textContent.trim(),
        `${width}: alignment uses an icon rather than letter placeholders`,
      );
      check(
        Math.abs(boxes[i].y - boxes[0].y) < 1,
        `${width}: alignment stays on one row`,
      );
      check(
        boxes[i].width >= 30 && boxes[i].height >= 30,
        `${width}: alignment target remains usable (${boxes[i].width} × ${boxes[i].height})`,
      );
      check(
        boxes[i].x >= sectionBox.x && boxes[i].right <= sectionBox.right + 1,
        `${width}: alignment fits inspector`,
      );
    }
    const labels = [...section.querySelectorAll(".compact-field")];
    const fields = labels.map((label) => {
      const input = label.querySelector("input"),
        b = bounds(input),
        style = getComputedStyle(label);
      check(
        parseFloat(style.paddingLeft) === 0 &&
          parseFloat(style.paddingRight) === 0,
        `${width}: compact fields do not inherit padded generic inspector rows`,
      );
      check(
        b.width >= 64,
        `${width}: numeric values and spinner retain readable width (${b.width})`,
      );
      check(
        b.right <= sectionBox.right + 1,
        `${width}: numeric field stays inside inspector`,
      );
      return { name: input.getAttribute("aria-label"), ...b };
    });
    check(fields.length === 5, "Position, size and rotation remain present");
    for (const field of section.querySelectorAll(
      ".transform-parent-field select",
    )) {
      const style = getComputedStyle(field),
        context = document.createElement("canvas").getContext("2d");
      context.font = style.font;
      const textWidth = context.measureText(
        field.selectedOptions[0].textContent,
      ).width;
      check(
        textWidth <=
          field.clientWidth -
            parseFloat(style.paddingLeft) -
            parseFloat(style.paddingRight),
        `${width}: selected parent/move value is readable`,
      );
    }
    check(
      section.scrollWidth <= section.clientWidth + 1,
      `${width}: Transform has no horizontal overflow`,
    );
    check(
      JSON.stringify(
        await window.sugarMaple.dispatch("document.checkpoint"),
      ) === JSON.stringify(baseline),
      "Width/visual inspection preserves exact document and history",
    );
    results.push({ width, alignment: boxes, fields });
  }
  const current = await window.sugarMaple.dispatch("document.get");
  await window.sugarMaple.dispatch("transaction.apply", {
    documentId: current.documentId,
    expectedRevision: current.revision,
    requestId: crypto.randomUUID(),
    operations: [
      {
        type: "node.add",
        node: {
          id: "inspector-text",
          pageId: current.document.pages[0].id,
          kind: "text",
          name: "Typography fixture",
          text: "Readable type",
          x: 80,
          y: 80,
          width: 240,
          height: 44,
          strokeWidth: 2,
        },
      },
    ],
  });
  const typography = [];
  const appearanceCheckpoint = JSON.stringify(
    await window.sugarMaple.dispatch("document.checkpoint"),
  );
  for (const theme of ["dark", "light"]) {
    const appearance = document.querySelector(
      '[aria-label="Chrome appearance"]',
    );
    appearance.value = theme;
    appearance.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    check(
      JSON.stringify(
        await window.sugarMaple.dispatch("document.checkpoint"),
      ) === appearanceCheckpoint,
      "Theme switch preserves authored document/history",
    );
    for (const id of ["inspector-text", ids[0]]) {
      await window.sugarMaple.dispatch("selection.set", { id });
      await settle();
      const checkpoint = JSON.stringify(
        await window.sugarMaple.dispatch("document.checkpoint"),
      );
      for (const width of [260, 320, 420]) {
        workspace.style.gridTemplateColumns = `280px minmax(0, 1fr) ${width}px`;
        await settle();
        const section = document.querySelector(
          id === "inspector-text" ? "#typography-details" : "#style-details",
        );
        const labels = [...section.querySelectorAll(".compact-field > span")];
        check(
          labels.length >= (id === "inspector-text" ? 4 : 1),
          "Descriptive fields are present",
        );
        for (const label of labels) {
          const context = document.createElement("canvas").getContext("2d");
          context.font = getComputedStyle(label).font;
          check(
            context.measureText(label.textContent.trim()).width <=
              label.clientWidth + 1,
            `${theme}/${width}: complete ${label.textContent} label is readable`,
          );
          const input = label.parentElement.querySelector("input");
          check(
            bounds(input).width >= 64 &&
              bounds(input).right <= bounds(section).right + 1,
            `${theme}/${width}: descriptive input remains readable and contained`,
          );
        }
        check(
          JSON.stringify(
            await window.sugarMaple.dispatch("document.checkpoint"),
          ) === checkpoint,
          "Appearance and field-width inspection preserve document/history",
        );
        typography.push({
          theme,
          width,
          kind: id === "inspector-text" ? "text" : "rectangle",
          labels: labels.map((l) => l.textContent.trim()),
        });
      }
    }
  }
  document.querySelector('[aria-label="Chrome appearance"]').value = "dark";
  document
    .querySelector('[aria-label="Chrome appearance"]')
    .dispatchEvent(new Event("change", { bubbles: true }));
  await window.sugarMaple.dispatch("selection.set", { id: ids[0] });
  workspace.style.removeProperty("grid-template-columns");
  await settle();
  return {
    passed: true,
    checks: 3,
    widths: results,
    descriptiveFields: typography,
    scope:
      "Production inspector layout at constrained 260/320/420px, exact checkpoint preservation; no panel-resize or physical input claim",
  };
};
