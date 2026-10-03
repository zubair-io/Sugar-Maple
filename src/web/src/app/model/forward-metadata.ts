import { z } from 'zod';

const reserved = new Set(['__proto__', 'prototype', 'constructor']);
function assertKeys(value: unknown, depth = 0, active = new Set<object>()): unknown {
  if (!value || typeof value !== 'object') return value;
  if (depth > 64 || active.has(value))
    throw Error('Opaque metadata must be acyclic JSON with at most 64 nested levels');
  active.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (reserved.has(key)) throw Error(`Unsupported metadata key: ${key}`);
    assertKeys(child, depth + 1, active);
  }
  active.delete(value);
  return value;
}
export const ForwardMetadataSchema = z.preprocess((value) => assertKeys(value), z.json());

// Zod deliberately omits __proto__ object keys. Reject them before object parsing
// so a compatible file cannot be silently rewritten without those fields.
export function assertMetadataRecordKeys(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const doc = value as { pages?: unknown; folders?: unknown };
  const records = [
    value,
    ...(Array.isArray(doc.pages) ? doc.pages : []),
    ...(Array.isArray(doc.folders) ? doc.folders : []),
  ];
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    for (const key of Object.keys(record))
      if (reserved.has(key)) throw Error(`Unsupported metadata key: ${key}`);
  }
}
