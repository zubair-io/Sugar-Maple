import { Injectable, signal } from '@angular/core';
import { PrototypeRuntime } from '../model/prototype-runtime';
import type { SceneNode } from '../model/schema';
@Injectable()
export class PrototypeSession {
  readonly state = new PrototypeRuntime();
  readonly version = signal(0);
  value(node: SceneNode) { this.version(); return this.state.value(node); }
  input(node: SceneNode, event: Event) {
    this.state.set(node, (event.target as HTMLInputElement).value);
    this.version.update(v => v + 1);
  }
}
