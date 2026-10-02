import { getStroke } from 'perfect-freehand';
import type { SceneNode } from '../model/schema';

export type DrawingKind = 'line' | 'arrow' | 'path' | 'freehand';
export interface DrawingPoint { x: number; y: number; pressure?: number }
export const MAX_DRAWING_POINTS = 1024;
export type DrawingGeometry = Pick<SceneNode, 'x' | 'y' | 'width' | 'height' | 'pathData' | 'viewBox' | 'fill' | 'fillEnabled' | 'stroke' | 'strokeWidth'>;
const number = (value: number) => String(Math.round(value * 10000) / 10000);

export function constrainedPoint(start: DrawingPoint, end: DrawingPoint): DrawingPoint {
  const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
  return { ...end, x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length };
}

/** Persist the actual pressure outline, not a dependency-specific stroke object.
 * Portable path nodes therefore retain the identical shape offline and after resize. */
export function drawingGeometry(kind: DrawingKind, points: readonly DrawingPoint[], size: number,
  color: string, finished = true, closed = false): DrawingGeometry | null {
  if (!points.length) return null;
  if (points.length > MAX_DRAWING_POINTS) throw Error(`Drawing is limited to ${MAX_DRAWING_POINTS} points. Finish this path and start another.`);
  if (!Number.isFinite(size) || size < 1 || size > 64 || !/^#[0-9a-f]{6}$/i.test(color)) throw Error('Choose a drawing width from 1–64 and a six-digit hex color.');
  for (const point of points) {
    if (![point.x, point.y].every(value => Number.isFinite(value) && Math.abs(value) <= 100000) ||
      (point.pressure !== undefined && (!Number.isFinite(point.pressure) || point.pressure < 0 || point.pressure > 1)))
      throw Error('Drawing points exceed document coordinate or pressure limits.');
  }
  let contours: DrawingPoint[][], fill = false, pad = size / 2 + 0.25;
  if (kind === 'freehand') {
    const outline = getStroke(points.map(point => [point.x, point.y, point.pressure ?? 0.5]), {
      size, thinning: 0.5, smoothing: 0.5, streamline: 0.5,
      simulatePressure: points.every(point => point.pressure === undefined), last: finished,
    }).map(([x, y]) => ({ x, y }));
    if (!outline.length) return null;
    contours = [outline]; fill = true; pad = 0.25;
  } else {
    if (points.length < 2) return null;
    const start = points[0], end = points.at(-1)!;
    if (kind !== 'path' && Math.hypot(end.x - start.x, end.y - start.y) < 0.001) return null;
    contours = [kind === 'path' ? [...points] : [start, end]];
    if (kind === 'arrow') {
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const head = Math.min(Math.max(10, size * 3), Math.hypot(end.x - start.x, end.y - start.y) * 0.45);
      contours.push([{
        x: end.x - Math.cos(angle - Math.PI / 6) * head, y: end.y - Math.sin(angle - Math.PI / 6) * head,
      }, end, {
        x: end.x - Math.cos(angle + Math.PI / 6) * head, y: end.y - Math.sin(angle + Math.PI / 6) * head,
      }]);
    }
  }
  const all = contours.flat(), minX = Math.min(...all.map(point => point.x)) - pad,
    minY = Math.min(...all.map(point => point.y)) - pad;
  const width = Math.max(1, Math.max(...all.map(point => point.x)) - minX + pad),
    height = Math.max(1, Math.max(...all.map(point => point.y)) - minY + pad);
  if (Math.abs(minX) > 100000 || Math.abs(minY) > 100000 || width > 100000 || height > 100000)
    throw Error('Drawing bounds exceed document coordinate limits.');
  const pathData = contours.map(contour => contour.map((point, index) =>
    `${index ? 'L' : 'M'}${number(point.x - minX)} ${number(point.y - minY)}`).join(' ')).join(' ') +
    (fill || (kind === 'path' && closed) ? ' Z' : '');
  if (pathData.length > 100000) throw Error('Drawing exceeds the portable path size limit.');
  return { x: minX, y: minY, width, height, viewBox: `0 0 ${number(width)} ${number(height)}`,
    pathData, fill: color, fillEnabled: fill, stroke: color, strokeWidth: fill ? 0 : size };
}
