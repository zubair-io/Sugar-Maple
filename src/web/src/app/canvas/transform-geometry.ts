import type { SceneNode } from '../model/schema';
import { transform, type Item, type Matrix } from './scene-layout';

export const resizeDirections = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
} as const;
export type ResizeHandle = keyof typeof resizeDirections;
export type TransformHandle = ResizeHandle | 'rotate';
const identity: Matrix = [1, 0, 0, 1, 0, 0];
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function inverseVector(m: Matrix, dx: number, dy: number) {
  const determinant = m[0] * m[3] - m[1] * m[2];
  return { x: (m[3] * dx - m[2] * dy) / determinant, y: (-m[1] * dx + m[0] * dy) / determinant };
}
export function editableItem(item: Item) {
  return ![item, ...item.ancestors].some((i) => i.node.locked || i.node.hidden);
}
export function handlePoint(item: Item, handle: TransformHandle, zoom: number) {
  const [nx, ny] = handle === 'rotate' ? [0, -1] : resizeDirections[handle];
  const point = transform(
    item.transform,
    item.x + ((nx + 1) * item.width) / 2,
    item.y + ((ny + 1) * item.height) / 2,
  );
  return handle === 'rotate'
    ? { x: point.x - (item.transform[2] * 28) / zoom, y: point.y - (item.transform[3] * 28) / zoom }
    : point;
}
export function handleCursor(item: Item, handle: TransformHandle) {
  if (handle === 'rotate') return 'grab';
  const [nx, ny] = resizeDirections[handle];
  const angle = Math.atan2(
    item.transform[1] * nx + item.transform[3] * ny,
    item.transform[0] * nx + item.transform[2] * ny,
  );
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][
    ((Math.round(angle / (Math.PI / 4)) % 4) + 4) % 4
  ];
}
export function movePatch(item: Item, dx: number, dy: number): Partial<SceneNode> {
  const delta = inverseVector(item.ancestors.at(-1)?.transform ?? identity, dx, dy);
  return {
    x: clamp(item.node.x + delta.x, -100000, 100000),
    y: clamp(item.node.y + delta.y, -100000, 100000),
  };
}
export function resizePatch(
  item: Item,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  proportional = false,
): Partial<SceneNode> {
  const [nx, ny] = resizeDirections[handle],
    delta = inverseVector(item.transform, dx, dy);
  let width = nx ? clamp(item.width + nx * delta.x, 1, 10000) : item.width;
  let height = ny ? clamp(item.height + ny * delta.y, 1, 10000) : item.height;
  if (proportional) {
    const sx = width / item.width,
      sy = height / item.height;
    const scale = clamp(
      !nx ? sy : !ny ? sx : Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy,
      Math.max(1 / item.width, 1 / item.height),
      Math.min(10000 / item.width, 10000 / item.height),
    );
    width = item.width * scale;
    height = item.height * scale;
  }
  const dw = width - item.width,
    dh = height - item.height;
  const r = (item.node.rotation * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r);
  // Rotation is about the box center. Move that center in the node's rotated
  // axes so the opposite corner/edge remains fixed in world coordinates.
  const x = item.node.x + (c * nx * dw) / 2 - (s * ny * dh) / 2 - dw / 2;
  const y = item.node.y + (s * nx * dw) / 2 + (c * ny * dh) / 2 - dh / 2;
  if (![x, y, width, height].every(Number.isFinite) || Math.abs(x) > 100000 || Math.abs(y) > 100000)
    return {};
  return { x, y, width, height };
}
export function angleAt(item: Item, x: number, y: number) {
  const center = transform(item.transform, item.x + item.width / 2, item.y + item.height / 2);
  return (Math.atan2(y - center.y, x - center.x) * 180) / Math.PI;
}
export function angleDelta(previous: number, next: number) {
  return ((next - previous + 540) % 360) - 180;
}
export function rotationPatch(item: Item, delta: number, snap = false): Partial<SceneNode> {
  const rotation = item.node.rotation + delta;
  return { rotation: clamp(snap ? Math.round(rotation / 15) * 15 : rotation, -100000, 100000) };
}
export function changedPatch(node: SceneNode, patch: Partial<SceneNode>): Partial<SceneNode> {
  return Object.fromEntries(
    Object.entries(patch).filter(([key, value]) => {
      const old = node[key as keyof SceneNode];
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        typeof old === 'number' &&
        Math.abs(value - old) > 1e-8
      );
    }),
  );
}
