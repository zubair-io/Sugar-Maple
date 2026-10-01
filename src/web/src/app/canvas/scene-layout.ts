import type { SceneDocument, SceneNode } from '../model/schema';
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type Matrix = readonly [number, number, number, number, number, number];
const identity: Matrix = [1, 0, 0, 1, 0, 0];
export interface Item extends Box {
  node: SceneNode;
  children: Item[];
  ancestors: Item[];
  transform: Matrix;
  bounds: Box;
  depth: number;
}
export const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
export const contains = (b: Box, x: number, y: number) =>
  x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
export function transform(m: Matrix, x: number, y: number) {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}
export function inverse(m: Matrix, x: number, y: number) {
  const d = m[0] * m[3] - m[1] * m[2],
    dx = x - m[4],
    dy = y - m[5];
  return { x: (m[3] * dx - m[2] * dy) / d, y: (-m[1] * dx + m[0] * dy) / d };
}
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
function rotated(parent: Matrix, box: Box, degrees: number): Matrix {
  const r = (degrees * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r),
    x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  return multiply(parent, [c, s, -s, c, x - c * x + s * y, y - s * x - c * y]);
}
function bounds(box: Box, m: Matrix): Box {
  const p = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ].map(([x, y]) => transform(m, x, y));
  const x = Math.min(...p.map((v) => v.x)),
    y = Math.min(...p.map((v) => v.y));
  return {
    x,
    y,
    width: Math.max(...p.map((v) => v.x)) - x,
    height: Math.max(...p.map((v) => v.y)) - y,
  };
}
export type Measure = (text: string, node: SceneNode) => number;
export function wrapText(text: string, width: number, measure: (text: string) => number): string[] {
  const lines: string[] = [],
    segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const { segment } of segmenter.segment(paragraph)) {
      if (line && segment.trim() && measure(line + segment) > width) {
        lines.push(line);
        line = segment;
      } else line += segment;
    }
    lines.push(line);
  }
  return lines;
}
export function project(
  doc: SceneDocument,
  page: string,
  measure: Measure = (t, n) => t.length * n.fontSize * 0.55,
  viewport = { width: 1000, height: 800 },
): Item[] {
  const children = new Map<string | null, SceneNode[]>();
  for (const n of doc.nodes)
    if (n.pageId === page && !n.hidden) {
      const list = children.get(n.parentId) ?? [];
      list.push(n);
      children.set(n.parentId, list);
    }
  for (const list of children.values()) list.sort((a, b) => a.order - b.order);
  const padding = (n: SceneNode) =>
    ['frame', 'artboard'].includes(n.kind) ? n.padding : n.kind === 'input' ? 8 : 0;
  const intrinsic = (n: SceneNode, axis: 'width' | 'height', width = n.width): number => {
    const cs = children.get(n.id) ?? [],
      pad = padding(n) + n.strokeWidth;
    if (['text', 'button', 'input'].includes(n.kind)) {
      if (axis === 'width')
        return Math.max(1, ...n.text.split('\n').map((t) => measure(t, n))) + 2 * pad;
      return (
        wrapText(n.text, Math.max(1, width - 2 * pad), (t) => measure(t, n)).length *
          n.fontSize *
          n.lineHeight +
        2 * pad
      );
    }
    if (!cs.length) return 2 * pad;
    const value = (c: SceneNode) =>
      c[axis === 'width' ? 'widthMode' : 'heightMode'] === 'hug' ? intrinsic(c, axis) : c[axis];
    if (
      (axis === 'width' && n.layout === 'horizontal') ||
      (axis === 'height' && n.layout === 'vertical')
    )
      return cs.reduce((sum, c) => sum + value(c), 0) + n.gap * (cs.length - 1) + 2 * pad;
    if (n.layout === 'grid') {
      if (axis === 'width')
        return Math.max(...cs.map(value)) * n.columns + n.gap * (n.columns - 1) + 2 * pad;
      let height = 0;
      for (let i = 0; i < cs.length; i += n.columns)
        height += Math.max(...cs.slice(i, i + n.columns).map(value));
      return height + n.gap * (Math.ceil(cs.length / n.columns) - 1) + 2 * pad;
    }
    return n.layout === 'free' ? 2 * pad : Math.max(...cs.map(value)) + 2 * pad;
  };
  const size = (n: SceneNode, axis: 'width' | 'height', available: number, width = n.width) => {
    const mode = n[axis === 'width' ? 'widthMode' : 'heightMode'];
    return Math.max(
      0,
      mode === 'fill'
        ? available
        : mode === 'percent'
          ? (available * n[axis === 'width' ? 'widthPercent' : 'heightPercent']) / 100
          : mode === 'hug'
            ? intrinsic(n, axis, width)
            : n[axis],
    );
  };
  const walk = (n: SceneNode, b: Box, ancestors: Item[], depth: number): Item => {
    const m = rotated(ancestors.at(-1)?.transform ?? identity, b, n.rotation);
    const item: Item = {
      ...b,
      node: n,
      children: [],
      ancestors,
      transform: m,
      bounds: bounds(b, m),
      depth,
    };
    const cs = children.get(n.id) ?? [],
      border = n.strokeWidth,
      pad = padding(n) + border;
    const iw = Math.max(0, b.width - 2 * (n.layout === 'free' ? border : pad)),
      ih = Math.max(0, b.height - 2 * (n.layout === 'free' ? border : pad));
    const horizontal = n.layout === 'horizontal',
      vertical = n.layout === 'vertical',
      axis = horizontal ? 'width' : 'height';
    const isFill = (c: SceneNode) => c[axis === 'width' ? 'widthMode' : 'heightMode'] === 'fill';
    const fixed = cs.reduce(
        (sum, c) => sum + (isFill(c) ? 0 : size(c, axis, horizontal ? iw : ih, size(c, 'width', iw))),
        0,
      ),
      count = cs.filter(isFill).length;
    const share = Math.max(
      0,
      ((horizontal ? iw : ih) - fixed - n.gap * Math.max(0, cs.length - 1)) / Math.max(1, count),
    );
    const cell = Math.max(0, (iw - n.gap * (n.columns - 1)) / n.columns),
      rowCount = Math.ceil(cs.length / n.columns),
      rowHeights: number[] = [];
    if (n.layout === 'grid') {
      for (let row = 0; row < rowCount; row++)
        rowHeights.push(
          Math.max(
            0,
            ...cs
              .slice(row * n.columns, (row + 1) * n.columns)
              .map((c) => size(c, 'height', 0, size(c, 'width', cell))),
          ),
        );
      const extra =
        Math.max(
          0,
          ih - rowHeights.reduce((a, b) => a + b, 0) - n.gap * Math.max(0, rowCount - 1),
        ) / Math.max(1, rowCount);
      rowHeights.forEach((h, i) => (rowHeights[i] = h + extra));
    }
    let cursor = 0;
    item.children = cs.map((c, i) => {
      let w = size(c, 'width', iw),
        h = size(c, 'height', ih, w),
        x = b.x + c.x + border,
        y = b.y + c.y + border;
      if (horizontal || vertical) {
        if (horizontal && c.widthMode === 'fill') w = share;
        if (vertical && c.heightMode === 'fill') h = share;
        if (c.heightMode === 'hug') h = size(c, 'height', ih, w);
        x = b.x + pad + (horizontal ? cursor : 0);
        y = b.y + pad + (vertical ? cursor : 0);
        cursor += (horizontal ? w : h) + n.gap;
      }
      if (n.layout === 'grid') {
        const row = Math.floor(i / n.columns);
        w = size(c, 'width', cell);
        h = size(c, 'height', rowHeights[row], w);
        x = b.x + pad + (i % n.columns) * (cell + n.gap);
        y = b.y + pad + rowHeights.slice(0, row).reduce((a, b) => a + b, 0) + row * n.gap;
      }
      return walk(c, { x, y, width: w, height: h }, [...ancestors, item], depth + 1);
    });
    return item;
  };
  return (children.get(null) ?? []).map((n) => {
    const width = size(n, 'width', viewport.width);
    return walk(
      n,
      { x: n.x, y: n.y, width, height: size(n, 'height', viewport.height, width) },
      [],
      0,
    );
  });
}
export const flatten = (roots: Item[]): Item[] => roots.flatMap((i) => [i, ...flatten(i.children)]);
function inside(item: Item, x: number, y: number) {
  const p = inverse(item.transform, x, y);
  if (!contains(item, p.x, p.y)) return false;
  if (item.node.kind === 'ellipse')
    return (
      ((p.x - item.x - item.width / 2) / (item.width / 2)) ** 2 +
        ((p.y - item.y - item.height / 2) / (item.height / 2)) ** 2 <=
      1
    );
  const r = Math.min(item.node.radius, item.width / 2, item.height / 2);
  if (!r) return true;
  const cx = Math.max(item.x + r, Math.min(item.x + item.width - r, p.x)),
    cy = Math.max(item.y + r, Math.min(item.y + item.height - r, p.y));
  return (p.x - cx) ** 2 + (p.y - cy) ** 2 <= r * r;
}
export function hit(items: Item[], x: number, y: number): Item | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (!item.node.locked && inside(item, x, y) && item.ancestors.every((a) => inside(a, x, y)))
      return item;
  }
  return undefined;
}
