import { Injectable, inject } from "@angular/core";
import type { Camera } from "@maple/shared";
import { SceneSession } from "../../../../../session";
import { intersects, type Box, type Item } from "../../../../../layout";
// Sugar Maple Canvas2D renderer at the original Whiteboard CanvasComponent seam.
@Injectable()
export class RendererService {
  private s = inject(SceneSession);
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private images = new Map<string, HTMLImageElement>();
  private failures = new Set<string>();
  init(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d");
    this.resize(canvas.clientWidth, canvas.clientHeight);
  }
  resize(w: number, h: number) {
    if (!this.ctx) return;
    this.width = w;
    this.height = h;
    this.dpr = window.devicePixelRatio || 1;
    const c = this.ctx.canvas;
    c.width = Math.round(w * this.dpr);
    c.height = Math.round(h * this.dpr);
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
  clear() {
    this.ctx?.clearRect(0, 0, this.width, this.height);
  }
  render(
    _layers: unknown,
    _elements: unknown,
    camera: Camera,
    _tool: unknown,
    _ids: string[],
    ..._remote: unknown[]
  ) {
    const c = this.ctx;
    if (!c || this.s.renderer() === "dom") return;
    const t = performance.now();
    this.clear();
    c.save();
    c.translate(this.width / 2, this.height / 2);
    c.scale(camera.zoom, camera.zoom);
    c.translate(-camera.x - this.width / 2, -camera.y - this.height / 2);
    const view = {
      x: camera.x + this.width / 2 - this.width / (2 * camera.zoom),
      y: camera.y + this.height / 2 - this.height / (2 * camera.zoom),
      width: this.width / camera.zoom,
      height: this.height / camera.zoom,
    };
    let drawn = 0;
    const draw = (i: Item) => {
      if (!i.node.rotation && !intersects(i, view)) return;
      drawn++;
      c.save();
      if (i.node.rotation) {
        c.translate(i.x + i.width / 2, i.y + i.height / 2);
        c.rotate((i.node.rotation * Math.PI) / 180);
        c.translate(-i.x - i.width / 2, -i.y - i.height / 2);
      }
      c.globalAlpha *= i.node.opacity;
      this.paint(i);
      c.beginPath();
      c.roundRect(
        i.x,
        i.y,
        i.width,
        i.height,
        Math.min(i.node.radius, i.width / 2, i.height / 2),
      );
      c.clip();
      for (const child of i.children) draw(child);
      c.restore();
    };
    for (const root of this.s.roots()) draw(root);
    if (!this.s.preview()) {
      c.strokeStyle = "#6366f1";
      c.lineWidth = 1.5 / camera.zoom;
      for (const i of this.s
        .items()
        .filter((i) => this.s.selected().includes(i.node.id))) {
        c.strokeRect(i.x, i.y, i.width, i.height);
        c.fillStyle = "white";
        c.fillRect(
          i.x + i.width - 4 / camera.zoom,
          i.y + i.height - 4 / camera.zoom,
          8 / camera.zoom,
          8 / camera.zoom,
        );
        c.strokeRect(
          i.x + i.width - 4 / camera.zoom,
          i.y + i.height - 4 / camera.zoom,
          8 / camera.zoom,
          8 / camera.zoom,
        );
      }
    }
    c.restore();
    this.s.stats.set({
      drawn,
      total: this.s.items().length,
      paintMs: performance.now() - t,
      frames: this.s.stats().frames + 1,
    });
  }
  private paint(i: Item) {
    const c = this.ctx!,
      n = i.node;
    c.beginPath();
    if (n.kind === "ellipse")
      c.ellipse(
        i.x + i.width / 2,
        i.y + i.height / 2,
        i.width / 2,
        i.height / 2,
        0,
        0,
        Math.PI * 2,
      );
    else
      c.roundRect(
        i.x,
        i.y,
        i.width,
        i.height,
        Math.min(n.radius, i.width / 2, i.height / 2),
      );
    const fill = this.s.doc().tokens[n.fillToken] ?? n.fill;
    c.fillStyle = fill;
    if (n.gradient) {
      const g = n.gradient;
      let gradient: CanvasGradient;
      if (g.type === "linear") {
        const a = ((g.angle - 90) * Math.PI) / 180,
          dx = (Math.cos(a) * i.width) / 2,
          dy = (Math.sin(a) * i.height) / 2;
        gradient = c.createLinearGradient(
          i.x + i.width / 2 - dx,
          i.y + i.height / 2 - dy,
          i.x + i.width / 2 + dx,
          i.y + i.height / 2 + dy,
        );
      } else
        gradient = c.createRadialGradient(
          i.x + (i.width * g.centerX) / 100,
          i.y + (i.height * g.centerY) / 100,
          0,
          i.x + (i.width * g.centerX) / 100,
          i.y + (i.height * g.centerY) / 100,
          Math.max((i.width * g.radiusX) / 100, (i.height * g.radiusY) / 100),
        );
      for (const stop of g.stops)
        gradient.addColorStop(
          stop.offset,
          stop.color +
            Math.round(stop.opacity * 255)
              .toString(16)
              .padStart(2, "0"),
        );
      c.fillStyle = gradient;
    }
    if (n.fillEnabled && n.kind !== "path") c.fill();
    if (n.strokeWidth && n.kind !== "path") {
      c.strokeStyle = n.stroke;
      c.lineWidth = n.strokeWidth;
      c.stroke();
    }
    c.save();
    c.clip();
    if (["text", "button", "input"].includes(n.kind)) {
      c.fillStyle = n.color;
      c.font = `${n.fontWeight} ${n.fontSize}px system-ui, sans-serif`;
      c.textBaseline = "top";
      const text =
        n.kind === "input" ? (this.s.values()[n.id] ?? n.text) : n.text;
      const lines = this.wrap(
        text,
        Math.max(1, i.width - (n.kind === "input" ? 16 : 0)),
      );
      const lineH = n.fontSize * 1.2;
      let y =
        i.y + (n.kind === "text" ? 0 : (i.height - lines.length * lineH) / 2);
      for (const line of lines) {
        c.fillText(
          line,
          n.kind === "button"
            ? i.x + (i.width - c.measureText(line).width) / 2
            : i.x + (n.kind === "input" ? 8 : 0),
          y,
        );
        y += lineH;
      }
    }
    if (n.kind === "path") {
      const [vx, vy, vw, vh] = n.viewBox.split(" ").map(Number);
      c.save();
      c.translate(i.x, i.y);
      c.scale(i.width / vw, i.height / vh);
      c.translate(-vx, -vy);
      const path = new Path2D(n.pathData);
      if (n.fillEnabled) c.fill(path);
      if (n.strokeWidth) {
        c.strokeStyle = n.stroke;
        c.lineWidth = n.strokeWidth;
        c.stroke(path);
      }
      c.restore();
    }
    if (n.kind === "image") {
      let image = this.images.get(n.asset);
      if (!image) {
        image = new Image();
        this.images.set(n.asset, image);
        image.onload = () => this.s.notify();
        image.onerror = () => {
          this.failures.add(n.asset);
          this.s.notify();
        };
        image.src = n.asset;
      }
      if (image.complete && image.naturalWidth) {
        const scale = Math.max(
          i.width / image.naturalWidth,
          i.height / image.naturalHeight,
        );
        c.drawImage(
          image,
          i.x + (i.width - image.naturalWidth * scale) / 2,
          i.y + (i.height - image.naturalHeight * scale) / 2,
          image.naturalWidth * scale,
          image.naturalHeight * scale,
        );
      } else if (this.failures.has(n.asset)) {
        c.fillStyle = "#b91c1c";
        c.font = "12px system-ui";
        c.fillText("Image failed to decode", i.x + 8, i.y + 12);
      }
    }
    c.restore();
  }
  private wrap(text: string, width: number) {
    const c = this.ctx!,
      lines: string[] = [];
    for (const para of text.split("\n")) {
      if (!para) {
        lines.push("");
        continue;
      }
      let line = "";
      for (const word of para.split(/\s+/)) {
        const next = line ? line + " " + word : word;
        if (line && c.measureText(next).width > width) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
    }
    return lines;
  }
  screenToCanvas(x: number, y: number, camera: Camera, rect: DOMRect) {
    return {
      x:
        (x - rect.left - this.width / 2) / camera.zoom +
        camera.x +
        this.width / 2,
      y:
        (y - rect.top - this.height / 2) / camera.zoom +
        camera.y +
        this.height / 2,
    };
  }
  canvasToScreen(x: number, y: number, camera: Camera, rect: DOMRect) {
    return {
      x:
        (x - camera.x - this.width / 2) * camera.zoom +
        rect.left +
        this.width / 2,
      y:
        (y - camera.y - this.height / 2) * camera.zoom +
        rect.top +
        this.height / 2,
    };
  }
  getDimensions() {
    return { width: this.width, height: this.height };
  }
  destroy() {
    for (const i of this.images.values()) {
      i.onload = null;
      i.onerror = null;
    }
    this.images.clear();
    this.ctx = null;
  }
}
