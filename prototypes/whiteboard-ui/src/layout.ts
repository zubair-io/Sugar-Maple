import type { SceneDocument, SceneNode } from "./model/schema";
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Item extends Box {
  node: SceneNode;
  children: Item[];
  ancestors: Box[];
  depth: number;
}
export const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;
export const contains = (b: Box, x: number, y: number) =>
  x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
export function project(
  doc: SceneDocument,
  page: string,
  measure = (text: string, size: number) => text.length * size * 0.55,
): Item[] {
  const children = new Map<string | null, SceneNode[]>();
  for (const n of doc.nodes.filter((n) => n.pageId === page && !n.hidden)) {
    const a = children.get(n.parentId) || [];
    a.push(n);
    children.set(n.parentId, a);
  }
  for (const a of children.values()) a.sort((x, y) => x.order - y.order);
  const intrinsic = (n: SceneNode, axis: "width" | "height"): number => {
    const cs = children.get(n.id) || [];
    if (n.kind === "text")
      return axis === "width"
        ? Math.max(...n.text.split("\n").map((t) => measure(t, n.fontSize)), 1)
        : n.text.split("\n").length * n.fontSize * 1.2;
    if (!cs.length) return n[axis];
    const pad = n.padding * 2 + n.strokeWidth * 2;
    if (
      (axis === "width" && n.layout === "horizontal") ||
      (axis === "height" && n.layout === "vertical")
    )
      return (
        cs.reduce((v, c) => v + intrinsic(c, axis), 0) +
        n.gap * (cs.length - 1) +
        pad
      );
    return (
      Math.max(
        ...cs.map(
          (c) =>
            intrinsic(c, axis) +
            (n.layout === "free" ? (axis === "width" ? c.x : c.y) : 0),
        ),
      ) + pad
    );
  };
  const size = (n: SceneNode, axis: "width" | "height", space: number) => {
    const mode = n[axis === "width" ? "widthMode" : "heightMode"];
    return mode === "fill"
      ? space
      : mode === "percent"
        ? (space * n[axis === "width" ? "widthPercent" : "heightPercent"]) / 100
        : mode === "hug"
          ? intrinsic(n, axis)
          : n[axis];
  };
  const walk = (
    n: SceneNode,
    b: Box,
    ancestors: Box[],
    depth: number,
  ): Item => {
    const cs = children.get(n.id) || [],
      pad = n.padding + n.strokeWidth,
      iw = Math.max(1, b.width - 2 * pad),
      ih = Math.max(1, b.height - 2 * pad);
    let cursor = 0;
    const horizontal = n.layout === "horizontal",
      vertical = n.layout === "vertical";
    const axis = horizontal ? "width" : "height";
    const fixed = cs.reduce(
      (s, c) =>
        s +
        (c[axis === "width" ? "widthMode" : "heightMode"] === "fill"
          ? 0
          : size(c, axis, horizontal ? iw : ih)),
      0,
    );
    const count = cs.filter(
      (c) => c[axis === "width" ? "widthMode" : "heightMode"] === "fill",
    ).length;
    const share = Math.max(
      1,
      ((horizontal ? iw : ih) - fixed - n.gap * Math.max(0, cs.length - 1)) /
        Math.max(1, count),
    );
    const cell = (iw - n.gap * (n.columns - 1)) / n.columns;
    let rowY = 0,
      rowH = 0;
    const sub = cs.map((c, i) => {
      let w = size(c, "width", iw),
        h = size(c, "height", ih),
        x = b.x + c.x + n.strokeWidth,
        y = b.y + c.y + n.strokeWidth;
      if (horizontal || vertical) {
        if (horizontal && c.widthMode === "fill") w = share;
        if (vertical && c.heightMode === "fill") h = share;
        x = b.x + pad + (horizontal ? cursor : 0);
        y = b.y + pad + (vertical ? cursor : 0);
        cursor += (horizontal ? w : h) + n.gap;
      }
      if (n.layout === "grid") {
        if (i % n.columns === 0 && i) {
          rowY += rowH + n.gap;
          rowH = 0;
        }
        if (c.widthMode === "fill") w = cell;
        x = b.x + pad + (i % n.columns) * (cell + n.gap);
        y = b.y + pad + rowY;
        rowH = Math.max(rowH, h);
      }
      return walk(
        c,
        { x, y, width: w, height: h },
        [...ancestors, b],
        depth + 1,
      );
    });
    return { ...b, node: n, children: sub, ancestors, depth };
  };
  return (children.get(null) || []).map((n) =>
    walk(
      n,
      {
        x: n.x,
        y: n.y,
        width: n.widthMode === "hug" ? intrinsic(n, "width") : n.width,
        height: n.heightMode === "hug" ? intrinsic(n, "height") : n.height,
      },
      [],
      0,
    ),
  );
}
export const flatten = (roots: Item[]): Item[] =>
  roots.flatMap((i) => [i, ...flatten(i.children)]);
export function hit(items: Item[], x: number, y: number): Item | undefined {
  return [...items]
    .reverse()
    .find(
      (i) =>
        !i.node.locked &&
        contains(i, x, y) &&
        i.ancestors.every((b) => contains(b, x, y)),
    );
}
