import { createHash } from "node:crypto";
import ts from "../src/web/node_modules/typescript";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname, relative, sep } from "node:path";

const root = resolve(import.meta.dir, ".."),
  chrome = resolve(root, "src/web/src/app/chrome/maple"),
  inventoryPath = resolve(chrome, "inventory.json"),
  revision = "dc6205dbd5ea8031510777e3031abad50cb7e2e7",
  upstreamPrefix = "src/web/projects/maple-common/src/lib/";
function files(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(folder, entry.name);
    return entry.isDirectory() ? files(path) : entry.isFile() ? [path] : [];
  });
}
const sourceFiles = () =>
  files(chrome)
    .filter((path) => /\.(ts|scss|html)$/.test(path))
    .sort();
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
function imports(source: string) {
  const targets: string[] = [];
  const ast = ts.createSourceFile(
    "source.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      if (!ts.isStringLiteral(node.moduleSpecifier))
        throw Error("Import must name a literal module");
      targets.push(node.moduleSpecifier.text);
    }
    if (
      ts.isImportEqualsDeclaration(node) ||
      (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require")))
    )
      throw Error(
        "Dynamic/require imports need an explicit dependency boundary review",
      );
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return targets;
}
function checkBoundary() {
  const external = new Set<string>();
  for (const path of sourceFiles()) {
    const text = readFileSync(path, "utf8");
    for (const target of path.endsWith(".ts") ? imports(text) : []) {
      if (target.startsWith(".")) {
        const imported = resolve(dirname(path), target);
        if (
          !imported.startsWith(chrome + sep) ||
          ![imported + ".ts", resolve(imported, "index.ts")].some(existsSync)
        )
          throw Error(
            "Chrome import leaves its vendored closure: " +
              relative(root, path) +
              " -> " +
              target,
          );
      } else {
        if (target !== "@angular/core")
          throw Error("Unexpected chrome runtime dependency: " + target);
        external.add(target);
      }
    }
  }
  for (const folder of ["model", "canvas"])
    for (const path of files(resolve(root, "src/web/src/app", folder)).filter(
      (p) => p.endsWith(".ts"),
    ))
      for (const target of imports(readFileSync(path, "utf8")))
        if (/chrome\/maple|maple-common|_Maple/.test(target))
          throw Error(
            "Authored scene imports host chrome: " + relative(root, path),
          );
  return [...external].sort();
}
if (process.argv.includes("--refresh")) {
  const at = process.argv.indexOf("--source"),
    source = process.argv[at + 1];
  if (at < 0 || !source || source.startsWith("--"))
    throw Error("Refresh requires --source <read-only upstream checkout>");
  function git(...args: string[]) {
    const result = Bun.spawnSync(["git", "-C", resolve(source), ...args]);
    if (result.exitCode) throw Error("Cannot inspect pinned upstream revision");
    return result.stdout;
  }
  const upstreamPaths = git("ls-tree", "-r", "--name-only", revision)
      .toString()
      .trim()
      .split("\n"),
    componentSources = upstreamPaths.filter(
      (p) =>
        p.startsWith(upstreamPrefix + "ui/") && p.endsWith(".component.ts"),
    ),
    rootNotices = upstreamPaths.filter(
      (p) => !p.includes("/") && /^(?:LICENSE|COPYING|NOTICE)(?:\.|$)/i.test(p),
    );
  const inventory = {
    inventoryVersion: 1,
    repository: "https://github.com/zubair-io/Maple",
    revision,
    externalRuntimeDependencies: checkBoundary(),
    upstreamUIComponentSources: componentSources,
    rootNoticeFiles: rootNotices,
    files: sourceFiles().map((path) => {
      const localPath = relative(chrome, path).split(sep).join("/"),
        matches = upstreamPaths.filter(
          (p) =>
            p.startsWith(upstreamPrefix) &&
            p.endsWith("/" + localPath.split("/").at(-1)),
        );
      if (matches.length > 1)
        throw Error("Ambiguous upstream source for " + localPath);
      const upstreamPath = matches[0] ?? null,
        bytes = readFileSync(path),
        upstreamBytes = upstreamPath
          ? git("show", revision + ":" + upstreamPath)
          : null;
      return {
        path: localPath,
        sha256: sha(bytes),
        upstreamPath,
        upstreamBlob: upstreamPath
          ? git("rev-parse", revision + ":" + upstreamPath)
              .toString()
              .trim()
          : null,
        upstreamSHA256: upstreamBytes ? sha(upstreamBytes) : null,
        classification: !upstreamBytes
          ? "local chrome composition/style"
          : Buffer.compare(bytes, upstreamBytes) === 0
            ? "exact pinned source"
            : "adapted pinned source",
      };
    }),
  };
  await Bun.write(inventoryPath, JSON.stringify(inventory, null, 2) + "\n");
}
const inventory = await Bun.file(inventoryPath).json();
if (inventory.revision !== revision) throw Error("Unexpected Maple source pin");
const current = sourceFiles().map((path) => ({
  path: relative(chrome, path).split(sep).join("/"),
  sha256: sha(readFileSync(path)),
}));
if (
  JSON.stringify(current) !==
  JSON.stringify(
    inventory.files.map(({ path, sha256 }: any) => ({ path, sha256 })),
  )
)
  throw Error(
    "Vendored source inventory is stale; inspect changes and explicitly refresh from the pinned upstream revision",
  );
if (
  JSON.stringify(checkBoundary()) !==
  JSON.stringify(inventory.externalRuntimeDependencies)
)
  throw Error("Chrome runtime dependency inventory changed");
console.log(
  `PASS: ${current.length} chrome source files match the exact inventory; runtime imports stay in the vendored closure plus Angular core; model/Canvas imports exclude Maple chrome. Upstream has ${inventory.upstreamUIComponentSources.length} component source modules; this is a narrow subset.`,
);
