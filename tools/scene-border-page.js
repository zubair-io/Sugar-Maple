window.canvasTransformAcceptance = async () => {
  const assert = (value, message) => {
    if (!value) throw Error(message);
  };
  const wait = async (predicate) => {
    const deadline = Date.now() + 10000;
    while (!(await predicate())) {
      assert(
        Date.now() < deadline,
        "Scene border consumer did not become ready",
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };
  const dispatch = (method, args) => window.sugarMaple.dispatch(method, args);
  const tx = async (operations) => {
    const d = await dispatch("document.get");
    return dispatch("transaction.apply", {
      documentId: d.documentId,
      expectedRevision: d.revision,
      requestId: crypto.randomUUID(),
      operations,
    });
  };
  await dispatch("viewport.fit");
  const preview = document.createElement("iframe");
  preview.title = "Isolated semantic border fixture";
  preview.style.cssText =
    "position:fixed;left:300px;top:80px;width:800px;height:650px;z-index:9000;border:0";
  preview.src = location.href.split("#")[0] + "#preview";
  document.body.append(preview);
  const html = document.createElement("iframe");
  html.title = "Portable border fixture";
  html.style.cssText =
    "position:fixed;left:-2000px;width:600px;height:600px;border:0";
  document.body.append(html);
  const records = [];
  try {
    await wait(() => preview.contentWindow?.sugarMaplePreview?.ready);
    assert(
      typeof preview.contentWindow.sugarMaple === "undefined",
      "Semantic consumer has no authoring dispatcher",
    );
    const boxes = (elements, ids) => {
      const root = elements[0].getBoundingClientRect();
      return Object.fromEntries(
        elements.map((el, index) => {
          const b = el.getBoundingClientRect();
          return [
            ids ? ids[index] : el.dataset.nodeId,
            {
              x: b.x - root.x,
              y: b.y - root.y,
              width: b.width,
              height: b.height,
            },
          ];
        }),
      );
    };
    const difference = (actual, expected, label) => {
      let max = 0;
      assert(
        Object.keys(actual).length === Object.keys(expected).length,
        label + " all source identities",
      );
      for (const [id, box] of Object.entries(expected))
        for (const key of ["x", "y", "width", "height"]) {
          const delta = Math.abs(actual[id][key] - box[key]);
          max = Math.max(max, delta);
          assert(
            delta <= 0.1,
            `${label} ${id}.${key}: actual ${actual[id][key]}, Canvas ${box[key]}, tolerance .1`,
          );
        }
      return max;
    };
    const compare = async (name) => {
      const layout = await dispatch("layout.inspect"),
        d = await dispatch("document.get"),
        checkpoint = JSON.stringify(await dispatch("document.checkpoint"));
      assert(
        layout.documentId === d.documentId && layout.revision === d.revision,
        "Settled source identity",
      );
      const root = layout.nodes.find((n) => n.id === "border-root").bounds,
        scale = root.width / 500;
      const canvas = Object.fromEntries(
        layout.nodes.map((n) => {
          assert(n.rendered && n.painted && n.bounds, "Canvas renders " + n.id);
          return [
            n.id,
            {
              x: (n.bounds.x - root.x) / scale,
              y: (n.bounds.y - root.y) / scale,
              width: n.bounds.width / scale,
              height: n.bounds.height / scale,
            },
          ];
        }),
      );
      await preview.contentWindow.sugarMaplePreview.receive({
        version: 1,
        documentId: d.documentId,
        revision: d.revision,
        rootId: "border-root",
        document: d.document,
      });
      await wait(
        () =>
          preview.contentDocument.querySelectorAll("[data-node-id]").length ===
          d.document.nodes.length,
      );
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const semantic = boxes([
        ...preview.contentDocument.querySelectorAll(
          ".preview-stage [data-node-id]",
        ),
      ]);
      const maxSemantic = difference(semantic, canvas, name + " semantic");
      const code = (
        await dispatch("code.export", { id: "border-root", target: "html" })
      ).code;
      html.srcdoc = "<!doctype html><style>body{margin:0}</style>" + code;
      await new Promise((resolve) => {
        html.onload = resolve;
      });
      const nodes = [
        ...html.contentDocument.body.querySelectorAll("div,p,button,input"),
      ];
      const ordered = [];
      const visit = (id) => {
        ordered.push(id);
        d.document.nodes
          .filter((n) => n.parentId === id)
          .sort((a, b) => a.order - b.order)
          .forEach((n) => visit(n.id));
      };
      visit("border-root");
      assert(nodes.length === ordered.length, "Portable source tree shape");
      const portableHTML = boxes(nodes, ordered),
        maxHTML = difference(portableHTML, canvas, name + " portable HTML");
      const rules = await Promise.all(
        ordered.map(
          async (id) =>
            (await dispatch("code.export", { id, target: "css" })).code,
        ),
      );
      nodes.forEach((node, index) => {
        node.removeAttribute("style");
        node.className = "node-" + ordered[index];
      });
      const style = html.contentDocument.createElement("style");
      style.textContent = rules.join("\n");
      html.contentDocument.head.append(style);
      const portableCSS = boxes(nodes, ordered),
        maxCSS = difference(portableCSS, canvas, name + " portable CSS");
      assert(
        JSON.stringify(await dispatch("document.checkpoint")) === checkpoint,
        "Consumers do not mutate source or journal",
      );
      records.push({
        name,
        sourceRevision: d.revision,
        canvas,
        semantic,
        portableHTML,
        portableCSS,
        maxDelta: { semantic: maxSemantic, html: maxHTML, css: maxCSS },
      });
      return d.document;
    };
    await compare("free");
    for (const layout of ["horizontal", "vertical", "grid"]) {
      await tx([
        { type: "node.update", id: "border-frame", patch: { layout } },
        {
          type: "node.update",
          id: "border-button",
          patch: {
            heightMode: layout === "grid" ? "fixed" : "percent",
            height: 44.25,
          },
        },
        {
          type: "node.update",
          id: "border-input",
          patch: { widthPercent: layout === "horizontal" ? 30 : 60 },
        },
      ]);
      await compare(layout);
    }
    const target = await dispatch("document.get");
    await dispatch("history.undo", {
      documentId: target.documentId,
      expectedRevision: target.revision,
    });
    await compare("undo-to-vertical");
    assert(
      (window.canvasTransformErrors ?? []).length === 0,
      "No production page errors",
    );
    return {
      passed: true,
      checks: records.length,
      records,
      toleranceLogicalPoints: 0.1,
      scope:
        "Actual production Canvas and isolated semantic preview plus portable HTML/CSS, free/stack/grid fractional frame borders, fill/percent sizing, source undo and unchanged consumer history; synthetic fixture commands, no physical OS input or full accessibility claim",
    };
  } finally {
    html.remove();
    preview.remove();
  }
};
