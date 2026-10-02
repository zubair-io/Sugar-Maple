import { mkdir, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { supervise } from './supervise';

export async function buildNativeFixture(trust: boolean, signal?: AbortSignal) {
  if (!trust) throw Error('Explicit --trust-native-fixture is required; arbitrary Swift imports are unsupported');
  if (process.platform !== 'darwin') throw Error('The fixed native fixture requires macOS');
  const parent = resolve('build/library-preview-native'), generation = crypto.randomUUID();
  const staging = resolve(parent, generation + '.building'), output = resolve(parent, generation);
  const bundle = resolve(staging, 'Fixture.app'), executable = resolve(bundle, 'Contents/MacOS/Fixture');
  await mkdir(resolve(bundle, 'Contents/MacOS'), { recursive: true });
  const metrics = [];
  try {
    const info = `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>io.zubair.SugarMaple.TrustedPreviewFixture</string><key>CFBundleExecutable</key><string>Fixture</string><key>CFBundleName</key><string>Trusted Native Preview Fixture</string><key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/><key>NSHighResolutionCapable</key><true/></dict></plist>`;
    await Bun.write(resolve(bundle, 'Contents/Info.plist'), info);
    const limit = resolve(staging, 'limit');
    for (const command of [
      ['/usr/bin/clang', resolve(import.meta.dir, 'limit.c'), '-o', limit],
      [limit, '60', '/usr/bin/swiftc', '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macos14.0`, '-parse-as-library', resolve(import.meta.dir, 'fixture.swift'), '-o', executable],
      ['/usr/bin/codesign', '--force', '--sign', '-', '--entitlements', resolve(import.meta.dir, 'fixture.entitlements'), bundle],
      ['/usr/bin/codesign', '--verify', '--strict', bundle],
    ]) {
      const run = supervise(command, { wallMilliseconds: 90000, rssKiB: 1572864, outputBytes: 2000000, signal });
      metrics.push(await run.done);
    }
    if (signal?.aborted) throw Error('Build cancelled before publication');
    // Each generation owns its output. No shared executable is overwritten by a
    // late build, and a cancelled generation is never returned to a caller.
    await rename(staging, output);
    if (signal?.aborted) { await rm(output, { recursive: true, force: true }); throw Error('Build cancelled before publication'); }
    return { generation, bundle: resolve(output, 'Fixture.app'), executable: resolve(output, 'Fixture.app/Contents/MacOS/Fixture'), limit: resolve(output, 'limit'), metrics };
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
}
export class NativeBuildSession {
  private generation = 0;
  private active: AbortController | null = null;
  async prepare(trust: boolean) {
    if (!trust) throw Error('Explicit --trust-native-fixture is required');
    const generation = ++this.generation;
    this.active?.abort();
    const active = new AbortController(); this.active = active;
    try {
      const result = await buildNativeFixture(true, active.signal);
      if (generation !== this.generation || active.signal.aborted) {
        await rm(resolve(result.bundle, '..'), { recursive: true, force: true });
        throw Error('Native build superseded');
      }
      return result;
    } catch (error) { if (generation !== this.generation) throw Error('Native build superseded'); throw error; }
    finally { if (this.active === active) this.active = null; }
  }
  stop() { this.generation++; this.active?.abort(); this.active = null; }
}
if (import.meta.main) console.log(JSON.stringify(await buildNativeFixture(process.argv.includes('--trust-native-fixture')), null, 2));
