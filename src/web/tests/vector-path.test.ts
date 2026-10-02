import { test, expect } from 'bun:test';
import { blankDocument, NodeSchema } from '../src/app/model/schema';
import { exportNode } from '../src/app/model/export';
import { parseVectorPath, swiftPathCode } from '../src/app/model/vector-path';

test('SVG grammar retains implicit relative lines, exponent numbers and closepath current point', () => {
  expect(parseVectorPath('m1e1,.5 20-3 H40 v5 z l2 4')).toEqual([
    { kind: 'move', end: { x: 10, y: .5 } },
    { kind: 'line', end: { x: 30, y: -2.5 } },
    { kind: 'line', end: { x: 40, y: -2.5 } },
    { kind: 'line', end: { x: 40, y: 2.5 } },
    { kind: 'close' },
    { kind: 'line', end: { x: 12, y: 4.5 } },
  ]);
  expect(parseVectorPath(' \t\r\n')).toEqual([]);
});

test('smooth cubic/quadratic controls reflect only the matching previous curve family', () => {
  const segments = parseVectorPath('M0 0 c10 10 20 20 30 0 s20-20 30 0 q10 10 20 0 t20 0 L120 10 s10 0 20 10 t20 0');
  expect(segments[1]).toEqual({ kind: 'cubic', c1: { x: 10, y: 10 }, c2: { x: 20, y: 20 }, end: { x: 30, y: 0 } });
  expect(segments[2]).toEqual({ kind: 'cubic', c1: { x: 40, y: -20 }, c2: { x: 50, y: -20 }, end: { x: 60, y: 0 } });
  expect(segments[4]).toEqual({ kind: 'quad', control: { x: 90, y: -10 }, end: { x: 100, y: 0 } });
  expect(segments[6]).toEqual({ kind: 'cubic', c1: { x: 120, y: 10 }, c2: { x: 130, y: 10 }, end: { x: 140, y: 20 } });
  expect(segments[7]).toEqual({ kind: 'quad', control: { x: 140, y: 20 }, end: { x: 160, y: 20 } });
});

test('elliptical arc flags, degeneracy and out-of-range radii follow SVG geometry', () => {
  const small = parseVectorPath('M1 0 A1 1 0 011 0')[1]; // Same endpoints omit the arc.
  expect(small).toBeUndefined();
  const arc = parseVectorPath('M1 0 A1 1 0 010 1')[1]; // Compact adjacent flags/end x.
  if (!arc || arc.kind !== 'arc') throw Error('Expected arc');
  expect(arc.center.x).toBeCloseTo(0); expect(arc.center.y).toBeCloseTo(0);
  expect(arc.start).toBeCloseTo(0); expect(arc.delta).toBeCloseTo(Math.PI / 2);
  const large = parseVectorPath('M1 0 a-1 -1 0 1 0 -1 1')[1];
  if (!large || large.kind !== 'arc') throw Error('Expected large arc');
  expect(large.delta).toBeCloseTo(-Math.PI * 1.5);
  const corrected = parseVectorPath('M0 0 A1 1 0 0 1 10 0')[1];
  if (!corrected || corrected.kind !== 'arc') throw Error('Expected corrected arc');
  expect(corrected.rx).toBeCloseTo(5); expect(corrected.ry).toBeCloseTo(5);
  expect(parseVectorPath('M0 0 a0 10 0 0 1 20 30')[1]).toEqual({ kind: 'line', end: { x: 20, y: 30 } });
});

test('incomplete, invalid and overflowing paths reject whole export before returning source', () => {
  for (const source of ['L0 0', 'M,0 0', 'M0 0,', 'M0 0,,1 2', 'M0 0 Z 1 2', 'M0 0 C1 2',
    'M0 0 A10 10 0 2 0 30 40', 'M0 0 A10 10 0 0.5 1 30 40', 'M1e999 0',
    'M1e308 0 l1e308 0', 'M0 0 R1 2', 'M0 0 L1 2 garbage'])
    expect(() => swiftPathCode(source)).toThrow('invalid geometry');
});

test('SwiftUI vectors paint actual paths without rectangle padding/background/border and validate viewBox', () => {
  const doc = blankDocument(), pageId = doc.pages[0].id;
  doc.tokens.ink = '#ff0000';
  doc.nodes = [NodeSchema.parse({ id: 'path', kind: 'path', pageId, name: 'Arrow',
    pathData: 'M10 20 L110 70', viewBox: '10 20 100 50', width: 200, height: 75,
    fillToken: 'ink', strokeWidth: 4, opacity: .4, rotation: 25 })];
  const code = exportNode(doc, 'path', 'swiftui');
  expect(code).toContain('path.addLine(to: CGPoint(x: 110, y: 70))');
  expect(code).toContain('tx: -20, ty: -30');
  expect(code).toContain('CGAffineTransform(a: 2, b: 0, c: 0, d: 1.5');
  expect(code).toContain('Color(red: 1, green: 0, blue: 0)');
  expect(code).toContain('miterLimit: 10'); expect(code).toContain('.opacity(0.4)');
  expect(code).toContain('.rotationEffect(.degrees(25))');
  expect(code).not.toContain('RoundedRectangle'); expect(code).not.toContain('.padding(');
  doc.nodes[0].viewBox = '0 0 0 100';
  expect(() => exportNode(doc, 'path', 'swiftui')).toThrow('positive width and height');
  doc.nodes[0].viewBox = '0 0 100 100'; doc.nodes[0].pathData = 'M0 0 C1 2';
  expect(() => exportNode(doc, 'path', 'swiftui')).toThrow('invalid geometry');
});
