import type { SceneNode } from './schema';
export const controlLabel = (n: SceneNode) => n.accessibleLabel || (n.kind === 'button' ? n.text || n.name : n.name);
export const hasPrototypeAction = (n: SceneNode) => !!n.targetId || n.prototypeAction !== 'navigate';
export function inputDisplay(n: SceneNode) {
  if (!n.initialValue) return n.text;
  return n.inputType === 'password' ? '•'.repeat(Array.from(n.initialValue).length) : n.initialValue;
}
