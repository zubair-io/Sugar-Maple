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
  // Many-page/comment reads exercise the public boundary without refreshing the
  // cached document for each comment. Count actual clone inputs, not signal calls.
  const operations = [],
    expectedNames = new Map();
  for (let page = 0; page < 20; page++) {
    const id = "snapshot-many-page-" + page,
      name = "Many page " + page;
    operations.push({ type: "page.add", id, name });
    expectedNames.set(id, name);
    for (let comment = 0; comment < 5; comment++)
      operations.push({
        type: "comment.add",
        id: "snapshot-many-comment-" + page + "-" + comment,
        pageId: id,
        text: "Many comment " + comment,
      });
  }
  const beforeMany = await get();
  await api.dispatch("transaction.apply", {
    documentId: beforeMany.documentId,
    expectedRevision: beforeMany.revision,
    requestId: crypto.randomUUID(),
    operations,
  });
  const clone = window.structuredClone,
    clones = [];
  window.structuredClone = function (value, options) {
    clones.push({
      fullScene: value?.version === 1 && Array.isArray(value?.nodes),
      comments: Array.isArray(value?.comments),
    });
    return clone.call(window, value, options);
  };
  let many, cloneCounts;
  try {
    const listed = await api.dispatch("comments.list");
    if (
      listed.comments.length !== 101 ||
      listed.comments.some(
        (comment) =>
          comment.id !== "snapshot-comment" &&
          comment.pageName !== expectedNames.get(comment.pageId),
      )
    )
      throw Error("Many-page comment names are incorrect");
    const commentClones = clones.splice(0);
    many = await get();
    const documentClones = clones.splice(0);
    if (
      commentClones.length !== 1 ||
      commentClones[0].fullScene ||
      documentClones.length !== 1 ||
      !documentClones[0].fullScene
    )
      throw Error(
        "Public reads cloned cached scene repeatedly: " +
          JSON.stringify({ commentClones, documentClones }),
      );
    cloneCounts = {
      comments: commentClones.length,
      commentsFullScene: 0,
      document: documentClones.length,
    };
  } finally {
    window.structuredClone = clone;
  }
  const filtered = await api.dispatch("comments.list", {
    pageId: "snapshot-many-page-19",
    status: "all",
  });
  if (
    filtered.comments.length !== 5 ||
    filtered.comments.some((comment) => comment.pageName !== "Many page 19")
  )
    throw Error("Many-page comment filtering failed");
  await api.dispatch("history.undo", {
    documentId: many.documentId,
    expectedRevision: many.revision,
  });
  if (JSON.stringify((await get()).document) !== original)
    throw Error("Many-comment fixture undo failed");
  checks++;
  return {
    passed: true,
    checks,
    cloneCounts,
    document: (await get()).document,
  };
};
