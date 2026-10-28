import { test, expect } from 'bun:test';
import { maximumCheckpointBytes } from '../src/app/model/persistence-limits';

test('browser import and native save/read use the same checkpoint byte limit', async () => {
  const native = await Bun.file(new URL('../../../src/apple/Sugar Maple/DocumentPackage.swift', import.meta.url)).text();
  const declared = native.match(/static let maximumCheckpointBytes = ([\d_]+)/);
  expect(declared).not.toBeNull();
  expect(Number(declared![1].replaceAll('_', ''))).toBe(maximumCheckpointBytes);
});
