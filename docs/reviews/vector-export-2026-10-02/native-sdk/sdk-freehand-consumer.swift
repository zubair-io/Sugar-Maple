import SwiftUI


struct SugarMapleView: View {
var onAction: (String) -> Void = { _ in }

var body: some View {
ZStack(alignment: .topLeading) {
let vectorPath = Path { path in
path.move(to: CGPoint(x: 4.9624, y: 0.4481))
path.addLine(to: CGPoint(x: 50.6068, y: 18.0606))
path.addLine(to: CGPoint(x: 153.2826, y: 0.9694))
path.addLine(to: CGPoint(x: 154.1828, y: 0.9677))
path.addLine(to: CGPoint(x: 155.0364, y: 1.2535))
path.addLine(to: CGPoint(x: 155.754, y: 1.797))
path.addLine(to: CGPoint(x: 156.2605, y: 2.5411))
path.addLine(to: CGPoint(x: 156.503, y: 3.4081))
path.addLine(to: CGPoint(x: 156.4559, y: 4.307))
path.addLine(to: CGPoint(x: 156.1242, y: 5.1439))
path.addLine(to: CGPoint(x: 155.5426, y: 5.831))
path.addLine(to: CGPoint(x: 154.7721, y: 6.2965))
path.addLine(to: CGPoint(x: 153.8933, y: 6.4916))
path.addLine(to: CGPoint(x: 152.9982, y: 6.3958))
path.addLine(to: CGPoint(x: 152.1806, y: 6.0193))
path.addLine(to: CGPoint(x: 151.526, y: 5.4013))
path.addLine(to: CGPoint(x: 151.1029, y: 4.6067))
path.addLine(to: CGPoint(x: 150.9558, y: 3.7187))
path.addLine(to: CGPoint(x: 151.0999, y: 2.8301))
path.addLine(to: CGPoint(x: 151.5202, y: 2.034))
path.addLine(to: CGPoint(x: 152.1727, y: 1.4139))
path.addLine(to: CGPoint(x: 152.989, y: 1.0345))
path.addLine(to: CGPoint(x: 153.8838, y: 0.9357))
path.addLine(to: CGPoint(x: 154.7632, y: 1.1277))
path.addLine(to: CGPoint(x: 155.5353, y: 1.5906))
path.addLine(to: CGPoint(x: 156.1192, y: 2.2757))
path.addLine(to: CGPoint(x: 156.4538, y: 3.1114))
path.addLine(to: CGPoint(x: 156.504, y: 4.0102))
path.addLine(to: CGPoint(x: 156.2646, y: 4.878))
path.addLine(to: CGPoint(x: 155.7606, y: 5.6239))
path.addLine(to: CGPoint(x: 155.0448, y: 6.1698))
path.addLine(to: CGPoint(x: 154.1922, y: 6.4586))
path.addLine(to: CGPoint(x: 154.193, y: 6.4584))
path.addLine(to: CGPoint(x: 48.8688, y: 23.8672))
path.addLine(to: CGPoint(x: 2.5131, y: 6.9796))
path.addLine(to: CGPoint(x: 1.7672, y: 6.5916))
path.addLine(to: CGPoint(x: 1.1357, y: 6.0364))
path.addLine(to: CGPoint(x: 0.6555, y: 5.3462))
path.addLine(to: CGPoint(x: 0.3544, y: 4.5611))
path.addLine(to: CGPoint(x: 0.25, y: 3.7267))
path.addLine(to: CGPoint(x: 0.3483, y: 2.8916))
path.addLine(to: CGPoint(x: 0.6436, y: 2.1044))
path.addLine(to: CGPoint(x: 1.1187, y: 1.4106))
path.addLine(to: CGPoint(x: 1.746, y: 0.8507))
path.addLine(to: CGPoint(x: 2.4891, y: 0.4573))
path.addLine(to: CGPoint(x: 3.3048, y: 0.2531))
path.addLine(to: CGPoint(x: 4.1456, y: 0.25))
path.addLine(to: CGPoint(x: 4.9628, y: 0.4483))
path.closeSubpath()
}
let vectorTransform = CGAffineTransform(a: 0.9999999606478792, b: 0, c: 0, d: 0.9999998006521496, tx: 0, ty: 0)
vectorPath.applying(vectorTransform).fill(Color(red: 0.8627450980392157, green: 0.14901960784313725, blue: 0.14901960784313725), style: FillStyle(eoFill: false))
}
.frame(width: 156.75399383139765, height: 24.117195192288023, alignment: .topLeading)
.clipped()
.compositingGroup()
.opacity(1)
.rotationEffect(.degrees(0))
}
}
