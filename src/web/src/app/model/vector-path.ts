/** SVG endpoint syntax -> absolute native geometry. No source is evaluated.
 * Command semantics: https://www.w3.org/TR/SVG/paths.html
 * Arc conversion: https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes */
export interface Point { x: number; y: number }
export type PathSegment =
  | { kind: 'move' | 'line'; end: Point }
  | { kind: 'close' }
  | { kind: 'cubic'; end: Point; c1: Point; c2: Point }
  | { kind: 'quad'; end: Point; control: Point }
  | { kind: 'arc'; end: Point; center: Point; rx: number; ry: number; rotation: number; start: number; delta: number };

function finiteGeometry(value: unknown): boolean {
  return typeof value === 'number' ? Number.isFinite(value) :
    typeof value === 'object' && value !== null ? Object.values(value).every(finiteGeometry) : true;
}

function arc(from: Point, end: Point, rx: number, ry: number, degrees: number,
  large: boolean, sweep: boolean): PathSegment | null {
  if (from.x === end.x && from.y === end.y) return null;
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry) return { kind: 'line', end };
  const rotation = (degrees % 360) * Math.PI / 180, cos = Math.cos(rotation), sin = Math.sin(rotation);
  const dx = (from.x - end.x) / 2, dy = (from.y - end.y) / 2;
  const px = cos * dx + sin * dy, py = -sin * dx + cos * dy;
  const scale = Math.hypot(px / rx, py / ry);
  if (scale > 1) { rx *= scale; ry *= scale; }
  // Normalize before squaring to avoid overflowing large, valid radii.
  const ux = px / rx, uy = py / ry, length = ux * ux + uy * uy;
  const factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (1 - length) / length));
  const cx = factor * rx * uy, cy = -factor * ry * ux;
  const center = { x: cos * cx - sin * cy + (from.x + end.x) / 2,
    y: sin * cx + cos * cy + (from.y + end.y) / 2 };
  const ax = (px - cx) / rx, ay = (py - cy) / ry;
  const bx = (-px - cx) / rx, by = (-py - cy) / ry;
  const start = Math.atan2(ay, ax);
  let delta = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
  if (!sweep && delta > 0) delta -= Math.PI * 2;
  if (sweep && delta < 0) delta += Math.PI * 2;
  return { kind: 'arc', end, center, rx, ry, rotation, start, delta };
}

export function parseVectorPath(source: string): PathSegment[] {
  if (source.length > 100000) throw Error('SwiftUI path exceeds the 100 KB geometry limit.');
  const segments: PathSegment[] = [], number = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/gy;
  let pos = 0, command = '', current = { x: 0, y: 0 }, initial = current;
  let cubic: Point | null = null, quad: Point | null = null, separator = false;
  const error = () => Error(`SwiftUI path has invalid geometry at offset ${pos}; correct the path or export SVG.`);
  const space = () => { while (/[\x20\t\r\n]/.test(source[pos] ?? '') && pos < source.length) pos++; };
  const read = (flag = false) => {
    space();
    if (source[pos] === ',') { if (!separator) throw error(); pos++; space(); }
    let value: number;
    if (flag) {
      if (source[pos] !== '0' && source[pos] !== '1') throw error();
      value = Number(source[pos++]);
    } else {
      number.lastIndex = pos;
      const match = number.exec(source);
      if (!match) throw error();
      pos = number.lastIndex; value = Number(match[0]);
      if (!Number.isFinite(value)) throw error();
    }
    separator = true; return value;
  };
  const point = (relative: boolean): Point => ({ x: read() + (relative ? current.x : 0), y: read() + (relative ? current.y : 0) });
  while (true) {
    space();
    if (pos === source.length) break;
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(source[pos])) {
      command = source[pos++]; separator = false;
    } else if (!command || command.toUpperCase() === 'Z') throw error();
    const kind = command.toUpperCase(), relative = command !== kind;
    if (!segments.length && kind !== 'M') throw error();
    let segment: PathSegment | null;
    let nextCubic: Point | null = null, nextQuad: Point | null = null;
    switch (kind) {
      case 'M': initial = point(relative); segment = { kind: 'move', end: initial }; command = relative ? 'l' : 'L'; break;
      case 'L': segment = { kind: 'line', end: point(relative) }; break;
      case 'H': segment = { kind: 'line', end: { x: read() + (relative ? current.x : 0), y: current.y } }; break;
      case 'V': segment = { kind: 'line', end: { x: current.x, y: read() + (relative ? current.y : 0) } }; break;
      case 'C': {
        const c1 = point(relative), c2 = point(relative), end = point(relative);
        nextCubic = c2; segment = { kind: 'cubic', c1, c2, end }; break;
      }
      case 'S': {
        const c1: Point = cubic ? { x: 2 * current.x - cubic.x, y: 2 * current.y - cubic.y } : current;
        const c2 = point(relative), end = point(relative);
        nextCubic = c2; segment = { kind: 'cubic', c1, c2, end }; break;
      }
      case 'Q': {
        const control = point(relative), end = point(relative);
        nextQuad = control; segment = { kind: 'quad', control, end }; break;
      }
      case 'T': {
        const control: Point = quad ? { x: 2 * current.x - quad.x, y: 2 * current.y - quad.y } : current;
        nextQuad = control; segment = { kind: 'quad', control, end: point(relative) }; break;
      }
      case 'A': {
        const rx = read(), ry = read(), degrees = read(), large = Boolean(read(true)), sweep = Boolean(read(true)), end = point(relative);
        segment = arc(current, end, rx, ry, degrees, large, sweep);
        current = end; break;
      }
      case 'Z': segment = { kind: 'close' }; current = initial; break;
      default: throw error();
    }
    cubic = nextCubic; quad = nextQuad;
    if (segment) {
      // Arithmetic overflow must reject the complete export, never emit invalid Swift.
      if (!finiteGeometry(segment)) throw error();
      segments.push(segment);
      if ('end' in segment) current = segment.end;
    }
  }
  return segments;
}

const scalar = (value: number) => {
  if (!Number.isFinite(value)) throw Error('SwiftUI path geometry exceeds finite coordinate limits.');
  return Object.is(value, -0) ? '0' : String(value);
};
const pointCode = (point: Point) => `CGPoint(x: ${scalar(point.x)}, y: ${scalar(point.y)})`;
export function swiftPathCode(source: string): string {
  return `Path { path in\n${parseVectorPath(source).map(segment => {
    switch (segment.kind) {
      case 'move': return `path.move(to: ${pointCode(segment.end)})`;
      case 'line': return `path.addLine(to: ${pointCode(segment.end)})`;
      case 'close': return 'path.closeSubpath()';
      case 'quad': return `path.addQuadCurve(to: ${pointCode(segment.end)}, control: ${pointCode(segment.control)})`;
      case 'cubic': return `path.addCurve(to: ${pointCode(segment.end)}, control1: ${pointCode(segment.c1)}, control2: ${pointCode(segment.c2)})`;
      case 'arc': {
        const cos = Math.cos(segment.rotation), sin = Math.sin(segment.rotation);
        return `path.addRelativeArc(center: .zero, radius: 1, startAngle: .radians(${scalar(segment.start)}), delta: .radians(${scalar(segment.delta)}), transform: CGAffineTransform(a: ${scalar(segment.rx * cos)}, b: ${scalar(segment.rx * sin)}, c: ${scalar(-segment.ry * sin)}, d: ${scalar(segment.ry * cos)}, tx: ${scalar(segment.center.x)}, ty: ${scalar(segment.center.y)}))`;
      }
    }
  }).join('\n')}\n}`;
}
