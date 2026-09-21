import { gradientSVG } from './gradient';
import { subtree } from './composition';
import { NodeSchema, uid, type SceneDocument, type SceneNode, type Operation } from './schema';
const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function svgExport(doc: SceneDocument, id: string) {
  const root = doc.nodes.find((n) => n.id === id);
  if (!root) throw Error('Node not found');
  if (subtree(doc, id).some((n) => n.widthMode !== 'fixed' || n.heightMode !== 'fixed'))
    throw Error(
      'SVG/PNG responsive sizing is not yet supported; choose fixed dimensions before exporting.',
    );
  const render = (n: SceneNode, x: number, y: number): string => {
    if (n.hidden) return '';
    const fill = !n.fillEnabled
      ? 'none'
      : n.fillToken
        ? (doc.tokens[n.fillToken] ?? n.fill)
        : n.fill;
    const base = `fill="${n.gradient && n.fillEnabled ? `url(#gradient-${n.id})` : fill}" stroke="${n.stroke}" stroke-width="${n.strokeWidth}"`;
    const gradient = n.gradient && n.fillEnabled ? `<defs>${gradientSVG(n)}</defs>` : '';
    let shape =
      n.kind === 'ellipse'
        ? `<ellipse cx="${n.width / 2}" cy="${n.height / 2}" rx="${n.width / 2}" ry="${n.height / 2}" ${base}/>`
        : n.kind === 'path'
          ? `<svg width="${n.width}" height="${n.height}" viewBox="${n.viewBox}" preserveAspectRatio="none"><path d="${escape(n.pathData)}" ${base}/></svg>`
          : `<rect width="${n.width}" height="${n.height}" rx="${n.radius}" ${base}/>`;
    shape = gradient + shape;
    if (n.kind === 'image')
      shape += `<image href="${n.asset}" width="${n.width}" height="${n.height}" preserveAspectRatio="xMidYMid slice"/>`;
    if (n.text)
      shape += `<text x="${n.kind === 'button' ? n.width / 2 : 0}" y="${n.fontSize}" text-anchor="${n.kind === 'button' ? 'middle' : 'start'}" fill="${n.color}" font-family="Arial, sans-serif" font-size="${n.fontSize}" font-weight="${n.fontWeight}">${n.text
        .split('\n')
        .map(
          (line, i) =>
            `<tspan x="${n.kind === 'button' ? n.width / 2 : 0}" dy="${i ? n.fontSize * 1.2 : 0}">${escape(line)}</tspan>`,
        )
        .join('')}</text>`;
    const children = doc.nodes.filter((v) => v.parentId === n.id).sort((a, b) => a.order - b.order);
    let cursor = 0;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      let cx = child.x,
        cy = child.y;
      if (n.layout === 'horizontal') {
        cx = n.padding + cursor;
        cy = n.padding;
        cursor += child.width + n.gap;
      }
      if (n.layout === 'vertical') {
        cx = n.padding;
        cy = n.padding + cursor;
        cursor += child.height + n.gap;
      }
      if (n.layout === 'grid') {
        cx = n.padding + (i % n.columns) * ((n.width - 2 * n.padding + n.gap) / n.columns);
        cy =
          n.padding +
          Math.floor(i / n.columns) * (Math.max(...children.map((c) => c.height)) + n.gap);
      }
      shape += render(child, cx, cy);
    }
    return `<g transform="translate(${x} ${y}) rotate(${n.rotation} ${n.width / 2} ${n.height / 2})" opacity="${n.opacity}"><svg width="${n.width}" height="${n.height}" overflow="hidden">${shape}</svg></g>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${root.width}" height="${root.height}" viewBox="0 0 ${root.width} ${root.height}">${render(root, 0, 0)}</svg>`;
}
export function svgImport(source: string, pageId: string, name: string): Operation[] {
  if (source.length > 1_000_000) throw Error('SVG exceeds 1 MB');
  const xml = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (xml.querySelector('parsererror') || xml.documentElement.tagName !== 'svg')
    throw Error('Invalid SVG');
  const allowed = new Set([
    'svg',
    'g',
    'rect',
    'circle',
    'ellipse',
    'path',
    'text',
    'title',
    'desc',
  ]);
  for (const el of Array.from(xml.querySelectorAll('*'))) {
    if (el.tagName === 'g' && Array.from(el.attributes).some((a) => a.name !== 'id'))
      throw Error('SVG group styling is not supported; use explicit shape attributes');
    if (!allowed.has(el.tagName)) throw Error(`Unsupported SVG element: ${el.tagName}`);
    for (const a of Array.from(el.attributes))
      if (
        /^on/i.test(a.name) ||
        ['href', 'xlink:href', 'style', 'transform', 'filter', 'clip-path', 'mask'].includes(
          a.name,
        ) ||
        a.value.includes('url(')
      )
        throw Error(`Unsupported SVG attribute: ${a.name}`);
  }
  const root = xml.documentElement;
  const view = root.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number) ?? [
    0,
    0,
    Number(root.getAttribute('width') ?? 100),
    Number(root.getAttribute('height') ?? 100),
  ];
  if (view.length !== 4 || view.some((n) => !Number.isFinite(n)) || view[0] !== 0 || view[1] !== 0)
    throw Error('SVG requires a numeric viewBox starting at 0 0');
  const parent = uid();
  const operations: Operation[] = [
    {
      type: 'node.add',
      node: {
        id: parent,
        pageId,
        kind: 'frame',
        name,
        width: view[2],
        height: view[3],
        x: 80,
        y: 80,
        padding: 0,
      },
    },
  ];
  const literal = (el: Element, attr: string, fallback: string) => {
    const value = el.getAttribute(attr) ?? fallback;
    if (value === 'none') throw Error('Transparent SVG fills are not supported yet');
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw Error('SVG colors must use six-digit hex values');
    return value;
  };
  for (const el of Array.from(root.querySelectorAll('rect,circle,ellipse,path,text'))) {
    const num = (key: string, fallback = 0) => Number(el.getAttribute(key) ?? fallback);
    const common = {
      pageId,
      parentId: parent,
      name: el.getAttribute('id') ?? el.tagName,
      fill: literal(el, 'fill', '#000000'),
      stroke: literal(el, 'stroke', '#000000'),
      strokeWidth: num('stroke-width'),
      opacity: num('opacity', 1),
      padding: 0,
    };
    let node: Partial<SceneNode> & { kind: SceneNode['kind']; pageId: string };
    if (el.tagName === 'path')
      node = {
        ...common,
        kind: 'path',
        pathData: el.getAttribute('d') ?? '',
        width: view[2],
        height: view[3],
        viewBox: view.join(' '),
      };
    else if (el.tagName === 'circle' || el.tagName === 'ellipse') {
      const rx = num('rx', num('r')),
        ry = num('ry', num('r'));
      node = {
        ...common,
        kind: 'ellipse',
        x: num('cx') - rx,
        y: num('cy') - ry,
        width: rx * 2,
        height: ry * 2,
      };
    } else
      node = {
        ...common,
        kind: el.tagName === 'text' ? 'text' : 'rectangle',
        x: num('x'),
        y: num('y'),
        width: num('width', view[2]),
        height: num('height', 24),
        radius: num('rx'),
        text: el.textContent ?? '',
        fontSize: num('font-size', 16),
        color: common.fill,
        fill: '#ffffff',
      };
    operations.push({ type: 'node.add', node: NodeSchema.parse({ id: uid(), ...node }) });
  }
  if (operations.length === 1) throw Error('SVG has no supported geometry');
  return operations;
}
