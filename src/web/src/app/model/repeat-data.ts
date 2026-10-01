import { embeddedAsset } from './assets';
import { OperationSchema, type Operation } from './schema';

export interface RepeatData {
  fields: string[];
  rows: Record<string, string>[];
}
const reserved = new Set(['__proto__', 'constructor', 'prototype']);
function fieldName(name: string) {
  if (!name || name.length > 128 || reserved.has(name))
    throw Error('Data field names must be unique, nonempty and at most 128 characters');
  return name;
}
/** Strict CSV: quoted commas/newlines and doubled quotes, exact column counts, no implicit coercion. */
function csv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = '',
    quoted = false,
    closed = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        value += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else value += c;
    } else if (c === '"') {
      if (value || closed) throw Error('Malformed CSV quote');
      quoted = true;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(value);
      value = '';
      closed = false;
      if (c !== ',') {
        rows.push(row);
        row = [];
        if (c === '\r' && source[i + 1] === '\n') i++;
      }
    } else {
      if (closed) throw Error('Unexpected characters after a CSV quote');
      value += c;
    }
    if (value.length > 20000 || row.length > 100 || rows.length > 1001)
      throw Error('Data exceeds 1,000 rows, 100 fields or 20,000 characters per value');
  }
  if (quoted) throw Error('Unterminated CSV quote');
  if (value || row.length || closed) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}
export function parseRepeatData(text: string, format: 'csv' | 'json'): RepeatData {
  if (new TextEncoder().encode(text).length > 1_000_000) throw Error('Data file exceeds 1 MB');
  text = text.replace(/^\uFEFF/, '');
  if (!text.trim()) throw Error('Data is empty');
  let fields: string[], rows: Record<string, string>[];
  if (format === 'csv') {
    const all = csv(text),
      header = all.shift();
    if (!header) throw Error('CSV needs a header row');
    fields = header.map(fieldName);
    if (new Set(fields).size !== fields.length) throw Error('Duplicate CSV field name');
    rows = all.map((values, index) => {
      if (values.length !== fields.length)
        throw Error(`CSV row ${index + 1} has ${values.length} values; expected ${fields.length}`);
      return Object.fromEntries(fields.map((name, i) => [name, values[i]]));
    });
  } else {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw Error('Malformed JSON data');
    }
    if (!Array.isArray(value))
      throw Error('JSON data must be an array of objects with string values');
    const names = new Set<string>();
    rows = value.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        throw Error(`JSON row ${index + 1} must be an object`);
      return Object.fromEntries(
        Object.entries(item).map(([name, value]) => {
          names.add(fieldName(name));
          if (typeof value !== 'string' || value.length > 20000)
            throw Error(
              `JSON row ${index + 1}: ${name} must be a string of at most 20,000 characters`,
            );
          return [name, value];
        }),
      );
    });
    fields = [...names];
  }
  if (!rows.length || !fields.length) throw Error('Data needs at least one field and one row');
  if (rows.length > 1000 || fields.length > 100)
    throw Error('Data exceeds 1,000 rows or 100 fields');
  return { fields, rows };
}
export type RepeatMapping = {
  field: string;
  targetId: string;
  property: 'text' | 'initialValue' | 'asset';
};
/** Filenames are explicit local-file aliases, never URLs or filesystem reads. */
export function repeatImportOperations(
  id: string,
  data: RepeatData,
  fields: RepeatMapping[],
  images: Record<string, string>,
  missing: 'retain' | 'clear' | 'error',
  truncate: boolean,
): Operation[] {
  if (!fields.length) throw Error('Choose at least one field mapping');
  for (const field of fields)
    if (!data.fields.includes(field.field)) throw Error('Unknown data field: ' + field.field);
  for (const field of fields.filter((f) => f.property === 'asset'))
    if (fields.some((f) => f.field === field.field && f.property !== 'asset'))
      throw Error('An image field cannot also map to a text value');
  const assets = new Map<string, string>();
  const rows = data.rows.map((row, index) => {
    const result = { ...row };
    for (const field of fields.filter((f) => f.property === 'asset')) {
      const filename = row[field.field];
      if (!filename) continue;
      if (
        /[\\/]/.test(filename) ||
        filename === '.' ||
        filename === '..' ||
        !Object.hasOwn(images, filename)
      )
        throw Error(`Row ${index + 1}: choose the local image named ${filename}`);
      const asset = embeddedAsset(images[filename]);
      assets.set(asset.key, asset.source);
      result[field.field] = asset.reference;
    }
    return result;
  });
  return [
    ...[...assets]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, source]) => OperationSchema.parse({ type: 'asset.set', key, source })),
    OperationSchema.parse({ type: 'repeat.import', id, rows, fields, missing, truncate }),
  ];
}
