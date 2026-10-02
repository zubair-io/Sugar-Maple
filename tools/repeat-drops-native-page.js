window.canvasTransformAcceptance = async function () {
  const check = (ok, message) => {
      if (!ok) throw Error(message);
    },
    equal = (a, b, message) =>
      check(JSON.stringify(a) === JSON.stringify(b), message),
    get = () => window.sugarMaple.dispatch("document.get"),
    checkpoint = () => window.sugarMaple.dispatch("document.checkpoint");
  const initial = await get(),
    grid = initial.document.nodes.find((n) => n.repeatTemplateId).id;
  await window.sugarMaple.dispatch("selection.set", { id: grid });
  await window.sugarMaple.dispatch("viewport.fit");
  const before = await checkpoint();
  let checks = 0;
  const region = () =>
      document.querySelector('[aria-label="Drop Repeat Grid files"]'),
    input = (label) => document.querySelector(`[aria-label="${label}"]`),
    button = (name) =>
      [...document.querySelectorAll("repeat-inspector button")].find(
        (e) => e.textContent.trim() === name,
      );
  const wait = async (predicate, message) => {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
      if (Date.now() > deadline) throw Error(message);
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  const pixel =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
  const png = (name) =>
      new File([Uint8Array.from(atob(pixel), (c) => c.charCodeAt(0))], name, {
        type: "image/png",
      }),
    text = (name, value) => new File([value], name, { type: "text/plain" });
  const undo = async () => {
    const d = await get();
    await window.sugarMaple.dispatch("history.undo", {
      documentId: d.documentId,
      expectedRevision: d.revision,
    });
    await window.sugarMaple.dispatch("layout.inspect");
  };
  const select = (label, value) => {
    const el = input(label);
    check(
      el,
      "Missing " +
        label +
        " at check " +
        checks +
        "; " +
        document.querySelector("repeat-inspector")?.textContent,
    );
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const dispatch = (transfer) => {
    check(region(), "WK drop region unavailable at check " + checks);
    return region().dispatchEvent(
      new DragEvent("drop", {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  };
  const drop = async (files) => {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(file);
    dispatch(transfer);
    await window.sugarMaple.dispatch("layout.inspect");
    await wait(
      () => region().getAttribute("aria-busy") === "false",
      "WK drop did not settle",
    );
  };
  const preview = async () => {
    button("Preview import").click();
    await wait(() => !!button("Apply grid data"), "WK mapping preview missing");
  };
  const apply = async () => {
    button("Apply grid data").click();
    await wait(() => !button("Apply grid data"), "WK import did not complete");
    await window.sugarMaple.dispatch("layout.inspect");
  };
  await window.sugarMaple.dispatch("layout.inspect");
  await wait(() => !!region(), "WK selected grid inspector did not render");
  await drop([
    text("people.csv", "title,photo\nFirst,pixel.png\nSecond,pixel.png"),
    png("pixel.png"),
  ]);
  select("Map Title text", "title");
  select("Map Photo asset", "photo");
  await preview();
  equal(await checkpoint(), before, "WK staging must not author");
  await apply();
  const imported = await checkpoint();
  check(
    imported.journal.length === before.journal.length + 1,
    "WK import must be one batch",
  );
  check(
    imported.journal.at(-1).origin === "human",
    "WK drop uses human command path",
  );
  check(
    imported.document.nodes.find((n) => n.id === "title").text === "First",
    "WK text imported",
  );
  check(Object.keys(imported.document.assets).length === 1, "WK images shared");
  checks++;
  await undo();
  equal((await checkpoint()).document, before.document, "WK drop undo exact");
  checks++;
  await drop([text("labels.txt", "  First  \r\nSecond\n")]);
  select("Map Title text", "text");
  await preview();
  button("Cancel import").click();
  equal(
    (await checkpoint()).document,
    before.document,
    "WK text cancel unchanged",
  );
  checks++;
  await drop([text("labels.txt", "  First  \r\nSecond\n")]);
  select("Map Title text", "text");
  await preview();
  await apply();
  check(
    (await checkpoint()).document.nodes.find((n) => n.id === "title").text ===
      "  First  ",
    "WK whitespace retained",
  );
  await undo();
  equal((await checkpoint()).document, before.document, "WK text undo exact");
  checks++;
  await drop([png("02.png"), png("01.png")]);
  equal(
    JSON.parse(input("Named grid data").value),
    [{ image: "01.png" }, { image: "02.png" }],
    "WK filename order",
  );
  select("Map Photo asset", "image");
  await preview();
  await apply();
  await undo();
  equal(
    (await checkpoint()).document,
    before.document,
    "WK ordered images undo",
  );
  checks++;
  const fileEntry = (file) => ({
      isFile: true,
      isDirectory: false,
      name: file.name,
      fullPath: "/Images/" + file.name,
      file: (yes) => yes(file),
    }),
    batches = [
      [fileEntry(png("02.png"))],
      [fileEntry(text(".DS_Store", "fixture")), fileEntry(png("01.png"))],
      [],
    ];
  const directory = {
      isFile: false,
      isDirectory: true,
      name: "Images",
      fullPath: "/Images",
      createReader: () => ({ readEntries: (yes) => yes(batches.shift()) }),
    },
    folderTransfer = new DataTransfer();
  Object.defineProperty(folderTransfer, "items", {
    value: [
      {
        kind: "file",
        getAsFile: () => null,
        webkitGetAsEntry: () => directory,
      },
    ],
  });
  dispatch(folderTransfer);
  await window.sugarMaple.dispatch("layout.inspect");
  await wait(
    () => region().getAttribute("aria-busy") === "false",
    "WK directory did not settle",
  );
  equal(
    JSON.parse(input("Named grid data").value),
    [{ image: "01.png" }, { image: "02.png" }],
    "WK complete fragmented folder",
  );
  select("Map Photo asset", "image");
  await preview();
  equal(
    (await checkpoint()).document,
    before.document,
    "WK directory staged only",
  );
  button("Cancel import").click();
  checks++;
  for (const [files, message] of [
    [[png("same.png"), png("same.png")], "Duplicate"],
    [[png("ok.png"), text("script.js", "alert(1)")], "Choose PNG"],
    [[text("bad.json", '[{"title":7}]')], "must be a string"],
    [[text("large.csv", "x".repeat(1_000_001))], "1 MB"],
  ]) {
    await drop(files);
    check(
      document
        .querySelector("repeat-inspector [role=alert]")
        ?.textContent.includes(message),
      "WK batch diagnostic " + message,
    );
    equal(
      (await checkpoint()).document,
      before.document,
      "WK invalid batch unchanged",
    );
    check(!button("Apply grid data"), "WK invalid batch unprepared");
    checks++;
  }
  await drop([text("stale.csv", "title\nFirst\nSecond")]);
  select("Map Title text", "title");
  await preview();
  const d = await get();
  await window.sugarMaple.dispatch("transaction.apply", {
    documentId: d.documentId,
    expectedRevision: d.revision,
    requestId: crypto.randomUUID(),
    operations: [{ type: "document.rename", name: "Concurrent WK import" }],
  });
  await wait(
    () => !button("Apply grid data"),
    "WK stale import must invalidate",
  );
  await undo();
  checks++;
  const stuckDirectory = {
      isFile: false,
      isDirectory: true,
      name: "Pending",
      fullPath: "/Pending",
      createReader: () => ({ readEntries: () => {} }),
    },
    pending = new DataTransfer();
  Object.defineProperty(pending, "items", {
    value: [
      {
        kind: "file",
        getAsFile: () => null,
        webkitGetAsEntry: () => stuckDirectory,
      },
    ],
  });
  dispatch(pending);
  await window.sugarMaple.dispatch("layout.inspect");
  await wait(
    () => region().getAttribute("aria-busy") === "true",
    "WK reading state",
  );
  button("Cancel import").click();
  await wait(
    () => region().getAttribute("aria-busy") === "false",
    "WK cancelled reader must settle",
  );
  equal(
    (await checkpoint()).document,
    before.document,
    "WK cancelled reader unchanged",
  );
  checks++;
  await drop([text("people.json", '[{"title":"First"},{"title":"Second"}]')]);
  select("Map Title text", "title");
  await preview();
  region().scrollIntoView({ block: "center" });
  return {
    passed: true,
    checks,
    scope:
      "Actual production WK File/DataTransfer CSV/text/images/directory staging, complete fragmented entries, image decode, atomic human import/undo, invalid-batch and cancellation/stale guards. Directory entries are supplied fixtures; actual OS chooser is validated separately.",
  };
};
