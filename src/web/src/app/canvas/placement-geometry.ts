import type { SceneNode } from '../model/schema';
import { inverse, transform, type Box, type Item, type Matrix } from './scene-layout';
import {
  changedPatch,
  movePatch,
  handlePoint,
  resizeDirections,
  type ResizeHandle,
} from './transform-geometry';

export type Edge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type Axis = 'x' | 'y';
export interface Guide {
  axis: Axis;
  value: number;
  start: number;
  end: number;
}
interface Line {
  value: number;
  start: number;
  end: number;
  id: string;
}
export interface SnapIndex {
  x: Line[];
  y: Line[];
}
const identity: Matrix = [1, 0, 0, 1, 0, 0];
export function boxIn(item: Item, frame: Matrix = identity): Box {
  const points = [
    [item.x, item.y],
    [item.x + item.width, item.y],
    [item.x, item.y + item.height],
    [item.x + item.width, item.y + item.height],
  ].map(([x, y]) => {
    const p = transform(item.transform, x, y);
    return inverse(frame, p.x, p.y);
  });
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...points.map((p) => p.x)) - x,
    height: Math.max(...points.map((p) => p.y)) - y,
  };
}
export function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x)),
    y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
}
function patches(items: Item[], deltas: { x: number; y: number }[]) {
  const result: { id: string; patch: Partial<SceneNode> }[] = [];
  for (let k = 0; k < items.length; k++) {
    const item = items[k],
      delta = deltas[k],
      patch = movePatch(item, delta.x, delta.y),
      m = item.ancestors.at(-1)?.transform ?? identity;
    const dx = patch.x! - item.node.x,
      dy = patch.y! - item.node.y;
    if (
      Math.abs(m[0] * dx + m[2] * dy - delta.x) > 1e-6 ||
      Math.abs(m[1] * dx + m[3] * dy - delta.y) > 1e-6
    )
      return null;
    const changed = changedPatch(item.node, patch);
    if (Object.keys(changed).length) result.push({ id: item.node.id, patch: changed });
  }
  return result;
}
export function alignment(items: Item[], edge: Edge) {
  if (!items.length) return [];
  const parent = items.length === 1 ? items[0].ancestors.at(-1) : undefined;
  if (items.length === 1 && !parent) return [];
  const frame = parent?.transform ?? identity,
    boxes = items.map((i) => boxIn(i, frame));
  const reference = parent
    ? {
        x: parent.x + parent.node.strokeWidth,
        y: parent.y + parent.node.strokeWidth,
        width: Math.max(0, parent.width - 2 * parent.node.strokeWidth),
        height: Math.max(0, parent.height - 2 * parent.node.strokeWidth),
      }
    : union(boxes);
  const horizontal = ['left', 'center', 'right'].includes(edge),
    axis = horizontal ? 'x' : 'y',
    size = horizontal ? 'width' : 'height';
  const factor =
    edge === 'left' || edge === 'top' ? 0 : edge === 'right' || edge === 'bottom' ? 1 : 0.5;
  const target = reference[axis] + reference[size] * factor;
  return patches(
    items,
    boxes.map((b) => {
      const delta = target - b[axis] - b[size] * factor,
        dx = horizontal ? delta : 0,
        dy = horizontal ? 0 : delta;
      return { x: frame[0] * dx + frame[2] * dy, y: frame[1] * dx + frame[3] * dy };
    }),
  );
}
export function distribution(items: Item[], axis: Axis) {
  if (items.length < 3) return [];
  const size = axis === 'x' ? 'width' : 'height';
  const sorted = [...items].sort(
    (a, b) => a.bounds[axis] - b.bounds[axis] || a.node.id.localeCompare(b.node.id),
  );
  const first = sorted[0].bounds[axis],
    last = sorted.at(-1)!.bounds;
  const gap =
    (last[axis] + last[size] - first - sorted.reduce((sum, i) => sum + i.bounds[size], 0)) /
    (sorted.length - 1);
  let cursor = first;
  return patches(
    sorted,
    sorted.map((i) => {
      const delta = cursor - i.bounds[axis];
      cursor += i.bounds[size] + gap;
      return { x: axis === 'x' ? delta : 0, y: axis === 'y' ? delta : 0 };
    }),
  );
}
export function snapIndex(items: Item[]): SnapIndex {
  const index: SnapIndex = { x: [], y: [] };
  for (const i of items)
    for (const axis of ['x', 'y'] as const) {
      const b = i.bounds,
        size = axis === 'x' ? 'width' : 'height',
        other = axis === 'x' ? 'y' : 'x',
        otherSize = axis === 'x' ? 'height' : 'width';
      for (const factor of [0, 0.5, 1])
        index[axis].push({
          value: b[axis] + b[size] * factor,
          start: b[other],
          end: b[other] + b[otherSize],
          id: i.node.id,
        });
    }
  for (const axis of ['x', 'y'] as const)
    index[axis].sort((a, b) => a.value - b.value || a.id.localeCompare(b.id));
  return index;
}
function nearest(lines: Line[], value: number, threshold: number) {
  let lo = 0,
    hi = lines.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (lines[mid].value < value) lo = mid + 1;
    else hi = mid;
  }
  let best: Line | undefined;
  for (const k of [lo - 1, lo]) {
    const line = lines[k];
    if (
      line &&
      Math.abs(line.value - value) <= threshold &&
      (!best || Math.abs(line.value - value) < Math.abs(best.value - value))
    )
      best = line;
  }
  return best;
}
export function snapPoint(
  index: SnapIndex,
  point: { x: number; y: number },
  threshold: number,
  direction?: { x: number; y: number },
) {
  let delta = { x: 0, y: 0 };
  if (direction) {
    const length = Math.hypot(direction.x, direction.y),
      vector = { x: direction.x / length, y: direction.y / length };
    let best = Infinity;
    for (const axis of ['x', 'y'] as const)
      if (Math.abs(vector[axis]) > 1e-8) {
        const line = nearest(index[axis], point[axis], threshold * Math.abs(vector[axis]));
        if (line) {
          const scalar = (line.value - point[axis]) / vector[axis];
          if (Math.abs(scalar) < Math.abs(best)) best = scalar;
        }
      }
    if (Number.isFinite(best)) delta = { x: vector.x * best, y: vector.y * best };
  } else
    for (const axis of ['x', 'y'] as const) {
      const line = nearest(index[axis], point[axis], threshold);
      if (line) delta[axis] = line.value - point[axis];
    }
  const guides: Guide[] = [];
  for (const axis of ['x', 'y'] as const) {
    const line = nearest(index[axis], point[axis] + delta[axis], 1e-6);
    if (line)
      guides.push({
        axis,
        value: line.value,
        start: Math.min(
          line.start,
          point[axis === 'x' ? 'y' : 'x'] + delta[axis === 'x' ? 'y' : 'x'],
        ),
        end: Math.max(line.end, point[axis === 'x' ? 'y' : 'x'] + delta[axis === 'x' ? 'y' : 'x']),
      });
  }
  return { delta, guides };
}
export function snapMove(index: SnapIndex, box: Box, dx: number, dy: number, threshold: number) {
  const delta = { x: 0, y: 0 };
  const guides: Guide[] = [];
  for (const axis of ['x', 'y'] as const) {
    const shift = axis === 'x' ? dx : dy,
      size = axis === 'x' ? 'width' : 'height',
      other = axis === 'x' ? 'y' : 'x',
      otherSize = axis === 'x' ? 'height' : 'width';
    let best: { line: Line; delta: number } | undefined;
    for (const factor of [0, 0.5, 1]) {
      const value = box[axis] + shift + box[size] * factor,
        line = nearest(index[axis], value, threshold);
      if (line && (!best || Math.abs(line.value - value) < Math.abs(best.delta)))
        best = { line, delta: line.value - value };
    }
    if (best) {
      delta[axis] = best.delta;
      guides.push({
        axis,
        value: best.line.value,
        start: Math.min(best.line.start, box[other] + (other === 'x' ? dx : dy)),
        end: Math.max(best.line.end, box[other] + (other === 'x' ? dx : dy) + box[otherSize]),
      });
    }
  }
  return { delta, guides };
}
export function resizePoint(item: Item, handle: ResizeHandle, patch: Partial<SceneNode>) {
  const point = handlePoint(item, handle, 1),
    [nx, ny] = resizeDirections[handle],
    m = item.transform;
  const dw = (patch.width ?? item.width) - item.width,
    dh = (patch.height ?? item.height) - item.height;
  return {
    x: point.x + m[0] * nx * dw + m[2] * ny * dh,
    y: point.y + m[1] * nx * dw + m[3] * ny * dh,
  };
}
export function resizeDirection(item: Item, handle: ResizeHandle, proportional: boolean) {
  const [nx, ny] = resizeDirections[handle],
    m = item.transform;
  if (nx && ny && !proportional) return undefined;
  const x = nx * (proportional ? item.width : 1),
    y = ny * (proportional ? item.height : 1);
  return { x: m[0] * x + m[2] * y, y: m[1] * x + m[3] * y };
}
