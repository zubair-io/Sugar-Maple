import { assetSource, embeddedAsset } from './assets';
import { controlLabel, hasPrototypeAction } from './form';
import { textAlignment } from './typography';
import type { SceneDocument, SceneNode } from './schema';
import { subtree } from './composition';
import { swiftPathCode } from './vector-path';
const quoted = (v: string) => JSON.stringify(v).replace(/\\u([0-9a-f]{4})/gi, '\\u{$1}');
const stateName = (n: SceneNode) => 'input_' + Array.from(n.id).map(c => c.codePointAt(0)!.toString(16)).join('_');
function color(hex: string) {
  return `Color(red: ${parseInt(hex.slice(1, 3), 16) / 255}, green: ${parseInt(hex.slice(3, 5), 16) / 255}, blue: ${parseInt(hex.slice(5, 7), 16) / 255})`;
}
export function swiftWeight(weight: number) {
  const weights = [
    'ultraLight',
    'thin',
    'light',
    'regular',
    'medium',
    'semibold',
    'bold',
    'heavy',
    'black',
  ];
  return '.' + weights[Math.max(0, Math.min(8, Math.round(weight / 100) - 1))];
}
export function swiftExport(doc: SceneDocument, id: string) {
  const root = doc.nodes.find((n) => n.id === id);
  if (!root) throw Error('Node not found');
  if (subtree(doc, id).some(n => n.kind !== 'button' && hasPrototypeAction(n)))
    throw Error('SwiftUI prototype callbacks currently require a Button; use a button action or a web preview.');
  if (subtree(doc, id).some((n) => n.widthMode !== 'fixed' || n.heightMode !== 'fixed'))
    throw Error(
      'SwiftUI responsive sizing is not yet supported; choose fixed dimensions before exporting.',
    );
  if (subtree(doc, id).some((n) => n.gradient))
    throw Error(
      'SwiftUI gradient export is not yet supported; use a solid fill or a web/SVG target.',
    );
  const texts = subtree(doc, id).filter((n) => ['text', 'button', 'input'].includes(n.kind));
  if (texts.some((n) => !['system-ui', 'sans-serif', 'serif', 'monospace'].includes(n.fontFamily)))
    throw Error(
      'SwiftUI custom font export requires native font registration; choose a system family or a web target.',
    );
  if (texts.some((n) => n.lineHeight !== 1.2))
    throw Error(
      'SwiftUI exact line-height export is not supported; use the default 1.2 or a web target.',
    );
  const fontModifier = (n: SceneNode) =>
    `.font(.system(size: ${n.fontSize}, weight: ${swiftWeight(n.fontWeight)}${n.fontFamily === 'serif' ? ', design: .serif' : n.fontFamily === 'monospace' ? ', design: .monospaced' : ''}))`;
  // Preflight every vector before returning any generated source.
  const vectors = new Map(subtree(doc, id).filter(n => n.kind === 'path').map(n => {
    const [x, y, width, height] = n.viewBox.split(' ').map(Number);
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0 ||
      ![n.width / width, n.height / height, -x * (n.width / width), -y * (n.height / height)].every(Number.isFinite))
      throw Error('SwiftUI path requires a finite viewBox with positive width and height.');
    return [n.id, { x, y, width, height, code: swiftPathCode(n.pathData) }] as const;
  }));
  const inputs = subtree(doc, id).filter((n) => n.kind === 'input');
  const imageAssets = new Map(subtree(doc, id).filter(n => n.kind === 'image' && n.asset).map(n => { const a = embeddedAsset(assetSource(doc, n.asset)); return [a.key, a.source.split(',')[1]]; }));
  const body = (n: SceneNode, nested = false): string => {
    const children = doc.nodes
      .filter((v) => v.parentId === n.id && !v.hidden)
      .sort((a, b) => a.order - b.order);
    const fill = !n.fillEnabled
      ? 'Color.clear'
      : color(n.fillToken ? (doc.tokens[n.fillToken] ?? n.fill) : n.fill);
    if (n.kind === 'path') {
      const vector = vectors.get(n.id)!;
      // Paint in viewBox units, then scale the complete fill/stroke together.
      // Scaling only the centerline would change anisotropic SVG stroke geometry.
      const sx = n.width / vector.width, sy = n.height / vector.height;
      return `ZStack(alignment: .topLeading) {\nlet vectorPath = ${vector.code}\nlet vectorTransform = CGAffineTransform(a: ${sx}, b: 0, c: 0, d: ${sy}, tx: ${-vector.x * sx}, ty: ${-vector.y * sy})\nvectorPath.applying(vectorTransform).fill(${fill}, style: FillStyle(eoFill: false))${n.strokeWidth ? `\nvectorPath.strokedPath(StrokeStyle(lineWidth: ${n.strokeWidth}, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(${color(n.stroke)})` : ''}\n}\n.frame(width: ${n.width}, height: ${n.height}, alignment: .topLeading)\n.clipped()\n.compositingGroup()\n.opacity(${n.opacity})\n.rotationEffect(.degrees(${n.rotation}))${nested ? `\n.offset(x: ${n.x}, y: ${n.y})` : ''}`;
    }
    let view: string;
    if (n.kind === 'text') view = `Text(${quoted(n.text)})\n${fontModifier(n)}`;
    else if (n.kind === 'button')
      view = `Button(${quoted(n.text)}) { onAction(${quoted(n.id)}) }\n.buttonStyle(.plain)`;
    else if (n.kind === 'input')
      view = `${n.inputType === 'password' ? 'SecureField' : 'TextField'}(${quoted(n.text)}, text: $${stateName(n)})\n.textFieldStyle(.plain)${n.inputType === 'email' ? '\n.textContentType(.emailAddress)' : ''}`;
    else if (n.kind === 'image') view = n.asset ? `SugarMapleEmbeddedImage(data: SugarMapleAssets.${embeddedAsset(assetSource(doc, n.asset)).key.replace(/-/g, '_')}, label: ${quoted(n.name)})` : `Text(${quoted('Image unavailable: ' + n.name)})`;
    else if (n.kind === 'ellipse') view = `Ellipse().fill(${fill})`;
    else if (n.layout === 'grid')
      view = `LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: ${n.gap}), count: ${n.columns}), spacing: ${n.gap}) {\n${children.map((v) => body(v)).join('\n')}\n}`;
    else
      view = `${n.layout === 'horizontal' ? `HStack(alignment: .top, spacing: ${n.gap})` : n.layout === 'vertical' ? `VStack(alignment: .leading, spacing: ${n.gap})` : 'ZStack(alignment: .topLeading)'} {\n${children.length ? children.map((v) => body(v, n.layout === 'free')).join('\n') : 'Color.clear'}\n}`;
    const font = ['button', 'input'].includes(n.kind) ? `\n${fontModifier(n)}` : '';
    const padding =
      (['frame', 'artboard'].includes(n.kind) ? n.padding : n.kind === 'input' ? 8 : 0) +
      n.strokeWidth;
    const semantics = ['button', 'input'].includes(n.kind) ? `\n.disabled(${n.disabled})\n.accessibilityLabel(Text(${quoted(controlLabel(n))}))` : '';
    return `${view}${font}${semantics}${['text', 'button', 'input'].includes(n.kind) ? `\n.tracking(${n.letterSpacing})\n.multilineTextAlignment(${textAlignment(n) === 'center' ? '.center' : textAlignment(n) === 'right' ? '.trailing' : '.leading'})` : ''}\n.padding(${padding})\n.foregroundStyle(${color(n.color)})\n.frame(width: ${n.width}, height: ${n.height}, alignment: ${n.kind === 'button' || n.kind === 'input' ? (textAlignment(n) === 'center' ? '.center' : textAlignment(n) === 'right' ? '.trailing' : '.leading') : textAlignment(n) === 'center' ? '.top' : textAlignment(n) === 'right' ? '.topTrailing' : '.topLeading'})\n.background(${fill})\n.clipShape(RoundedRectangle(cornerRadius: ${n.kind === 'ellipse' ? Math.min(n.width, n.height) / 2 : n.radius}))\n.overlay(RoundedRectangle(cornerRadius: ${n.radius}).strokeBorder(${color(n.stroke)}, lineWidth: ${n.strokeWidth}))\n.opacity(${n.opacity})\n.rotationEffect(.degrees(${n.rotation}))${nested ? `\n.offset(x: ${n.x}, y: ${n.y})` : ''}`;
  };
  const imageCode = imageAssets.size ? `
#if canImport(AppKit)
import AppKit
#elseif canImport(UIKit)
import UIKit
#endif
private enum SugarMapleAssets {
${[...imageAssets].map(([key, data]) => `static let ${key.replace(/-/g, '_')} = Data(base64Encoded: ${quoted(data)}) ?? Data()`).join('\n')}
}
private struct SugarMapleEmbeddedImage: View {
let data: Data
let label: String
var body: some View {
#if canImport(AppKit)
if let image = NSImage(data: data) { Image(nsImage: image).resizable().scaledToFill().accessibilityLabel(Text(label)) }
else { Text("Image unavailable").accessibilityLabel(Text(label)) }
#elseif canImport(UIKit)
if let image = UIImage(data: data) { Image(uiImage: image).resizable().scaledToFill().accessibilityLabel(Text(label)) }
else { Text("Image unavailable").accessibilityLabel(Text(label)) }
#else
Text("Image unavailable").accessibilityLabel(Text(label))
#endif
}
}
` : '';
  return `import SwiftUI\n${imageCode}\n${subtree(doc, id).filter(hasPrototypeAction).map(n => '// Action ' + n.id + ': ' + n.prototypeAction + (n.targetId ? ' -> ' + n.targetId : '')).join('\n')}\nstruct SugarMapleView: View {\nvar onAction: (String) -> Void = { _ in }\n${inputs.map((n) => `@State private var ${stateName(n)} = ${quoted(n.initialValue)}`).join('\n')}\nvar body: some View {\n${body(root)}\n}\n}\n`;
}
