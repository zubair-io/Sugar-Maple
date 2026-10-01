import { Injectable, signal } from '@angular/core';
import { loadBundledFont } from '../model/bundled-font-access';
import { canvasFont, genericFonts } from '../model/typography';
import type { SceneNode } from '../model/schema';
type FontState = { state: 'loading' | 'ready' | 'missing'; message: string };
@Injectable({ providedIn: 'root' })
export class SceneFonts {
  readonly version = signal(0);
  private readonly states = new Map<string, FontState>();
  private readonly pending = new Map<string, Promise<void>>();
  readonly ready = loadBundledFont().then((css) => {
    const style = document.createElement('style');
    style.dataset['mapleFont'] = 'Inter-4.1';
    style.textContent = css;
    document.head.append(style);
  });
  get(family: string): FontState {
    if (genericFonts.includes(family as (typeof genericFonts)[number]))
      return {
        state: 'ready',
        message: 'System font · available offline. Glyph fallback uses installed fonts.',
      };
    const known = this.states.get(family);
    if (known) return known;
    const loading: FontState = { state: 'loading', message: 'Checking font availability…' };
    this.states.set(family, loading);
    const task = (async () => {
      try {
        if (family === 'Maple Sans') {
          await this.ready;
          const faces = await document.fonts.load('16px "Maple Sans"');
          if (!faces.length) throw Error('Bundled font unavailable');
        } else {
          // Probe only the font explicitly requested, never enumerate installed fonts.
          await new FontFace('MapleLocalProbe', `local(${JSON.stringify(family)})`).load();
        }
        this.states.set(family, {
          state: 'ready',
          message:
            family === 'Maple Sans'
              ? 'Bundled Inter 4.1 · offline and embedded in web exports. Other scripts use installed glyph fallback.'
              : 'Local font available · install it on export consumers. Glyph fallback uses installed fonts.',
        });
      } catch {
        this.states.set(family, {
          state: 'missing',
          message: `${family} is unavailable. System fallback is shown; install the font or choose Maple Sans.`,
        });
      } finally {
        this.pending.delete(family);
        this.version.update((v) => v + 1);
      }
    })();
    this.pending.set(family, task);
    return loading;
  }
  async settle(nodes: SceneNode[]) {
    const text = nodes.filter((n) => ['text', 'button', 'input'].includes(n.kind));
    for (const n of text) this.get(n.fontFamily);
    await Promise.all(text.map((n) => this.pending.get(n.fontFamily)));
    await Promise.all(text.map((n) => document.fonts.load(canvasFont(n), n.text || 'Mg')));
  }
}
