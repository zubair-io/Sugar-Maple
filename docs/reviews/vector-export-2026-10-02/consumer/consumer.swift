import SwiftUI


struct VectorFixture0: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 20, y: 20))
path.addLine(to: CGPoint(x: 50, y: 20))
path.addLine(to: CGPoint(x: 50, y: 60))
path.addLine(to: CGPoint(x: 20, y: 60))
path.closeSubpath()
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color(red: 0.1450980392156863, green: 0.38823529411764707, blue: 0.9215686274509803), style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 3, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.06666666666666667, green: 0.09411764705882353, blue: 0.15294117647058825))
}
.frame(width: 120, height: 100, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture1: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 20, y: 20))
path.addLine(to: CGPoint(x: 90, y: 20))
path.addLine(to: CGPoint(x: 90, y: 70))
path.addLine(to: CGPoint(x: 20, y: 70))
path.addLine(to: CGPoint(x: 20, y: 20))
path.closeSubpath()
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color.clear, style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 3, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.06666666666666667, green: 0.09411764705882353, blue: 0.15294117647058825))
}
.frame(width: 120, height: 100, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture2: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 10, y: 50))
path.addCurve(to: CGPoint(x: 50, y: 50), control1: CGPoint(x: 20, y: 10), control2: CGPoint(x: 40, y: 10))
path.addCurve(to: CGPoint(x: 100, y: 50), control1: CGPoint(x: 60, y: 90), control2: CGPoint(x: 80, y: 90))
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color.clear, style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 3, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.06666666666666667, green: 0.09411764705882353, blue: 0.15294117647058825))
}
.frame(width: 120, height: 100, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture3: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 10, y: 50))
path.addQuadCurve(to: CGPoint(x: 50, y: 50), control: CGPoint(x: 30, y: -10))
path.addQuadCurve(to: CGPoint(x: 90, y: 50), control: CGPoint(x: 70, y: 110))
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color.clear, style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 3, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.06666666666666667, green: 0.09411764705882353, blue: 0.15294117647058825))
}
.frame(width: 120, height: 100, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture4: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 10, y: 50))
path.addCurve(to: CGPoint(x: 50, y: 50), control1: CGPoint(x: 20, y: 0), control2: CGPoint(x: 40, y: 0))
path.addLine(to: CGPoint(x: 60, y: 50))
path.addCurve(to: CGPoint(x: 100, y: 50), control1: CGPoint(x: 60, y: 50), control2: CGPoint(x: 80, y: 90))
path.move(to: CGPoint(x: 10, y: 20))
path.addQuadCurve(to: CGPoint(x: 30, y: 20), control: CGPoint(x: 20, y: 40))
path.addLine(to: CGPoint(x: 40, y: 20))
path.addQuadCurve(to: CGPoint(x: 60, y: 20), control: CGPoint(x: 40, y: 20))
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color.clear, style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 3, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.06666666666666667, green: 0.09411764705882353, blue: 0.15294117647058825))
}
.frame(width: 120, height: 100, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture5: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 20, y: 30))
path.addRelativeArc(center: .zero, radius: 1, startAngle: .radians(2.9150272717704215), delta: .radians(3.141592653589793), transform: CGAffineTransform(a: 35.52816004431367, b: 20.5121927653966, c: -12.820120478372875, d: 22.205100027696044, tx: 57.5, ty: 45))
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color.clear, style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 3, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.06666666666666667, green: 0.09411764705882353, blue: 0.15294117647058825))
}
.frame(width: 120, height: 100, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture6: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 20, y: 30))
path.addRelativeArc(center: .zero, radius: 1, startAngle: .radians(2.9150272717704215), delta: .radians(-3.141592653589793), transform: CGAffineTransform(a: 35.52816004431367, b: 20.5121927653966, c: -12.820120478372875, d: 22.205100027696044, tx: 57.5, ty: 45))
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color.clear, style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 3, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.06666666666666667, green: 0.09411764705882353, blue: 0.15294117647058825))
}
.frame(width: 120, height: 100, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture7: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 20, y: 30))
path.addRelativeArc(center: .zero, radius: 1, startAngle: .radians(2.9150272717704215), delta: .radians(-3.141592653589793), transform: CGAffineTransform(a: 35.52816004431367, b: 20.5121927653966, c: -12.820120478372875, d: 22.205100027696044, tx: 57.5, ty: 45))
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color.clear, style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 3, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.06666666666666667, green: 0.09411764705882353, blue: 0.15294117647058825))
}
.frame(width: 120, height: 100, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture8: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 20, y: 30))
path.addRelativeArc(center: .zero, radius: 1, startAngle: .radians(2.9150272717704215), delta: .radians(3.141592653589793), transform: CGAffineTransform(a: 35.52816004431367, b: 20.5121927653966, c: -12.820120478372875, d: 22.205100027696044, tx: 57.5, ty: 45))
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color.clear, style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 3, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.06666666666666667, green: 0.09411764705882353, blue: 0.15294117647058825))
}
.frame(width: 120, height: 100, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture9: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 10, y: 50))
path.addRelativeArc(center: .zero, radius: 1, startAngle: .radians(2.111215837602193), delta: .radians(3.1415926325163688), transform: CGAffineTransform(a: 43.73213921133975, b: 43.73213921133974, c: -26.23928352680385, d: 26.239283526803856, tx: 55.000000252881094, ty: 50.000000537372316))
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color.clear, style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 3, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.06666666666666667, green: 0.09411764705882353, blue: 0.15294117647058825))
}
.frame(width: 120, height: 100, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture10: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 10, y: 20))
path.addLine(to: CGPoint(x: 80, y: 70))
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color.clear, style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 3, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.06666666666666667, green: 0.09411764705882353, blue: 0.15294117647058825))
}
.frame(width: 120, height: 100, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture11: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 20, y: 30))
path.addRelativeArc(center: .zero, radius: 1, startAngle: .radians(2.9150272717704215), delta: .radians(3.141592653589793), transform: CGAffineTransform(a: 35.52816004431367, b: 20.5121927653966, c: -12.820120478372875, d: 22.205100027696044, tx: 57.5, ty: 45))
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color.clear, style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 3, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.06666666666666667, green: 0.09411764705882353, blue: 0.15294117647058825))
}
.frame(width: 120, height: 100, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture12: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 10, y: 10))
path.addLine(to: CGPoint(x: 110, y: 10))
path.addLine(to: CGPoint(x: 110, y: 90))
path.addLine(to: CGPoint(x: 10, y: 90))
path.closeSubpath()
path.move(to: CGPoint(x: 35, y: 30))
path.addLine(to: CGPoint(x: 35, y: 70))
path.addLine(to: CGPoint(x: 85, y: 70))
path.addLine(to: CGPoint(x: 85, y: 30))
path.closeSubpath()
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color(red: 0.1450980392156863, green: 0.38823529411764707, blue: 0.9215686274509803), style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 3, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.06666666666666667, green: 0.09411764705882353, blue: 0.15294117647058825))
}
.frame(width: 120, height: 100, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture13: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: -20, y: 30))
path.addLine(to: CGPoint(x: 80, y: 30))
path.addLine(to: CGPoint(x: 30, y: 100))
path.closeSubpath()
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 30, ty: -20)
vectorPath.applying(vectorTransform).fill(Color(red: 0.1450980392156863, green: 0.38823529411764707, blue: 0.9215686274509803), style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 3, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.06666666666666667, green: 0.09411764705882353, blue: 0.15294117647058825))
}
.frame(width: 120, height: 100, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture14: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 10, y: 30))
path.addQuadCurve(to: CGPoint(x: 90, y: 30), control: CGPoint(x: 50, y: 0))
path.addLine(to: CGPoint(x: 10, y: 70))
}
let vectorTransform = CGAffineTransform(a: 2, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color.clear, style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 3, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.06666666666666667, green: 0.09411764705882353, blue: 0.15294117647058825))
}
.frame(width: 240, height: 100, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture15: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 10, y: 90))
path.addLine(to: CGPoint(x: 60, y: 10))
path.addLine(to: CGPoint(x: 64, y: 90))
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color.clear, style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 10, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.06666666666666667, green: 0.09411764705882353, blue: 0.15294117647058825))
}
.frame(width: 120, height: 100, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture16: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: -10, y: 50))
path.addLine(to: CGPoint(x: 130, y: 50))
path.addLine(to: CGPoint(x: 60, y: 110))
path.closeSubpath()
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color(red: 0.1450980392156863, green: 0.38823529411764707, blue: 0.9215686274509803), style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 3, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.06666666666666667, green: 0.09411764705882353, blue: 0.15294117647058825))
}
.frame(width: 120, height: 100, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(0.5)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture17: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 3.25, y: 3.25))
path.addLine(to: CGPoint(x: 63.25, y: 13.25))
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color.clear, style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 6, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.1450980392156863, green: 0.38823529411764707, blue: 0.9215686274509803))
}
.frame(width: 66.5, height: 16.5, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture18: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 3.25, y: 4.6903))
path.addLine(to: CGPoint(x: 63.25, y: 14.6903))
path.move(to: CGPoint(x: 46.394, y: 21.0051))
path.addLine(to: CGPoint(x: 63.25, y: 14.6903))
path.addLine(to: CGPoint(x: 49.3532, y: 3.25))
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 0.9999996136473809, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color.clear, style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 6, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.1450980392156863, green: 0.38823529411764707, blue: 0.9215686274509803))
}
.frame(width: 66.5, height: 24.255090628978586, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture19: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 3.25, y: 3.25))
path.addLine(to: CGPoint(x: 23.25, y: 43.25))
path.addLine(to: CGPoint(x: 63.25, y: 13.25))
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color.clear, style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 6, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.1450980392156863, green: 0.38823529411764707, blue: 0.9215686274509803))
}
.frame(width: 66.5, height: 46.5, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture20: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 4.2279, y: 1.4001))
path.addLine(to: CGPoint(x: 13.7329, y: 21.719))
path.addLine(to: CGPoint(x: 61.5729, y: 9.4416))
path.addLine(to: CGPoint(x: 62.5388, y: 9.3453))
path.addLine(to: CGPoint(x: 63.4849, y: 9.5624))
path.addLine(to: CGPoint(x: 64.3122, y: 10.0703))
path.addLine(to: CGPoint(x: 64.934, y: 10.8158))
path.addLine(to: CGPoint(x: 65.2851, y: 11.7207))
path.addLine(to: CGPoint(x: 65.329, y: 12.6905))
path.addLine(to: CGPoint(x: 65.0609, y: 13.6234))
path.addLine(to: CGPoint(x: 64.5089, y: 14.4219))
path.addLine(to: CGPoint(x: 63.7308, y: 15.0024))
path.addLine(to: CGPoint(x: 62.8081, y: 15.304))
path.addLine(to: CGPoint(x: 61.8375, y: 15.2952))
path.addLine(to: CGPoint(x: 60.9204, y: 14.977))
path.addLine(to: CGPoint(x: 60.153, y: 14.3825))
path.addLine(to: CGPoint(x: 59.6155, y: 13.5742))
path.addLine(to: CGPoint(x: 59.3644, y: 12.6365))
path.addLine(to: CGPoint(x: 59.4257, y: 11.6677))
path.addLine(to: CGPoint(x: 59.7932, y: 10.7692))
path.addLine(to: CGPoint(x: 60.4284, y: 10.0352))
path.addLine(to: CGPoint(x: 61.2647, y: 9.5423))
path.addLine(to: CGPoint(x: 62.2146, y: 9.3423))
path.addLine(to: CGPoint(x: 63.1786, y: 9.4561))
path.addLine(to: CGPoint(x: 64.0559, y: 9.8718))
path.addLine(to: CGPoint(x: 64.7544, y: 10.5458))
path.addLine(to: CGPoint(x: 65.2012, y: 11.4075))
path.addLine(to: CGPoint(x: 65.3495, y: 12.3669))
path.addLine(to: CGPoint(x: 65.1836, y: 13.3233))
path.addLine(to: CGPoint(x: 64.721, y: 14.1767))
path.addLine(to: CGPoint(x: 64.0102, y: 14.8378))
path.addLine(to: CGPoint(x: 63.1254, y: 15.2372))
path.addLine(to: CGPoint(x: 63.1263, y: 15.237))
path.addLine(to: CGPoint(x: 13.9663, y: 28.9595))
path.addLine(to: CGPoint(x: 0.4713, y: 3.2784))
path.addLine(to: CGPoint(x: 0.3011, y: 2.8016))
path.addLine(to: CGPoint(x: 0.25, y: 2.2979))
path.addLine(to: CGPoint(x: 0.3209, y: 1.7967))
path.addLine(to: CGPoint(x: 0.5097, y: 1.3269))
path.addLine(to: CGPoint(x: 0.8055, y: 0.916))
path.addLine(to: CGPoint(x: 1.191, y: 0.5878))
path.addLine(to: CGPoint(x: 1.6438, y: 0.3614))
path.addLine(to: CGPoint(x: 2.1377, y: 0.25))
path.addLine(to: CGPoint(x: 2.6438, y: 0.26))
path.addLine(to: CGPoint(x: 3.1329, y: 0.3908))
path.addLine(to: CGPoint(x: 3.5764, y: 0.6349))
path.addLine(to: CGPoint(x: 3.9487, y: 0.9781))
path.addLine(to: CGPoint(x: 4.228, y: 1.4003))
path.closeSubpath()
}
let vectorTransform = CGAffineTransform(a: 0.9999994813389954, b: 0, c: 0, d: 1.0000003530937247, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color(red: 0.1450980392156863, green: 0.38823529411764707, blue: 0.9215686274509803), style: FillStyle(eoFill: false))
}
.frame(width: 65.59946597609743, height: 29.209510313691148, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture21: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in

}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color.clear, style: FillStyle(eoFill: false))
}
.frame(width: 120, height: 100, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}

import SwiftUI


struct VectorFixture22: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 10, y: 10))
path.addLine(to: CGPoint(x: 70, y: 10))
path.addLine(to: CGPoint(x: 70, y: 50))
path.addLine(to: CGPoint(x: 10, y: 50))
path.closeSubpath()
}
let vectorTransform = CGAffineTransform(a: 1.125, b: 0, c: 0, d: 1.0833333333333333, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color(red: 0.8823529411764706, green: 0.11372549019607843, blue: 0.2823529411764706), style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 3, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.8313725490196079, green: 0.8313725490196079, blue: 0.8470588235294118))
}
.frame(width: 90, height: 65, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(0.7)
.rotationEffect(.degrees(20))
.offset(x: 35, y: 45)
}
.padding(0)
.foregroundStyle(Color(red: 0.09411764705882353, green: 0.09411764705882353, blue: 0.10588235294117647))
.frame(width: 180, height: 150, alignment: .topLeading)
.background(Color(red: 1, green: 1, blue: 1))
.clipShape(RoundedRectangle(cornerRadius: 0))
.overlay(RoundedRectangle(cornerRadius: 0).strokeBorder(Color(red: 0.8313725490196079, green: 0.8313725490196079, blue: 0.8470588235294118), lineWidth: 0))
.opacity(1)
.rotationEffect(.degrees(0))
}
}


import AppKit
import WebKit

private final class VectorNavigation: NSObject, WKNavigationDelegate {
    var loaded = false
    var error: Error?
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loaded = true }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { self.error = error }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { self.error = error }
}
private struct VectorFixtureRecord: Decodable { let name: String; let width: Double; let height: Double; let expectsInk: Bool; let svg: String }
@main private struct VectorConsumer {
    @MainActor static func wait(_ predicate: () -> Bool) {
        let deadline = Date().addingTimeInterval(30)
        while !predicate() && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.01)) }
        precondition(predicate(), "Native vector consumer timed out")
    }
    static func pixels(_ image: CGImage, width: Int, height: Int) -> [UInt8] {
        var bytes = [UInt8](repeating: 255, count: width * height * 4)
        bytes.withUnsafeMutableBytes { buffer in
            let context = CGContext(data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
                bytesPerRow: width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
            context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        return bytes
    }
    @MainActor static func main() throws {
        let folder = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
        let fixtures = try JSONDecoder().decode([VectorFixtureRecord].self, from: Data(contentsOf: folder.appendingPathComponent("fixtures.json")))
        let views: [AnyView] = [AnyView(VectorFixture0()),
AnyView(VectorFixture1()),
AnyView(VectorFixture2()),
AnyView(VectorFixture3()),
AnyView(VectorFixture4()),
AnyView(VectorFixture5()),
AnyView(VectorFixture6()),
AnyView(VectorFixture7()),
AnyView(VectorFixture8()),
AnyView(VectorFixture9()),
AnyView(VectorFixture10()),
AnyView(VectorFixture11()),
AnyView(VectorFixture12()),
AnyView(VectorFixture13()),
AnyView(VectorFixture14()),
AnyView(VectorFixture15()),
AnyView(VectorFixture16()),
AnyView(VectorFixture17()),
AnyView(VectorFixture18()),
AnyView(VectorFixture19()),
AnyView(VectorFixture20()),
AnyView(VectorFixture21()),
AnyView(VectorFixture22())]
        NSApplication.shared.setActivationPolicy(.accessory)
        NSApplication.shared.finishLaunching()
        let web = WKWebView(frame: .zero), delegate = VectorNavigation()
        web.navigationDelegate = delegate
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 300, height: 200), styleMask: .borderless, backing: .buffered, defer: false)
        window.contentView = web
        window.orderBack(nil)
        defer { web.stopLoading(); window.orderOut(nil) }
        var reports: [[String: Any]] = []
        for (index, fixture) in fixtures.enumerated() {
            let viewportWidth = ceil(fixture.width), viewportHeight = ceil(fixture.height)
            window.setContentSize(NSSize(width: viewportWidth, height: viewportHeight))
            delegate.loaded = false; delegate.error = nil
            web.loadHTMLString("<html><head><meta name='viewport' content='width=device-width, initial-scale=1'><style>html,body{margin:0;background:white;}svg{display:block}</style></head><body>\(fixture.svg)</body></html>", baseURL: nil)
            wait { delegate.loaded || delegate.error != nil }
            precondition(delegate.error == nil)
            var snapshot: NSImage?, snapshotError: Error?
            let config = WKSnapshotConfiguration()
            config.rect = CGRect(x: 0, y: 0, width: viewportWidth, height: viewportHeight)
            config.snapshotWidth = NSNumber(value: viewportWidth * 2 / window.backingScaleFactor)
            web.takeSnapshot(with: config) { image, error in snapshot = image; snapshotError = error }
            wait { snapshot != nil || snapshotError != nil }
            precondition(snapshotError == nil)
            let reference = snapshot!.cgImage(forProposedRect: nil, context: nil, hints: nil)!
            precondition(reference.width == Int(viewportWidth * 2) && reference.height == Int(viewportHeight * 2), "SVG snapshot must use the declared 2x comparison resolution")
            try NSBitmapImageRep(cgImage: reference).representation(using: .png, properties: [:])!.write(to: folder.appendingPathComponent("\(index)-svg.png"))
            let renderer = ImageRenderer(content: views[index].frame(width: viewportWidth, height: viewportHeight, alignment: .topLeading).background(Color.white))
            renderer.proposedSize = ProposedViewSize(width: viewportWidth, height: viewportHeight)
            // Compare identical backing pixels, rather than resampling only one renderer.
            renderer.scale = CGFloat(reference.width) / viewportWidth
            let native = renderer.cgImage!
            precondition(native.width == reference.width && native.height == reference.height)
            let width = reference.width, height = reference.height
            try NSBitmapImageRep(cgImage: native).representation(using: .png, properties: [:])!.write(to: folder.appendingPathComponent("\(index)-native.png"))
            let a = pixels(native, width: width, height: height), b = pixels(reference, width: width, height: height)
            var nativeInk = 0, svgInk = 0, union = 0, intersection = 0, differences = 0
            for pixel in 0..<(width * height) {
                let offset = pixel * 4
                let inkA = a[offset..<offset+3].min()! < 225, inkB = b[offset..<offset+3].min()! < 225
                if inkA { nativeInk += 1 }; if inkB { svgInk += 1 }
                if inkA || inkB { union += 1 }
                if inkA && inkB { intersection += 1 }
                if (0..<3).map({ abs(Int(a[offset+$0]) - Int(b[offset+$0])) }).max()! > 48 { differences += 1 }
            }
            let overlap = Double(intersection) / Double(max(1, union)), difference = Double(differences) / Double(max(1, union))
            reports.append(["name": fixture.name, "width": width, "height": height, "nativeInk": nativeInk, "svgInk": svgInk,
                "inkIntersectionOverUnion": overlap, "largeColorDifferenceOverInkUnion": difference])
            print("\(fixture.name): native ink \(nativeInk), SVG ink \(svgInk), overlap \(overlap), difference \(difference)")
            try JSONSerialization.data(withJSONObject: reports, options: [.prettyPrinted, .sortedKeys]).write(to: folder.appendingPathComponent("comparison.json"))
            if fixture.expectsInk {
                precondition(nativeInk > 0 && svgInk > 0 && overlap >= 0.94 && difference <= 0.1, "Native vector differs from independent SVG renderer: \(fixture.name)")
            } else { precondition(nativeInk == 0 && svgInk == 0, "Empty vector must not paint a rectangle or hairline") }
        }
        print("PASS: \(fixtures.count) standalone SwiftUI vector fixtures compile against macOS 14 and render against actual WKWebView SVG references")
    }
}
