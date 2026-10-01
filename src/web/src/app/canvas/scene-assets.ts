import { Injectable, signal } from '@angular/core';
import type { SceneNode } from '../model/schema';
interface Asset { image: HTMLImageElement; state: 'loading' | 'ready' | 'error'; message?: string; settled: Promise<void>; }
@Injectable({ providedIn: 'root' })
export class SceneAssets {
  readonly version = signal(0);
  private readonly cache = new Map<string, Asset>();
  get(source: string): Asset {
    const existing = this.cache.get(source);
    if (existing) return existing;
    const image = new Image();
    let finish!: () => void;
    const asset: Asset = { image, state: 'loading', settled: new Promise<void>(resolve => { finish = resolve; }) };
    this.cache.set(source, asset);
    const done = (state: 'ready' | 'error') => {
      asset.state = state;
      if (state === 'error') asset.message = 'Image could not be decoded. Reimport a valid PNG, JPEG or WebP.';
      this.version.update(v => v + 1); finish();
    };
    image.onload = () => done(image.naturalWidth && image.naturalHeight ? 'ready' : 'error');
    image.onerror = () => done('error');
    if (!source) done('error'); else image.src = source;
    return asset;
  }
  diagnostics(nodes: SceneNode[]) {
    this.version();
    return nodes.filter(n => n.kind === 'image').flatMap(n => {
      const a = this.get(n.asset);
      return a.state === 'ready' ? [] : [{ nodeId: n.id, name: n.name, state: a.state, message: a.message ?? 'Image loading' }];
    });
  }
  async settle(nodes: SceneNode[]) {
    const assets = nodes.filter(n => n.kind === 'image').map(n => this.get(n.asset));
    let timer: ReturnType<typeof setTimeout>;
    await Promise.race([Promise.all(assets.map(a => a.settled)), new Promise<void>((_, reject) => {
      timer = setTimeout(() => reject(Error('Image decode timed out')), 5000);
    })]).finally(() => clearTimeout(timer));
  }
  prune(nodes: SceneNode[]) {
    const sources = new Set(nodes.filter(n => n.kind === 'image').map(n => n.asset));
    for (const source of this.cache.keys()) if (!sources.has(source)) this.cache.delete(source);
  }
}
