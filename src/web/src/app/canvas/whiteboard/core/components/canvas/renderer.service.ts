import { assetSource } from '../../../../../model/assets';
import { inputDisplay } from '../../../../../model/form';
import { applyCanvasFont, textAlignment } from '../../../../../model/typography';
import { Injectable, inject } from '@angular/core';
import type { Camera } from '../../../shared-types';
import { CanvasProjection } from '../../../../canvas-projection';
import { intersects, wrapText, type Box, type Item } from '../../../../scene-layout';
import type { Guide } from '../../../../placement-geometry';
// Sugar Maple Canvas2D renderer at the original Whiteboard CanvasComponent seam.
@Injectable()
export class RendererService {
  private s = inject(CanvasProjection);
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  init(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
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
    if (!c) return;
    if (this.dpr !== (window.devicePixelRatio || 1)) this.resize(this.width, this.height);
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
      if (!intersects(i.bounds, view)) return;
      drawn++;
      c.save();
      if (i.node.rotation) {
        c.translate(i.x + i.width / 2, i.y + i.height / 2);
        c.rotate((i.node.rotation * Math.PI) / 180);
        c.translate(-i.x - i.width / 2, -i.y - i.height / 2);
      }
      c.globalAlpha *= i.node.opacity;
      this.paint(i);
      this.outline(i);
      c.clip();
      for (const child of i.children) draw(child);
      c.restore();
    };
    for (const root of this.s.roots()) draw(root);
    c.fillStyle = '#aca6a0';
    c.font = `${12 / camera.zoom}px system-ui`;
    c.textBaseline = 'bottom';
    for (const root of this.s.roots())
      if (root.node.kind === 'artboard' && intersects(root.bounds, view))
        c.fillText(
          `${root.node.name}   ${Math.round(root.width)} × ${Math.round(root.height)}`,
          root.x,
          root.y - 8 / camera.zoom,
        );
    {
      c.strokeStyle = '#6366f1';
      c.lineWidth = 1.5 / camera.zoom;
      for (const i of this.s.items().filter((i) => this.s.e.selection().includes(i.node.id))) {
        c.save();
        c.transform(...i.transform);
        c.strokeRect(i.x, i.y, i.width, i.height);
        if (
          this.s.e.selection().length === 1 &&
          this.s.e.mode() === 'Design' &&
          this.s.canRotate(i.node)
        ) {
          c.beginPath();
          c.moveTo(i.x + i.width / 2, i.y);
          c.lineTo(i.x + i.width / 2, i.y - 28 / camera.zoom);
          c.stroke();
        }
        c.restore();
      }
    }
    const box = (_tool as { selectionBox?: Box })?.selectionBox;
    if (box) {
      c.fillStyle = '#3b82f620';
      c.strokeStyle = '#60a5fa';
      c.lineWidth = 1 / camera.zoom;
      c.fillRect(box.x, box.y, box.width, box.height);
      c.strokeRect(box.x, box.y, box.width, box.height);
    }
    c.strokeStyle='#ec4899';c.lineWidth=1/camera.zoom;c.setLineDash([4/camera.zoom,4/camera.zoom]);
    for(const guide of this.s.snapping() ? ((_tool as {snapGuides?:Guide[]})?.snapGuides??[]) : []) {
      c.beginPath();
      if(guide.axis==='x'){c.moveTo(guide.value,guide.start-8/camera.zoom);c.lineTo(guide.value,guide.end+8/camera.zoom);}
      else {c.moveTo(guide.start-8/camera.zoom,guide.value);c.lineTo(guide.end+8/camera.zoom,guide.value);}
      c.stroke();
    }
    c.restore();
    this.s.stats.set({
      drawn,
      total: this.s.items().length,
      paintMs: performance.now() - t,
      frames: this.s.stats().frames + 1,
    });
  }
  private outline(i: Item, inset = 0) {
    const c = this.ctx!,
      w = Math.max(0, i.width - 2 * inset),
      h = Math.max(0, i.height - 2 * inset);
    c.beginPath();
    if (i.node.kind === 'ellipse')
      c.ellipse(i.x + i.width / 2, i.y + i.height / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    else
      c.roundRect(
        i.x + inset,
        i.y + inset,
        w,
        h,
        Math.max(0, Math.min(i.node.radius - inset, w / 2, h / 2)),
      );
  }
  private paint(i: Item) {
    const c = this.ctx!,
      n = i.node;
    c.beginPath();
    if (n.kind === 'ellipse')
      c.ellipse(
        i.x + i.width / 2,
        i.y + i.height / 2,
        i.width / 2,
        i.height / 2,
        0,
        0,
        Math.PI * 2,
      );
    else c.roundRect(i.x, i.y, i.width, i.height, Math.min(n.radius, i.width / 2, i.height / 2));
    const fill = this.s.document().tokens[n.fillToken] ?? n.fill;
    c.fillStyle = fill;
    if (n.gradient) {
      c.save();
      const g = n.gradient;
      let gradient: CanvasGradient;
      if (g.type === 'linear') {
        const a = (g.angle * Math.PI) / 180,
          extent = (Math.abs(i.width * Math.sin(a)) + Math.abs(i.height * Math.cos(a))) / 2,
          dx = Math.sin(a) * extent,
          dy = -Math.cos(a) * extent;
        gradient = c.createLinearGradient(
          i.x + i.width / 2 - dx,
          i.y + i.height / 2 - dy,
          i.x + i.width / 2 + dx,
          i.y + i.height / 2 + dy,
        );
      } else {
        c.translate(i.x + (i.width * g.centerX) / 100, i.y + (i.height * g.centerY) / 100);
        c.scale((i.width * g.radiusX) / 100, (i.height * g.radiusY) / 100);
        gradient = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      }
      for (const stop of g.stops)
        gradient.addColorStop(
          stop.offset,
          stop.color +
            Math.round(stop.opacity * 255)
              .toString(16)
              .padStart(2, '0'),
        );
      c.fillStyle = gradient;
    }
    if (n.fillEnabled && n.kind !== 'path') c.fill();
    if (n.gradient) c.restore();
    if (n.strokeWidth && n.kind !== 'path') {
      this.outline(i, n.strokeWidth / 2);
      c.strokeStyle = n.stroke;
      c.lineWidth = n.strokeWidth;
      c.stroke();
    }
    this.outline(i);
    c.save();
    c.clip();
    if (['text', 'button', 'input'].includes(n.kind)) {
      c.fillStyle = n.disabled ? '#71717a' : n.color;
      applyCanvasFont(c, n);
      c.textBaseline = 'alphabetic';
      const text = n.kind === 'input' ? inputDisplay(n) : n.text;
      const lines = n.kind === 'input' ? [text] : this.wrap(
        text,
        Math.max(1, i.width - n.strokeWidth * 2),
      );
      const lineH = n.fontSize * n.lineHeight;
      let y = i.y + (n.kind === 'text' ? n.strokeWidth : (i.height - lines.length * lineH) / 2);
      const metrics = c.measureText('Mg');
      y +=
        (lineH +
          (metrics.fontBoundingBoxAscent ?? n.fontSize * 0.8) -
          (metrics.fontBoundingBoxDescent ?? n.fontSize * 0.2)) /
        2;
      for (const line of lines) {
        c.fillText(
          line,
          textAlignment(n) === 'center'
            ? i.x + (i.width - c.measureText(line).width) / 2
            : textAlignment(n) === 'right'
              ? i.x + i.width - n.strokeWidth - (n.kind === 'input' ? 8 : 0) - c.measureText(line).width
              : i.x + n.strokeWidth + (n.kind === 'input' ? 8 : 0),
          y,
        );
        y += lineH;
      }
    }
    if (n.kind === 'path') {
      const [vx, vy, vw, vh] = n.viewBox.split(' ').map(Number);
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
    if (n.kind === 'image') {
      const asset = this.s.assets.get(assetSource(this.s.document(), n.asset)),
        image = asset.image;
      if (asset.state === 'ready') {
        const scale = Math.max(i.width / image.naturalWidth, i.height / image.naturalHeight);
        c.drawImage(
          image,
          i.x + (i.width - image.naturalWidth * scale) / 2,
          i.y + (i.height - image.naturalHeight * scale) / 2,
          image.naturalWidth * scale,
          image.naturalHeight * scale,
        );
      } else if (asset.state === 'error') {
        c.fillStyle = '#fee2e2';
        c.fillRect(i.x, i.y, i.width, i.height);
        c.fillStyle = '#991b1b';
        c.font = '12px system-ui';
        c.fillText('Image unavailable: reimport ' + n.name, i.x + 8, i.y + 20);
      }
    }
    c.restore();
  }
  private wrap(text: string, width: number) {
    return wrapText(text, width, (t) => this.ctx!.measureText(t).width);
  }
  screenToCanvas(x: number, y: number, camera: Camera, rect: DOMRect) {
    return {
      x: (x - rect.left - this.width / 2) / camera.zoom + camera.x + this.width / 2,
      y: (y - rect.top - this.height / 2) / camera.zoom + camera.y + this.height / 2,
    };
  }
  canvasToScreen(x: number, y: number, camera: Camera, rect: DOMRect) {
    return {
      x: (x - camera.x - this.width / 2) * camera.zoom + rect.left + this.width / 2,
      y: (y - camera.y - this.height / 2) * camera.zoom + rect.top + this.height / 2,
    };
  }
  getDimensions() {
    return { width: this.width, height: this.height };
  }
  destroy() {
    this.ctx = null;
  }
}
