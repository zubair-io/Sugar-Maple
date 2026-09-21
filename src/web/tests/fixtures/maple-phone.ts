import scenes from './maple-phone-scenes.json';
import type { Operation, SceneNode } from '../../src/app/model/schema';
/** Editable reconstruction of the supplied Maple phone preview, not a bitmap overlay. */
export function maplePhone(pageId: string, prefix = 'maple-phone'): Operation[] {
  const operations: Operation[] = [];
  const add = (key: string, node: Partial<SceneNode> & Pick<SceneNode, 'kind'>) => {
    operations.push({
      type: 'node.add',
      node: {
        id: prefix + '-' + key,
        pageId,
        parentId: prefix + '-screen',
        padding: 0,
        fillEnabled: false,
        ...node,
      },
    });
    return prefix + '-' + key;
  };
  add('screen', {
    kind: 'artboard',
    parentId: null,
    name: 'Maple · Phone preview',
    width: 402,
    height: 874,
    fill: '#141211',
    fillEnabled: true,
  });
  add('time', {
    kind: 'text',
    name: 'Status time',
    text: '9:41',
    x: 24,
    y: 18,
    width: 60,
    height: 17,
    color: '#dedbd8',
    fontSize: 13,
  });
  add('island', {
    kind: 'rectangle',
    name: 'Dynamic island',
    x: 143,
    y: 10,
    width: 116,
    height: 32,
    fill: '#000000',
    fillEnabled: true,
    radius: 16,
  });
  add('status', {
    kind: 'text',
    name: 'Status indicators',
    text: '•••  ▰',
    x: 326,
    y: 18,
    width: 60,
    height: 16,
    color: '#dedbd8',
    fontSize: 11,
  });
  const photo = (
    key: string,
    parentId: string,
    x: number,
    y: number,
    width: number,
    height: number,
    palette: keyof typeof scenes,
  ) => {
    const frame = add(key, {
      kind: 'frame',
      parentId,
      name: 'Photo · ' + palette,
      x,
      y,
      width,
      height,
    });
    const scene = scenes[palette];
    add(key + '-sky', {
      kind: 'rectangle',
      parentId: frame,
      name: 'Sky gradient',
      width,
      height,
      fillEnabled: true,
      gradient: scene.sky as SceneNode['gradient'],
    });
    add(key + '-glow', {
      kind: 'rectangle',
      parentId: frame,
      name: 'Sun glow',
      width,
      height,
      fillEnabled: true,
      gradient: scene.glow as SceneNode['gradient'],
    });
    add(key + '-roof', {
      kind: 'path',
      parentId: frame,
      name: 'Editable skyline',
      y: height * scene.roofTop,
      width,
      height: height * scene.roofHeight,
      fillEnabled: true,
      fill: scene.roofColor,
      viewBox: '0 0 100 100',
      pathData:
        scene.roofPoints.map(([x, y], i) => (i ? 'L' : 'M') + x * 100 + ' ' + y * 100).join(' ') +
        ' Z',
    });
  };
  photo('hero', prefix + '-screen', 16, 311.666667, 370, 246.666667, 'golden');
  add('strip', {
    kind: 'rectangle',
    name: 'Filmstrip surface',
    x: 0,
    y: 752,
    width: 402,
    height: 98,
    fill: '#1c1a18',
    fillEnabled: true,
  });
  (['blue', 'rose', 'golden', 'forest', 'blue'] as const).forEach((color, i) =>
    photo('thumbnail-' + i, prefix + '-screen', 10 + i * 79, 772, 72, 48, color),
  );
  add('selected', {
    kind: 'rectangle',
    name: 'Selected photo border',
    x: 168,
    y: 772,
    width: 72,
    height: 48,
    radius: 3,
    stroke: '#ee7048',
    strokeWidth: 2,
  });
  add('home', {
    kind: 'rectangle',
    name: 'Home indicator',
    x: 133,
    y: 859,
    width: 136,
    height: 4,
    radius: 2,
    fill: '#b7b5b2',
    fillEnabled: true,
  });
  const header = add('header', {
    kind: 'frame',
    name: 'Preview toolbar',
    x: 16,
    y: 70,
    width: 370,
    height: 56,
    radius: 12,
    fill: '#262422',
    fillEnabled: true,
    stroke: '#3e3a37',
    strokeWidth: 1,
  });
  add('filename', {
    kind: 'text',
    parentId: header,
    name: 'Editable filename',
    text: 'IMG_1044.CR3',
    x: 58,
    y: 20,
    width: 170,
    height: 20,
    fontSize: 13,
    color: '#dedbd8',
  });
  add('back', {
    kind: 'path',
    parentId: header,
    name: 'Back icon',
    x: 20,
    y: 16,
    width: 18,
    height: 24,
    viewBox: '0 0 18 24',
    pathData: 'M12 3 L3 12 L12 21',
    stroke: '#dedbd8',
    strokeWidth: 1.6,
  });
  add('edit', {
    kind: 'path',
    parentId: header,
    name: 'Edit icon',
    x: 284,
    y: 16,
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    pathData: 'M2 22 L5 13 L18 1 L23 6 L10 19 Z M15 4 L20 9',
    stroke: '#dedbd8',
    strokeWidth: 1.6,
  });
  add('info', {
    kind: 'ellipse',
    parentId: header,
    name: 'Info outline',
    x: 332,
    y: 18,
    width: 20,
    height: 20,
    stroke: '#dedbd8',
    strokeWidth: 1.5,
  });
  add('info-text', {
    kind: 'text',
    parentId: header,
    name: 'Info label',
    text: 'i',
    x: 340,
    y: 19,
    width: 8,
    height: 20,
    fontSize: 16,
    color: '#dedbd8',
  });
  return operations;
}
