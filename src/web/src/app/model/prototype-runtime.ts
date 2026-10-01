import type { SceneDocument, SceneNode } from './schema';
export class PrototypeRuntime {
  documentId = '';
  rootId: string | null = null;
  currentId: string | null = null;
  history: string[] = [];
  overlays: string[] = [];
  values: Record<string, string> = Object.create(null);
  error = '';
  start(doc: SceneDocument, rootId: string) {
    if (doc.nodes.find(n => n.id === rootId)?.kind !== 'artboard') throw Error('Preview requires an artboard.');
    this.documentId = doc.id; this.rootId = this.currentId = rootId;
    this.history = []; this.overlays = []; this.values = Object.create(null); this.error = '';
  }
  value(n: SceneNode) { return Object.hasOwn(this.values, n.id) ? this.values[n.id] : n.initialValue; }
  set(n: SceneNode, value: string) {
    if (!n.disabled && n.kind === 'input') this.values[n.id] = value.slice(0, 20000).replace(/[\r\n]/g, '');
  }
  activate(doc: SceneDocument, n: SceneNode) {
    this.error = '';
    if (n.disabled) return false;
    if (n.prototypeAction === 'closeOverlay') return this.closeOverlay();
    if (n.prototypeAction === 'back') return this.back();
    const target = doc.nodes.find(target => target.id === n.targetId && target.kind === 'artboard' && !target.hidden);
    if (!target) { this.error = 'This action has no available destination. Choose an artboard in the Prototype inspector.'; return false; }
    if (n.prototypeAction === 'openOverlay') {
      if (this.overlays.length >= 8) { this.error = 'Close an overlay before opening another (maximum eight).'; return false; }
      this.overlays.push(target.id);
    } else {
      if (this.currentId) this.history.push(this.currentId);
      if (this.history.length > 128) this.history.shift();
      this.currentId = target.id; this.overlays = [];
    }
    return true;
  }
  closeOverlay() { if (!this.overlays.length) return false; this.overlays.pop(); return true; }
  back() {
    if (this.overlays.length) return this.closeOverlay();
    const previous = this.history.pop(); if (!previous) return false;
    this.currentId = previous; return true;
  }
  reset(doc: SceneDocument) { if (this.rootId) this.start(doc, this.rootId); }
  reconcile(doc: SceneDocument) {
    if (doc.id !== this.documentId) { this.currentId = this.rootId = null; this.overlays = []; this.history = []; this.values = Object.create(null); return; }
    const boards = new Set(doc.nodes.filter(n => n.kind === 'artboard' && !n.hidden).map(n => n.id));
    if (!this.rootId || !boards.has(this.rootId)) {
      this.rootId = this.currentId = null; this.overlays = []; this.history = []; this.error = 'The starting artboard is no longer available.'; return;
    }
    if (!this.currentId || !boards.has(this.currentId)) { this.currentId = this.rootId; this.error = 'The destination was removed. Returned to the starting artboard.'; }
    const invalidOverlay = this.overlays.findIndex(id => !boards.has(id));
    if (invalidOverlay >= 0) { this.overlays.splice(invalidOverlay); this.error = 'An overlay destination was removed. The overlay has been closed.'; }
    this.history = this.history.filter(id => boards.has(id));
    const inputs = new Set(doc.nodes.filter(n => n.kind === 'input').map(n => n.id));
    for (const id of Object.keys(this.values)) if (!inputs.has(id)) delete this.values[id];
  }
}
