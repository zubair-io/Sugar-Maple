import { ApplicationRef, Component, inject, OnDestroy, signal } from '@angular/core';
import { PrototypePreview } from './prototype-preview';
import { SceneFonts } from './scene-fonts';
import { SceneAssets } from './scene-assets';
import { PreviewFeed, type PreviewSnapshot } from '../model/preview-snapshot';

declare global {
  interface Window {
    sugarMaplePreview?: { ready: boolean; receive(value: unknown): Promise<boolean>; dispose(): void };
  }
}
@Component({
  selector: 'app-root', imports: [PrototypePreview],
  template: `@if (snapshot(); as s) {
    <prototype-preview [document]="s.document" [rootId]="s.rootId" [standalone]="true" (closed)="close($event)" />
  } @else { <p role="status">Waiting for the editor’s preview scene…</p> }`,
})
export class PreviewApplication implements OnDestroy {
  readonly snapshot = signal<PreviewSnapshot | null>(null);
  private readonly feed = new PreviewFeed();
  private readonly fonts = inject(SceneFonts);
  private readonly assets = inject(SceneAssets);
  private readonly app = inject(ApplicationRef);
  private disposed = false;
  constructor() {
    window.sugarMaplePreview = {
      ready: true,
      receive: async (value) => {
        if (this.disposed) return false;
        const next = this.feed.accept(value);
        if (!next) return false;
        this.assets.prune(next.document.nodes, next.document.assets);
        await this.fonts.ready;
        await Promise.all([this.fonts.settle(next.document.nodes), this.assets.settle(next.document.nodes, next.document.assets)]);
        if (this.disposed || this.feed.current !== next) return false;
        this.snapshot.set(next);
        return true;
      },
      dispose: () => {
        if (this.disposed) return;
        this.disposed = true; window.sugarMaplePreview!.ready = false;
        this.app.destroy();
      },
    };
  }
  close(error: string) {
    const handler = window.webkit?.messageHandlers.preview;
    if (handler) void handler.postMessage({ action: error ? 'close' : 'returnToEditor', error });
    else { this.snapshot.set(null); this.feed.current = null; }
  }
  ngOnDestroy() { this.disposed = true; delete window.sugarMaplePreview; }
}
