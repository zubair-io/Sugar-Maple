import type { SceneDocument, Operation } from './schema';
export function exportTokens(doc: SceneDocument) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(doc.tokens).map(([name, value]) => [
        name,
        {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [
              parseInt(value.slice(1, 3), 16) / 255,
              parseInt(value.slice(3, 5), 16) / 255,
              parseInt(value.slice(5, 7), 16) / 255,
            ],
            alpha: 1,
          },
        },
      ]),
    ),
    null,
    2,
  );
}
export function importTokens(value: unknown): Operation[] {
  const entries = new Map<string, unknown>();
  function walk(group: unknown, prefix: string) {
    if (!group || typeof group !== 'object' || Array.isArray(group))
      throw Error('Invalid token group');
    for (const [key, item] of Object.entries(group)) {
      if (key.startsWith('$')) continue;
      const name = prefix ? prefix + '.' + key : key;
      if (item && typeof item === 'object' && '$value' in item) {
        const token = item as any;
        if (token.$type && token.$type !== 'color')
          throw Error('Only color tokens are currently supported');
        entries.set(name, token.$value);
      } else walk(item, name);
    }
  }
  walk(value, '');
  function resolve(name: string, visited = new Set<string>()): string {
    if (visited.has(name)) throw Error('Token alias cycle');
    visited.add(name);
    const value = entries.get(name);
    if (typeof value === 'string') {
      if (/^#[0-9a-f]{6}$/i.test(value)) return value;
      const alias = value.match(/^\{([\w.-]+)\}$/);
      if (alias) return resolve(alias[1], visited);
    }
    if (value && typeof value === 'object') {
      const v = value as any;
      if (
        v.colorSpace === 'srgb' &&
        Array.isArray(v.components) &&
        v.components.length === 3 &&
        v.components.every((n: unknown) => typeof n === 'number' && n >= 0 && n <= 1) &&
        (v.alpha === undefined || v.alpha === 1)
      )
        return (
          '#' +
          v.components
            .map((n: number) =>
              Math.round(n * 255)
                .toString(16)
                .padStart(2, '0'),
            )
            .join('')
        );
    }
    throw Error('Unsupported color token ' + name + '; use opaque sRGB colors');
  }
  return Array.from(entries.keys()).map((name) => ({
    type: 'token.set',
    name,
    value: resolve(name),
  }));
}
