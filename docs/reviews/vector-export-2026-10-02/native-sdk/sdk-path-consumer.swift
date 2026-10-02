import SwiftUI


struct SugarMapleView: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 4.25, y: 4.25))
path.addLine(to: CGPoint(x: 84.25, y: 34.25))
path.addLine(to: CGPoint(x: 154.25, y: 4.25))
path.closeSubpath()
}
let vectorTransform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color.clear, style: FillStyle(eoFill: false))
vectorPath.strokedPath(StrokeStyle(lineWidth: 8, lineCap: .butt, lineJoin: .miter, miterLimit: 10)).applying(vectorTransform).fill(Color(red: 0.8627450980392157, green: 0.14901960784313725, blue: 0.14901960784313725))
}
.frame(width: 158.5, height: 38.5, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}
