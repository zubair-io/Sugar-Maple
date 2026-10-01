import { assetSource } from '../model/assets';
import { PrototypeSession } from './prototype-session';
import { controlLabel, hasPrototypeAction } from '../model/form';
import { Component, input, output, computed, inject } from '@angular/core';
import { SceneAssets } from './scene-assets';
import { NgStyle } from '@angular/common';
import { SceneNode, SceneDocument } from '../model/schema';
import { nodeStyles } from '../model/export';
@Component({
  selector: 'scene-node',
  imports: [NgStyle],
  templateUrl: './scene-node.html',
  styleUrl: './scene-node.scss',
})
export class SceneNodeView {
  readonly assets = inject(SceneAssets);
  readonly session = inject(PrototypeSession, { optional: true });
  readonly label = computed(() => controlLabel(this.node()));
  readonly clickable = computed(() => this.preview() && !this.inspect() && !this.node().disabled && hasPrototypeAction(this.node()));
  readonly assetURL = computed(() => assetSource(this.document(), this.node().asset));
  readonly asset = computed(() => {
    this.assets.version();
    return this.node().kind === 'image' ? { ...this.assets.get(this.assetURL()) } : null;
  });
  readonly node = input.required<SceneNode>();
  readonly document = input.required<SceneDocument>();
  readonly selected = input<string[]>([]);
  readonly preview = input(false);
  readonly inspect = input(false);
  readonly pick = output<{ event: PointerEvent; node: SceneNode }>();
  readonly activate = output<SceneNode>();
  readonly children = computed(() =>
    this.document()
      .nodes.filter((n) => n.parentId === this.node().id)
      .sort((a, b) => a.order - b.order),
  );
  onActivate(event: MouseEvent) {
    if (this.clickable()) {
      event.stopPropagation();
      // Safari/macOS may leave a clicked button unfocused. Remember the actual
      // launcher, rather than whichever input held focus before the click.
      const wrapper = event.currentTarget as HTMLElement;
      const control = ['button', 'input'].includes(this.node().kind)
        ? wrapper.querySelector<HTMLElement>('button,input') : wrapper;
      control?.focus();
      this.activate.emit(this.node());
    }
  }
  onKey(event: KeyboardEvent) {
    if (!['button', 'input'].includes(this.node().kind) && ['Enter', ' '].includes(event.key) && this.clickable()) {
      event.preventDefault(); event.stopPropagation(); this.activate.emit(this.node());
    }
  }
  readonly style = computed(() => {
    const s = nodeStyles(this.node(), this.document());
    return Object.fromEntries(
      Object.entries(s).map(([k, v]) => [
        k,
        typeof v === 'number' && !['opacity', 'fontWeight', 'flexShrink', 'flexGrow'].includes(k)
          ? v + 'px'
          : v,
      ]),
    );
  });
}
