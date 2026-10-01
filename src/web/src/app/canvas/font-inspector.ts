import { Component, computed, inject, input } from '@angular/core';
import { SceneFonts } from './scene-fonts';
import type { SceneNode } from '../model/schema';
@Component({
  selector: 'font-inspector',
  template: `<p [attr.role]="font().state === 'missing' ? 'alert' : 'status'">
    {{ font().message }}
  </p>`,
  styles: `
    p {
      font-size: 11px;
      line-height: 1.5;
      margin: 8px 0;
      color: var(--chrome-muted);
    }
    [role='alert'] {
      color: #fbbf24;
    }
  `,
})
export class FontInspector {
  readonly fonts = inject(SceneFonts);
  readonly node = input.required<SceneNode>();
  readonly font = computed(() => {
    this.fonts.version();
    return this.fonts.get(this.node().fontFamily);
  });
}
