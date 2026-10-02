import { z } from '../../src/web/node_modules/zod';
import { webAwesomeManifest as manifest } from '../../src/web/src/app/model/bundled-library';
import { LibraryPropsSchema, libraryProps } from '../../src/web/src/app/model/library-schema';

export const PROTOCOL = 1;
export const MAX_PACKET_BYTES = 262144;
const session = z.string().uuid(), revision = z.number().int().min(0).max(2147483647);
const component = z.object({ variant: z.string().max(80), props: LibraryPropsSchema }).strict();
export const PropsSchema = z.object({ Button: component, Input: component, Card: component }).strict();
export type PreviewProps = z.infer<typeof PropsSchema>;
export const SnapshotSchema = z.object({ version: z.literal(PROTOCOL), session, revision, kind: z.literal('render'), props: PropsSchema }).strict();
export const EventSchema = z.discriminatedUnion('kind', [
  z.object({ version: z.literal(PROTOCOL), session, kind: z.literal('ready') }).strict(),
  z.object({ version: z.literal(PROTOCOL), session, revision, kind: z.literal('rendered') }).strict(),
  z.object({ version: z.literal(PROTOCOL), session, revision, kind: z.literal('action'), component: z.literal('Button') }).strict(),
  z.object({ version: z.literal(PROTOCOL), session, revision, kind: z.literal('change'), component: z.literal('Input'), value: z.string().max(20000) }).strict(),
  z.object({ version: z.literal(PROTOCOL), session, revision, kind: z.literal('error'), code: z.enum(['invalid_props', 'stale_revision', 'runtime_error']), message: z.string().max(200) }).strict(),
]);
export type PreviewEvent = z.infer<typeof EventSchema>;
export function boundedPacket(value: unknown) {
  if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_PACKET_BYTES) throw Error('Preview packet exceeds 256 KB');
  return value;
}
export function validateProps(value: unknown): PreviewProps {
  const props = PropsSchema.parse(boundedPacket(value));
  for (const key of ['Button', 'Input', 'Card'] as const) libraryProps(manifest.components[key], props[key]);
  return props;
}
export function effectiveProps(value: unknown) {
  const props = validateProps(value);
  return Object.fromEntries((['Button', 'Input', 'Card'] as const).map(key => [key, libraryProps(manifest.components[key], props[key])])) as Record<'Button' | 'Input' | 'Card', Record<string, string | number | boolean>>;
}
export function fixtureProps(): PreviewProps {
  return { Button: { variant: 'Default', props: { label: 'Save & Continue' } },
    Input: { variant: 'Default', props: { label: 'Email', value: 'consumer@example.test' } },
    Card: { variant: 'Default', props: { padding: 24 } } };
}
