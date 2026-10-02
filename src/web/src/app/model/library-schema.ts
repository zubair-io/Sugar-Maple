import { z } from 'zod';

const safeName = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .refine((v) => !['constructor', 'prototype', '__proto__'].includes(v));
const identifier = z
  .string()
  .max(80)
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/);
const packageName = z
  .string()
  .max(160)
  .regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/);
const version = z
  .string()
  .max(40)
  .regex(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/);
export const LibraryKeySchema = z
  .string()
  .max(128)
  .regex(/^[a-z][a-z0-9-]*@\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/);
export const LibraryValueSchema = z.union([
  z.string().max(20000),
  z.number().finite().min(-100000).max(100000),
  z.boolean(),
]);
export const LibraryPropsSchema = z
  .record(safeName, LibraryValueSchema)
  .refine((v) => Object.keys(v).length <= 100, 'At most 100 properties');
export const LibraryBindingSchema = z.enum([
  'text',
  'initialValue',
  'accessibleLabel',
  'disabled',
  'inputType',
  'fill',
  'color',
  'radius',
  'padding',
  'gap',
  'fontSize',
]);
const propertyCommon = {
  semantic: LibraryBindingSchema.nullable(),
  webAttribute: z
    .string()
    .max(80)
    .regex(/^[a-z][a-z0-9-]*$/)
    .nullable(),
};
export const LibraryPropertySchema = z.discriminatedUnion('type', [
  z
    .object({
      ...propertyCommon,
      type: z.literal('string'),
      default: z.string().max(20000),
      maxLength: z.number().int().min(1).max(20000),
    })
    .strict(),
  z.object({ ...propertyCommon, type: z.literal('boolean'), default: z.boolean() }).strict(),
  z
    .object({
      ...propertyCommon,
      type: z.literal('number'),
      default: z.number().finite(),
      min: z.number().finite().min(-100000),
      max: z.number().finite().max(100000),
    })
    .strict(),
  z
    .object({
      ...propertyCommon,
      type: z.literal('enum'),
      default: z.string().max(200),
      values: z.array(z.string().min(1).max(200)).min(1).max(50),
    })
    .strict(),
]);
export const LibraryComponentSchema = z
  .object({
    name: z.string().min(1).max(120),
    semanticKind: z.enum(['button', 'input', 'frame']),
    width: z.number().min(1).max(10000),
    height: z.number().min(1).max(10000),
    props: z.record(safeName, LibraryPropertySchema),
    slots: z
      .array(
        z
          .string()
          .max(80)
          .regex(/^(?:[a-z][a-z0-9-]*)?$/),
      )
      .max(20),
    variants: z.record(safeName, LibraryPropsSchema),
    defaultVariant: safeName,
    web: z
      .object({
        tag: z
          .string()
          .max(80)
          .regex(/^[a-z][a-z0-9]*-[a-z0-9-]+$/),
        symbol: identifier,
        styleBindings: z
          .record(
            z
              .string()
              .max(100)
              .regex(/^--[a-z][a-z0-9-]*$/),
            z.enum(['padding', 'gap', 'radius', 'fill', 'color', 'fontSize']),
          )
          .default({}),
        module: z
          .string()
          .max(250)
          .regex(/^[a-zA-Z0-9@_.\/-]+$/),
      })
      .strict()
      .nullable(),
    swift: z
      .object({
        module: z.literal('SwiftUI'),
        symbol: z.enum(['Button', 'TextField', 'VStack']),
        adapter: z.enum(['button', 'input', 'card']),
        platforms: z
          .array(z.enum(['macOS', 'iOS']))
          .min(1)
          .max(2),
        supportedVariants: z.array(safeName).min(1).max(50),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const LibraryManifestSchema = z
  .object({
    manifestVersion: z.literal(1),
    revision: version,
    id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9-]*$/),
    name: z.string().min(1).max(120),
    package: z.object({ name: packageName, version }).strict(),
    dependencies: z.record(packageName, version),
    webStyles: z
      .array(
        z
          .string()
          .max(250)
          .regex(/^[a-zA-Z0-9@_.\/-]+$/),
      )
      .max(20)
      .default([]),
    swiftSDK: z
      .object({
        name: z.literal('SwiftUI'),
        version: z
          .string()
          .min(1)
          .max(80)
          .regex(/^[A-Za-z0-9 ._-]+$/),
      })
      .strict()
      .nullable(),
    tokenMappings: z.record(
      z
        .string()
        .max(100)
        .regex(/^--[a-z][a-z0-9-]*$/),
      z
        .string()
        .max(128)
        .regex(/^[\w.-]+$/),
    ),
    components: z.record(safeName, LibraryComponentSchema),
  })
  .strict();
export const LibraryReferenceSchema = z
  .object({
    key: LibraryKeySchema,
    component: safeName,
    props: LibraryPropsSchema,
    variant: safeName,
    localOverrides: z.array(LibraryBindingSchema).max(20),
    tokenBindings: z
      .record(
        z
          .string()
          .max(100)
          .regex(/^--[a-z][a-z0-9-]*$/),
        z
          .string()
          .max(128)
          .regex(/^[\w.-]+$/),
      )
      .default({}),
  })
  .strict();
export type LibraryManifest = z.infer<typeof LibraryManifestSchema>;
export type LibraryComponent = z.infer<typeof LibraryComponentSchema>;
export type LibraryReference = z.infer<typeof LibraryReferenceSchema>;
export type LibraryValue = z.infer<typeof LibraryValueSchema>;
export const libraryKey = (manifest: LibraryManifest) => `${manifest.id}@${manifest.revision}`;
function canonical(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}
export const sameManifest = (a: LibraryManifest, b: LibraryManifest) =>
  canonical(a) === canonical(b);
export function validateLibraryProps(
  component: LibraryComponent,
  values: Record<string, LibraryValue>,
) {
  for (const [name, value] of Object.entries(values)) {
    const prop = component.props[name];
    if (!prop) throw Error('Unknown library property: ' + name);
    if (
      prop.type === 'enum'
        ? typeof value !== 'string' || !prop.values.includes(value)
        : typeof value !== prop.type
    )
      throw Error('Invalid type/value for library property: ' + name);
    if (prop.type === 'string' && (value as string).length > prop.maxLength)
      throw Error('Library string is too long: ' + name);
    if (prop.type === 'number' && ((value as number) < prop.min || (value as number) > prop.max))
      throw Error('Library number is out of range: ' + name);
    const field = prop.semantic;
    if (
      (field === 'fill' || field === 'color') &&
      (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value))
    )
      throw Error('Library color must be a six-digit hex value');
    if (field === 'inputType' && !['text', 'email', 'password'].includes(String(value)))
      throw Error('Unsupported semantic input type');
    if (field === 'initialValue' && /[\r\n]/.test(String(value)))
      throw Error('Input values are single-line');
    if (field && ['radius', 'padding', 'gap', 'fontSize'].includes(field)) {
      const [min, max] =
        field === 'radius' ? [0, 500] : field === 'fontSize' ? [6, 500] : [0, 1000];
      if ((value as number) < min || (value as number) > max)
        throw Error('Unsupported semantic numeric range');
    }
    if (field === 'accessibleLabel' && String(value).length > 200)
      throw Error('Accessible labels are limited to 200 characters');
  }
}
export function libraryProps(
  component: LibraryComponent,
  ref: Pick<LibraryReference, 'props' | 'variant'>,
) {
  if (!Object.hasOwn(component.variants, ref.variant))
    throw Error('Unknown library variant: ' + ref.variant);
  validateLibraryProps(component, ref.props);
  return {
    ...Object.fromEntries(
      Object.entries(component.props).map(([name, prop]) => [name, prop.default]),
    ),
    ...component.variants[ref.variant],
    ...ref.props,
  };
}
export function validateManifest(value: unknown): LibraryManifest {
  const m = LibraryManifestSchema.parse(value);
  LibraryKeySchema.parse(libraryKey(m));
  if (
    Object.keys(m.components).length < 1 ||
    Object.keys(m.components).length > 100 ||
    Object.keys(m.dependencies).length > 50 ||
    Object.keys(m.tokenMappings).length > 100
  )
    throw Error('Library exceeds component/dependency/token limits');
  if (new TextEncoder().encode(JSON.stringify(m)).length > 1_000_000)
    throw Error('Library manifest exceeds 1 MB');
  if (Object.hasOwn(m.dependencies, m.package.name))
    throw Error('Package cannot declare itself as a dependency');
  for (const path of m.webStyles)
    if (
      !path.startsWith(m.package.name + '/') ||
      path.includes('..') ||
      path.includes('//') ||
      !path.endsWith('.css')
    )
      throw Error('Styles must be .css files within the pinned package');
  for (const c of Object.values(m.components)) {
    if (!c.web && !c.swift) throw Error('Component needs a supported platform mapping');
    if (
      c.web &&
      (!c.web.module.startsWith(m.package.name + '/') ||
        c.web.module.includes('..') ||
        c.web.module.includes('//') ||
        !c.web.module.endsWith('.js'))
    )
      throw Error('Web imports must be .js modules within the pinned package');
    if (
      c.swift &&
      (!m.swiftSDK ||
        ({ button: 'Button', input: 'TextField', card: 'VStack' } as const)[c.swift.adapter] !==
          c.swift.symbol ||
        ({ button: 'button', input: 'input', card: 'frame' } as const)[c.swift.adapter] !==
          c.semanticKind)
    )
      throw Error('Unsupported SwiftUI mapping or missing SDK identity');
    if (
      Object.keys(c.props).length > 100 ||
      Object.keys(c.variants).length < 1 ||
      Object.keys(c.variants).length > 50 ||
      !Object.hasOwn(c.variants, c.defaultVariant)
    )
      throw Error('Invalid library properties/variants');
    if (
      new Set(c.slots).size !== c.slots.length ||
      (c.semanticKind !== 'frame' && c.slots.some((slot) => slot !== ''))
    )
      throw Error('Unsupported or duplicate slots');
    if (
      c.swift &&
      (new Set(c.swift.supportedVariants).size !== c.swift.supportedVariants.length ||
        c.swift.supportedVariants.some((name) => !Object.hasOwn(c.variants, name)))
    )
      throw Error('Unknown or duplicate native variant');
    const bindings = new Set<string>(),
      attributes = new Set<string>();
    for (const p of Object.values(c.props)) {
      if (p.semantic) {
        if (bindings.has(p.semantic)) throw Error('Duplicate semantic binding');
        bindings.add(p.semantic);
        const expected =
          p.semantic === 'disabled'
            ? 'boolean'
            : ['radius', 'padding', 'gap', 'fontSize'].includes(p.semantic)
              ? 'number'
              : 'string';
        if (p.type !== expected && !(expected === 'string' && p.type === 'enum'))
          throw Error('Incompatible semantic property type');
      }
      if (p.webAttribute) {
        if (
          ![
            'label',
            'type',
            'placeholder',
            'value',
            'disabled',
            'readonly',
            'required',
            'variant',
            'appearance',
            'size',
            'name',
            'with-clear',
            'pill',
            'orientation',
            'caption',
            'header',
            'tabindex',
            'aria-label',
          ].includes(p.webAttribute)
        )
          throw Error('Unsupported web attribute: ' + p.webAttribute);
        if (attributes.has(p.webAttribute)) throw Error('Duplicate web property attribute');
        attributes.add(p.webAttribute);
      }
      if (p.type === 'number' && p.min > p.max) throw Error('Invalid property bounds');
      if (p.type === 'enum' && new Set(p.values).size !== p.values.length)
        throw Error('Duplicate enum values');
    }
    validateLibraryProps(
      c,
      Object.fromEntries(Object.entries(c.props).map(([name, p]) => [name, p.default])),
    );
    for (const values of Object.values(c.variants)) validateLibraryProps(c, values);
  }
  return m;
}
export function validateLibraryBindings(doc: {
  libraries: Record<string, LibraryManifest>;
  nodes: Array<{
    id: string;
    parentId: string | null;
    kind: string;
    libraryRef: LibraryReference | null;
    librarySlot: string;
  }>;
}) {
  if (Object.keys(doc.libraries).length > 50) throw Error('At most 50 pinned library versions');
  for (const [key, manifest] of Object.entries(doc.libraries))
    if (libraryKey(validateManifest(manifest)) !== key)
      throw Error('Library key/version does not match its manifest');
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  for (const node of doc.nodes) {
    if (node.libraryRef) {
      const m = doc.libraries[node.libraryRef.key];
      // Missing metadata retains an editable semantic node. It never causes code execution.
      if (m) {
        const c = m.components[node.libraryRef.component];
        if (!c || c.semanticKind !== node.kind)
          throw Error('Missing or incompatible library component');
        libraryProps(c, node.libraryRef);
        for (const variable of Object.keys(node.libraryRef.tokenBindings))
          if (!Object.hasOwn(m.tokenMappings, variable))
            throw Error('Unknown library token binding');
        if (new Set(node.libraryRef.localOverrides).size !== node.libraryRef.localOverrides.length)
          throw Error('Duplicate library overrides');
      }
    }
    const parent = nodes.get(node.parentId ?? ''), ref = parent?.libraryRef;
    // Empty string is ordinary content outside a library, but the default slot
    // inside one. A manifest must declare that slot as explicitly as named slots.
    if (node.librarySlot || ref) {
      if (!ref) throw Error('A named library slot needs a library parent');
      const manifest = doc.libraries[ref.key];
      if (manifest && !manifest.components[ref.component].slots.includes(node.librarySlot))
        throw Error('Unknown library slot: ' + node.librarySlot);
    }
  }
}
