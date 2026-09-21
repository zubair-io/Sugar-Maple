import type { SceneDocument, SceneNode } from './schema';
import { subtree } from './composition';
const quoted = (v: string) => JSON.stringify(v).replace(/\\u([0-9a-f]{4})/gi, '\\u{$1}');
const stateName = (n: SceneNode) => 'input_' + n.id.replace(/[^A-Za-z0-9_]/g, '_');
function color(hex: string) {
  return `Color(red: ${parseInt(hex.slice(1, 3), 16) / 255}, green: ${parseInt(hex.slice(3, 5), 16) / 255}, blue: ${parseInt(hex.slice(5, 7), 16) / 255})`;
}
export function swiftExport(doc: SceneDocument, id: string) {
  const root = doc.nodes.find((n) => n.id === id);
  if (!root) throw Error('Node not found');
  if (subtree(doc, id).some((n) => n.kind === 'path'))
    throw Error('SwiftUI path export is not yet supported; export this vector as SVG.');
  const inputs = subtree(doc, id).filter((n) => n.kind === 'input');
  const body = (n: SceneNode, nested = false): string => {
    const children = doc.nodes
      .filter((v) => v.parentId === n.id && !v.hidden)
      .sort((a, b) => a.order - b.order);
    const fill = color(n.fillToken ? (doc.tokens[n.fillToken] ?? n.fill) : n.fill);
    let view: string;
    if (n.kind === 'text')
      view = `Text(${quoted(n.text)})\n.font(.system(size: ${n.fontSize}, weight: ${n.fontWeight >= 600 ? '.semibold' : '.regular'}))`;
    else if (n.kind === 'button')
      view = `Button(${quoted(n.text)}) { onAction(${quoted(n.id)}) }\n.buttonStyle(.plain)`;
    else if (n.kind === 'input')
      view = `TextField(${quoted(n.text)}, text: $${stateName(n)})\n.textFieldStyle(.plain)`;
    else if (n.kind === 'image') view = `Image(${quoted(n.name)})\n.resizable()\n.scaledToFill()`;
    else if (n.kind === 'ellipse') view = `Ellipse().fill(${fill})`;
    else if (n.layout === 'grid')
      view = `LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: ${n.gap}), count: ${n.columns}), spacing: ${n.gap}) {\n${children.map((v) => body(v)).join('\n')}\n}`;
    else
      view = `${n.layout === 'horizontal' ? `HStack(alignment: .top, spacing: ${n.gap})` : n.layout === 'vertical' ? `VStack(alignment: .leading, spacing: ${n.gap})` : 'ZStack(alignment: .topLeading)'} {\n${children.length ? children.map((v) => body(v, n.layout === 'free')).join('\n') : 'Color.clear'}\n}`;
    return `${view}\n.foregroundStyle(${color(n.color)})\n.frame(width: ${n.width}, height: ${n.height}, alignment: ${['button', 'input'].includes(n.kind) ? '.center' : '.topLeading'})\n.background(${fill})\n.clipShape(RoundedRectangle(cornerRadius: ${n.kind === 'ellipse' ? Math.min(n.width, n.height) / 2 : n.radius}))\n.overlay(RoundedRectangle(cornerRadius: ${n.radius}).stroke(${color(n.stroke)}, lineWidth: ${n.strokeWidth}))\n.opacity(${n.opacity})\n.rotationEffect(.degrees(${n.rotation}))${nested ? `\n.offset(x: ${n.x}, y: ${n.y})` : ''}`;
  };
  const images = subtree(doc, id).filter((n) => n.kind === 'image');
  return `import SwiftUI\n\n${images.length ? '// Add the exported image assets to the asset catalog: ' + images.map((n) => quoted(n.name)).join(', ') + '\n' : ''}struct SugarMapleView: View {\nvar onAction: (String) -> Void = { _ in }\n${inputs.map((n) => `@State private var ${stateName(n)} = ""`).join('\n')}\nvar body: some View {\n${body(root)}\n}\n}\n`;
}
