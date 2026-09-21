import type { SceneNode } from './schema';
export function gradientCSS(g: NonNullable<SceneNode['gradient']>) {
  const stops = g.stops
    .map(
      (s) =>
        `${s.color}${Math.round(s.opacity * 255)
          .toString(16)
          .padStart(2, '0')} ${s.offset * 100}%`,
    )
    .join(', ');
  return g.type === 'linear'
    ? `linear-gradient(${g.angle}deg, ${stops})`
    : `radial-gradient(ellipse ${g.radiusX}% ${g.radiusY}% at ${g.centerX}% ${g.centerY}%, ${stops})`;
}
export function gradientSVG(n: SceneNode): string {
  const g = n.gradient;
  if (!g) return '';
  const id = 'gradient-' + n.id;
  const stops = g.stops
    .map((s) => `<stop offset="${s.offset}" stop-color="${s.color}" stop-opacity="${s.opacity}"/>`)
    .join('');
  if (g.type === 'radial') {
    const x = (n.width * g.centerX) / 100,
      y = (n.height * g.centerY) / 100,
      rx = (n.width * g.radiusX) / 100,
      ry = (n.height * g.radiusY) / 100;
    return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${x}" cy="${y}" r="${rx}" gradientTransform="translate(${x} ${y}) scale(1 ${ry / rx}) translate(${-x} ${-y})">${stops}</radialGradient>`;
  }
  const angle = (g.angle * Math.PI) / 180,
    dx = Math.sin(angle),
    dy = -Math.cos(angle),
    extent = (Math.abs(n.width * dx) + Math.abs(n.height * dy)) / 2;
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n.width / 2 - dx * extent}" y1="${n.height / 2 - dy * extent}" x2="${n.width / 2 + dx * extent}" y2="${n.height / 2 + dy * extent}">${stops}</linearGradient>`;
}
