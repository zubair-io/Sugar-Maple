import { Injectable, signal, computed } from "@angular/core";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { DocumentStore } from "./model/store";
import {
  blankDocument,
  NodeSchema,
  validateDocument,
  type SceneNode,
  type Operation,
} from "./model/schema";
import { flatten, project, type Item } from "./layout";
@Injectable({ providedIn: "root" })
export class SceneSession {
  store = new DocumentStore();
  readonly doc = signal(this.store.document);
  readonly page = signal("");
  readonly selected = signal<string[]>([]);
  readonly draft = signal<Record<string, Partial<SceneNode>>>({});
  readonly preview = signal(false);
  readonly renderer = signal<"canvas" | "dom">("canvas");
  readonly error = signal("");
  readonly values = signal<Record<string, string>>({});
  readonly stats = signal({ drawn: 0, total: 0, paintMs: 0, frames: 0 });
  readonly benchmark = signal("");
  readonly revision = signal(0);
  readonly displayDoc = computed(() => ({
    ...this.doc(),
    nodes: this.doc().nodes.map((n) => ({ ...n, ...this.draft()[n.id] })),
  }));
  readonly roots = computed(() => project(this.displayDoc(), this.page()));
  readonly items = computed(() => flatten(this.roots()));
  readonly selectedNode = computed(() =>
    this.doc().nodes.find((n) => n.id === this.selected()[0]),
  );
  readonly ydoc = new Y.Doc();
  readonly board = {
    ydoc: this.ydoc,
    awareness: new Awareness(this.ydoc),
    metadata: this.ydoc.getMap<unknown>("metadata"),
    layers: this.ydoc.getArray<Y.Map<unknown>>("layers"),
    elements: this.ydoc.getMap<Y.Map<unknown>>("elements"),
  };
  onRender = () => {};
  onNavigate = () => {};
  onInput = (item: Item) => {};
  onTextEdit = () => {};
  seed: any;
  async init() {
    this.seed = await (await fetch("seed.json")).json();
    this.replace(this.seed);
  }
  replace(value: any) {
    this.store = new DocumentStore(validateDocument(value.document ?? value));
    this.doc.set(this.store.document);
    this.page.set(this.store.document.pages[0].id);
    this.selected.set([]);
    this.preview.set(false);
    this.draft.set({});
    this.values.set({});
    this.revision.set(0);
    this.notify();
  }
  notify() {
    this.board.metadata.set("projection", crypto.randomUUID());
    this.onRender();
  }
  sync() {
    this.doc.set(this.store.document);
    this.revision.set(this.store.revision);
    this.draft.set({});
    this.notify();
  }
  command(operations: Operation[]) {
    try {
      const r = this.store.transact({
        documentId: this.doc().id,
        expectedRevision: this.store.revision,
        requestId: crypto.randomUUID(),
        operations,
      });
      this.sync();
      this.error.set("");
      return r;
    } catch (e) {
      this.error.set(String(e));
      return null;
    }
  }
  patch(patch: Partial<SceneNode>) {
    const n = this.selectedNode();
    if (
      n &&
      Object.entries(patch).some(([key, value]) => (n as any)[key] !== value)
    )
      this.command([{ type: "node.update", id: n.id, patch }]);
  }
  undo() {
    if (this.store.canUndo) {
      this.store.undo();
      this.sync();
    }
  }
  redo() {
    if (this.store.canRedo) {
      this.store.redo();
      this.sync();
    }
  }
  remove(ids: string[]) {
    const valid = ids.filter(
      (id) => !this.doc().nodes.find((n) => n.id === id)?.locked,
    );
    if (valid.length)
      this.command(valid.map((id) => ({ type: "node.remove" as const, id })));
    this.selected.set([]);
  }
  activate(i: Item) {
    if (i.node.kind === "input") {
      this.onInput(i);
      return;
    }
    const target = this.doc().nodes.find((n) => n.id === i.node.targetId);
    if (target) {
      this.page.set(target.pageId);
      this.notify();
      this.onNavigate();
    }
  }
  setPage(id: string) {
    this.page.set(id);
    this.selected.set([]);
    this.notify();
  }
  loadStress(count: number) {
    const columns = count > 1000 ? 40 : 20;
    const d = blankDocument();
    d.name = `${count.toLocaleString()} node fixture`;
    const p = d.pages[0].id;
    d.nodes.push(
      NodeSchema.parse({
        id: "stress-board",
        pageId: p,
        kind: "artboard",
        name: "Stress artboard",
        width: columns * 84 + 48,
        height: Math.ceil(count / columns) * 64 + 100,
        fill: "#f8fafc",
        padding: 0,
      }),
    );
    for (let i = 0; i < count; i++)
      d.nodes.push(
        NodeSchema.parse({
          id: `stress-${i}`,
          pageId: p,
          parentId: "stress-board",
          kind: i % 4 === 0 ? "text" : "button",
          name: `Tile ${i + 1}`,
          x: 24 + (i % columns) * 84,
          y: 24 + Math.floor(i / columns) * 64,
          width: 76,
          height: 52,
          text: String(i + 1),
          fontSize: 13,
          fill: i % 4 === 0 ? "#f8fafc" : i % 3 === 0 ? "#4f46e5" : "#e2e8f0",
          color: i % 3 === 0 && i % 4 !== 0 ? "#ffffff" : "#172033",
          radius: 8,
          order: i,
        }),
      );
    this.replace(d);
  }
}
