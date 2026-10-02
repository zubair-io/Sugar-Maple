import { test, expect } from 'bun:test';
import { fixtureProps, effectiveProps, validateProps, EventSchema, SnapshotSchema, boundedPacket } from './contract';
test('preview shares the real pinned manifest types, variants and bounds', () => {
  const props = fixtureProps(); props.Button.variant = 'Primary';
  expect(effectiveProps(props).Button.variant).toBe('brand');
  props.Button.props.disabled = 'false'; expect(() => validateProps(props)).toThrow();
  props.Button.props.disabled = false; props.Card.props.padding = 101; expect(() => validateProps(props)).toThrow();
  props.Card.props.padding = 24; props.Input.props.value = 'two\nlines'; expect(() => validateProps(props)).toThrow();
});
test('preview messages reject privileged methods, paths, extra keys, wrong versions and unbounded payloads', () => {
  const event = { version: 1, session: crypto.randomUUID(), revision: 0, kind: 'action', component: 'Button' };
  expect(EventSchema.parse(event)).toEqual(event);
  for (const extra of [{ method: 'transaction.apply' }, { file: '/private/document' }, { args: {} }, { version: 2 }, { revision: -1 }])
    expect(() => EventSchema.parse({ ...event, ...extra })).toThrow();
  expect(() => SnapshotSchema.parse({ ...event, kind: 'render', props: fixtureProps(), file: '/private/document' })).toThrow();
  expect(() => boundedPacket({ source: 'x'.repeat(262145) })).toThrow('256 KB');
});
