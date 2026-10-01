import { assetSource, type AssetTable } from '../model/assets';
import { Injectable, signal } from '@angular/core';
import type { SceneNode } from '../model/schema';
interface Asset { image: HTMLImageElement; state: 'loading' | 'ready' | 'error'; message?: string; settled: Promise<void>; }
function visibleImages(nodes: SceneNode[]) {
  const byId = new Map(nodes.map(n=>[n.id,n]));
  return nodes.filter(n=>{
    if(n.kind!=='image') return false;
    let current: SceneNode | undefined=n;
    while(current) {if(current.hidden) return false;current=byId.get(current.parentId??'');}
    return true;
  });
}
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
  diagnostics(nodes: SceneNode[], assets: AssetTable = {}) {
    this.version();
    return visibleImages(nodes).flatMap(n => {
      const a = this.get(assetSource({ assets }, n.asset));
      return a.state === 'ready' ? [] : [{ nodeId: n.id, name: n.name, state: a.state, message: a.message ?? 'Image loading' }];
    });
  }
  async settle(nodes: SceneNode[], assets: AssetTable = {}) {
    const loading = visibleImages(nodes).map(n => this.get(assetSource({ assets }, n.asset)));
    let timer: ReturnType<typeof setTimeout>;
    await Promise.race([Promise.all(loading.map(a => a.settled)), new Promise<void>((_, reject) => {
      timer = setTimeout(() => reject(Error('Image decode timed out')), 5000);
    })]).finally(() => clearTimeout(timer));
  }
  prune(nodes: SceneNode[], assets: AssetTable = {}) {
    const sources = new Set(nodes.filter(n => n.kind === 'image').map(n => assetSource({ assets }, n.asset)));
    for (const source of this.cache.keys()) if (!sources.has(source)) this.cache.delete(source);
  }
}
