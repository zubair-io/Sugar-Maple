import { assetSource } from '../model/assets';
import { Component, computed, inject, input } from '@angular/core';
import { EditorService } from '../editor.service';
import type { SceneNode } from '../model/schema';
@Component({
  selector: 'asset-inspector',
  template: `
    <p [attr.role]="asset().state === 'error' ? 'alert' : 'status'">
      {{ asset().message || (asset().state === 'ready' ? 'Image ready' : 'Image loading…') }}
    </p>
    <label
      >Replace image
      <input
        type="file"
        aria-label="Replace image"
        accept="image/png,image/jpeg,image/webp"
        (change)="replace($event)"
      />
    </label>
    <p class="hint">
      PNG, JPEG or WebP · under 5 MB. Keeps this layer’s position, size and connections.
    </p>
  `,
  styles: `
    :host {
      display: block;
      padding: 12px 16px;
    }
    p {
      font-size: 12px;
      line-height: 1.5;
    }
    label {
      display: grid;
      gap: 8px;
      font-size: 12px;
    }
    .hint {
      color: #aaa;
    }
    input {
      max-width: 100%;
    }
  `,
})
export class AssetInspector {
  readonly e = inject(EditorService);
  readonly node = input.required<SceneNode>();
  readonly asset = computed(() => {
    this.e.assets.version();
    return { ...this.e.assets.get(assetSource(this.e.doc(), this.node().asset)) };
  });
  async replace(event: Event) {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    if (file) await this.e.image(file, this.node().id);
    input.value = '';
  }
}
