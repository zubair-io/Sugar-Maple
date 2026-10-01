import { mkdirSync } from "node:fs";
import { libraryFixture } from "./library-fixture";
import { exportNode } from "../src/web/src/app/model/export";
import { resolve } from "node:path";
import { strict as assert } from "node:assert";
if (process.platform !== "darwin")
  throw Error("Native library consumer requires macOS");
const folder = resolve("build/library-consumer");
mkdirSync(folder, { recursive: true });
const source = exportNode(libraryFixture().document, "root", "swift-library"),
  path = folder + "/native-consumer.swift",
  executable = folder + "/native-consumer";
await Bun.write(
  path,
  source +
    `\nimport AppKit\n@main struct LibraryConsumer {\n@MainActor static func main() {\nNSApplication.shared.setActivationPolicy(.accessory)\nNSApplication.shared.finishLaunching()\nlet host = NSHostingView(rootView: SugarMapleView())\nhost.frame = NSRect(x:0,y:0,width:400,height:500)\nhost.layoutSubtreeIfNeeded()\nlet bitmap = host.bitmapImageRepForCachingDisplay(in: host.bounds)!\nhost.cacheDisplay(in: host.bounds, to: bitmap)\nprecondition(bitmap.pixelsWide > 0 && bitmap.pixelsHigh > 0)\ntry! bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: ${JSON.stringify(folder + "/native-consumer.png")}))\nprint("PASS: explicit SwiftUI Button/TextField/VStack mappings compile against the macOS 14 API baseline and render through actual NSHostingView")\n}\n}\n`,
);
for (const command of [
  [
    "swiftc",
    "-target",
    `${process.arch === "arm64" ? "arm64" : "x86_64"}-apple-macos14.0`,
    "-parse-as-library",
    path,
    "-o",
    executable,
  ],
  [executable],
]) {
  const child = Bun.spawn(command, { stdout: "inherit", stderr: "inherit" });
  assert.equal(await child.exited, 0);
}
