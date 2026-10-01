import { Component, input, output } from '@angular/core';
import { SceneNodeView } from './scene-node';
import type { SceneDocument, SceneNode } from '../model/schema';
@Component({
  selector:'preview-screen', imports:[SceneNodeView],
  template:`@if(previous();as p){<div class="from" aria-hidden="true" inert><scene-node [node]="p" [document]="document()" [preview]="true" /></div>}
    @for(n of [node()];track n.id){<div class="screen" [class.to]="!!previous()"><scene-node [node]="n" [document]="document()" [preview]="true" [inspect]="inspect()" [selected]="selected()" (pick)="pick.emit($event)" (activate)="activate.emit($event)" /></div>}`,
  styles:`:host,.screen,.from{position:absolute;inset:0}.from{pointer-events:none;animation:dissolve-out 180ms ease-out both}.to{animation:dissolve-in 180ms ease-out both}@keyframes dissolve-in{from{opacity:0}to{opacity:1}}@keyframes dissolve-out{from{opacity:1}to{opacity:0}}@media(prefers-reduced-motion:reduce){.from,.to{animation-duration:0ms}}`,
})
export class PreviewScreen {
  readonly node=input.required<SceneNode>();
  readonly previous=input<SceneNode|null>(null);
  readonly document=input.required<SceneDocument>();
  readonly inspect=input(false);
  readonly selected=input<string[]>([]);
  readonly pick=output<{event:PointerEvent;node:SceneNode}>();
  readonly activate=output<SceneNode>();
}
