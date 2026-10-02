window.canvasTransformAcceptance = async () => {
  const api = window.sugarMaple;
  const get = () => api.dispatch("document.get");
  const initial = await get(),
    pageId = initial.document.pages[0].id;
  const receipt = await api.dispatch("transaction.apply", {
    documentId: initial.documentId,
    expectedRevision: initial.revision,
    requestId: crypto.randomUUID(),
    operations: [
      { type: "folder.add", id: "snapshot-folder", name: "Original folder" },
      { type: "page.update", id: pageId, folderId: "snapshot-folder" },
      {
        type: "node.add",
        node: {
          id: "snapshot-gradient",
          pageId,
          name: "Original gradient",
          kind: "rectangle",
          gradient: {
            type: "linear",
            stops: [
              { offset: 0, color: "#112233" },
              { offset: 1, color: "#ffffff" },
            ],
          },
        },
      },
      {
        type: "comment.add",
        id: "snapshot-comment",
        pageId,
        text: "Original comment",
      },
    ],
  });
  const before = await get(),
    original = JSON.stringify(before.document);
  const checkpoint = JSON.stringify(await api.dispatch("document.checkpoint"));
  let checks = 0;
  const check = async (label) => {
    const next = await get();
    if (
      JSON.stringify(next.document) !== original ||
      next.revision !== before.revision ||
      JSON.stringify(await api.dispatch("document.checkpoint")) !== checkpoint
    )
      throw Error(label + " changed scene, revision or recovery history");
    checks++;
  };
  receipt.documentId = "wrong-document";
  receipt.revision = 999;
  receipt.ids.push("untracked-id");
  await check("transaction receipt mutation");
  const full = await get();
  full.document.name = "Untracked title";
  full.document.nodes.find(
    (n) => n.id === "snapshot-gradient",
  ).gradient.stops[0].color = "#ff0000";
  full.document.comments[0].messages[0].text = "Untracked message";
  await check("document.get snapshot mutation");
  const scoped = await api.dispatch("document.read", {
    documentId: before.documentId,
    expectedRevision: before.revision,
    scope: "document",
  });
  scoped.nodes.find(
    (n) => n.id === "snapshot-gradient",
  ).gradient.stops[0].color = "#ff0000";
  scoped.references.pages[0].name = "Untracked page";
  await check("document.read snapshot mutation");
  const discovery = await api.dispatch("editor.discover");
  discovery.folders[0].name = "Untracked folder";
  await check("editor.discover snapshot mutation");
  const comments = await api.dispatch("comments.list");
  comments.comments[0].messages[0].text = "Untracked reply";
  await check("comments.list snapshot mutation");
  await api.dispatch("history.undo", {
    documentId: before.documentId,
    expectedRevision: before.revision,
  });
  if (
    JSON.stringify((await get()).document) !== JSON.stringify(initial.document)
  )
    throw Error("Exact undo after attempted snapshot mutation failed");
  checks++;
  const undone = await get();
  await api.dispatch("history.redo", {
    documentId: undone.documentId,
    expectedRevision: undone.revision,
  });
  if (JSON.stringify((await get()).document) !== original)
    throw Error("Exact redo failed");
  checks++;
  return { passed: true, checks, document: (await get()).document };
};
