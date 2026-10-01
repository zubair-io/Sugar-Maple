import { bootstrapApplication } from "@angular/platform-browser";
import {
  Component,
  ViewChild,
  ElementRef,
  inject,
  signal,
  computed,
  HostListener,
  AfterViewInit,
} from "@angular/core";
import { NgStyle } from "@angular/common";
import { CanvasComponent } from "./vendor/whiteboard/core/components/canvas/canvas.component";
import { WHITEBOARD_USER_PROVIDER } from "./vendor/whiteboard/collaboration/tokens";
import { SceneNodeView } from "./dom/scene-node";
import { SceneSession } from "./session";
import { UITool } from "./ui-tool";
import type { SceneNode } from "./model/schema";
import type { Item } from "./layout";
@Component({
  selector: "canvas-lab",
  standalone: true,
  imports: [CanvasComponent, SceneNodeView, NgStyle],
  templateUrl: "./app.html",
  styleUrl: "./app.scss",
  providers: [
    {
      provide: WHITEBOARD_USER_PROVIDER,
      useValue: { user: signal({ _id: "local-poc" }) },
    },
  ],
})
class CanvasLab implements AfterViewInit {
  readonly s = inject(SceneSession);
  readonly tool = new UITool(this.s);
  @ViewChild(CanvasComponent) canvas!: CanvasComponent;
  @ViewChild("viewport") viewport!: ElementRef<HTMLElement>;
  @ViewChild("textEditor") editor?: ElementRef<HTMLTextAreaElement>;
  readonly camera = signal({ x: 0, y: 0, zoom: 1 });
  readonly size = signal({ width: 900, height: 680 });
  readonly layerSearch = signal("");
  readonly visibleLayers = computed(() =>
    this.s
      .items()
      .filter((i) =>
        i.node.name.toLowerCase().includes(this.layerSearch().toLowerCase()),
      )
      .slice(0, 200),
  );
  readonly ready = signal(false);
  readonly inputItem = signal<Item | null>(null);
  readonly running = signal(false);
  readonly domTransform = computed(() => {
    const { x, y, zoom } = this.camera(),
      { width, height } = this.size();
    return `translate(${width / 2}px,${height / 2}px) scale(${zoom}) translate(${-x - width / 2}px,${-y - height / 2}px)`;
  });
  readonly overlayStyle = computed(() => {
    const i = this.inputItem();
    if (!i) return {};
    const { x, y, zoom } = this.camera(),
      { width, height } = this.size();
    return {
      left: `${(i.x - x - width / 2) * zoom + width / 2}px`,
      top: `${(i.y - y - height / 2) * zoom + height / 2}px`,
      width: `${i.width * zoom}px`,
      height: `${i.height * zoom}px`,
      fontSize: `${i.node.fontSize * zoom}px`,
    };
  });
  async ngAfterViewInit() {
    this.s.onRender = () => this.canvas.requestRender();
    this.s.onNavigate = () => this.fit();
    this.s.onTextEdit = () => this.editor?.nativeElement.focus();
    this.s.onInput = (i) => {
      this.inputItem.set(i);
      setTimeout(() =>
        this.viewport.nativeElement
          .querySelector<HTMLInputElement>(".live-input")
          ?.focus(),
      );
    };
    await this.s.init();
    this.ready.set(true);
    this.fit();
  }
  resize(size: { width: number; height: number }) {
    if (size.width && size.height) this.size.set(size);
  }
  fit() {
    const items = this.s.roots();
    if (!items.length) return;
    const minX = Math.min(...items.map((i) => i.x)),
      minY = Math.min(...items.map((i) => i.y)),
      maxX = Math.max(...items.map((i) => i.x + i.width)),
      maxY = Math.max(...items.map((i) => i.y + i.height));
    const { width, height } = this.size();
    const zoom = Math.min(
      1,
      Math.max(
        0.1,
        Math.min((width - 100) / (maxX - minX), (height - 100) / (maxY - minY)),
      ),
    );
    this.setCamera({
      x: (minX + maxX) / 2 - width / 2,
      y: (minY + maxY) / 2 - height / 2,
      zoom,
    });
  }
  setCamera(c: { x: number; y: number; zoom: number }) {
    this.canvas.camera.set(c);
    this.camera.set(c);
    this.canvas.requestRender();
  }
  zoom(f: number) {
    this.setCamera({
      ...this.camera(),
      zoom: Math.min(4, Math.max(0.1, this.camera().zoom * f)),
    });
  }
  page(id: string) {
    this.s.setPage(id);
    this.inputItem.set(null);
    this.fit();
  }
  choose(n: SceneNode) {
    this.s.selected.set([n.id]);
    this.canvas.selectedIds.set([n.id]);
    this.canvas.requestRender();
  }
  pick(v: { event: PointerEvent; node: SceneNode }) {
    v.event.stopPropagation();
    this.canvas.onPointerDown(v.event);
  }
  activate(n: SceneNode) {
    const i = this.s.items().find((i) => i.node.id === n.id);
    if (i) this.s.activate(i);
  }
  patch(key: string, value: any) {
    this.s.patch({ [key]: value });
  }
  inputValue(value: string) {
    const i = this.inputItem();
    if (i) {
      this.s.values.update((v) => ({ ...v, [i.node.id]: value }));
      this.s.notify();
    }
  }
  mode(preview: boolean) {
    this.s.preview.set(preview);
    this.inputItem.set(null);
    this.s.notify();
  }
  renderer(mode: "canvas" | "dom") {
    this.s.renderer.set(mode);
    this.s.notify();
  }
  stress(count: number) {
    this.s.loadStress(count);
    this.setCamera({ x: 0, y: 0, zoom: 1 });
  }
  reset() {
    this.s.replace(this.s.seed);
    this.s.benchmark.set("");
    this.inputItem.set(null);
    this.fit();
  }
  async benchmark() {
    this.running.set(true);
    const mode = this.s.renderer(),
      samples: number[] = [],
      cpu: number[] = [];
    for (let i = 0; i < 70; i++) {
      const c = this.camera(),
        start = performance.now();
      this.setCamera({ ...c, x: c.x + (i % 2 ? 2 : -2) });
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      if (i >= 10) {
        samples.push(performance.now() - start);
        if (mode === "canvas") cpu.push(this.s.stats().paintMs);
      }
    }
    samples.sort((a, b) => a - b);
    cpu.sort((a, b) => a - b);
    this.s.benchmark.set(
      `${mode === "canvas" ? "Canvas" : "DOM"} pan settle (2 rAF) · median ${samples[30].toFixed(2)} ms · p95 ${samples[57].toFixed(2)} ms · 60 samples${cpu.length ? ` · Canvas draw CPU median ${cpu[30].toFixed(2)} ms / p95 ${cpu[57].toFixed(2)} ms` : ""}. Includes a two-frame wait; not an FPS result.`,
    );
    this.running.set(false);
  }
  download(name: string, value: string, type: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([value], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  exportJSON() {
    this.download(
      "canvas-poc-checkpoint.json",
      JSON.stringify(this.s.store.checkpoint(), null, 2),
      "application/json",
    );
  }
  exportPNG() {
    const c = this.viewport.nativeElement.querySelector("canvas");
    if (c) {
      const a = document.createElement("a");
      a.download = "canvas-poc-viewport.png";
      a.href = c.toDataURL("image/png");
      a.click();
    }
  }
  async importFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      this.s.replace(JSON.parse(await file.text()));
      this.fit();
      this.s.error.set("");
    } catch (e) {
      this.s.error.set(`Import failed: ${e}`);
    }
  }
  @HostListener("document:keydown", ["$event"]) key(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? this.s.redo() : this.s.undo();
    }
    if (e.key.toLowerCase() === "f" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      this.fit();
    }
  }
}
bootstrapApplication(CanvasLab).catch(console.error);
