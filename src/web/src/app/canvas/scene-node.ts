import { Component, input, output, computed } from '@angular/core';
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
  readonly node = input.required<SceneNode>();
  readonly document = input.required<SceneDocument>();
  readonly selected = input<string | null>(null);
  readonly preview = input(false);
  readonly pick = output<{ event: PointerEvent; node: SceneNode }>();
  readonly activate = output<SceneNode>();
  readonly children = computed(() =>
    this.document()
      .nodes.filter((n) => n.parentId === this.node().id)
      .sort((a, b) => a.order - b.order),
  );
  readonly style = computed(() => {
    const s = nodeStyles(this.node(), this.document());
    return Object.fromEntries(
      Object.entries(s).map(([k, v]) => [
        k,
        typeof v === 'number' && !['opacity', 'fontWeight', 'flexShrink'].includes(k)
          ? v + 'px'
          : v,
      ]),
    );
  });
}
