import { embeddedAsset } from '../model/assets';
import { parseRepeatData, type RepeatData } from '../model/repeat-data';

export interface RepeatFile {
  file: File;
  path: string;
}
interface DropEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?: (success: (file: File) => void, failure: (error: unknown) => void) => void;
  createReader?: () => {
    readEntries: (
      success: (entries: DropEntry[]) => void,
      failure: (error: unknown) => void,
    ) => void;
  };
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const repeatFileList = (files: Iterable<File>): RepeatFile[] =>
  [...files].map((file) => ({ file, path: file.webkitRelativePath || file.name }));
function active(signal?: AbortSignal) {
  if (signal?.aborted) throw Error('Import cancelled');
}
/** Only user-dropped entries are traversed; no path is used for filesystem access. */
export async function collectRepeatDrop(
  transfer: DataTransfer,
  signal?: AbortSignal,
): Promise<RepeatFile[]> {
  // Copy the protected drag store synchronously, before the first await.
  const roots = [...transfer.items]
    .filter((item) => item.kind === 'file')
    .map((item) => ({
      entry:
        (
          item as DataTransferItem & { webkitGetAsEntry?: () => DropEntry | null }
        ).webkitGetAsEntry?.() ?? null,
      file: item.getAsFile(),
    }));
  const fallback = repeatFileList(transfer.files),
    files: RepeatFile[] = [],
    deadline = performance.now() + 5000;
  let visited = 0;
  async function read<T>(
    start: (resolve: (value: T) => void, reject: (reason: unknown) => void) => void,
  ): Promise<T> {
    active(signal);
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw Error('Image folder read timed out');
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => finish(undefined, Error('Image folder read timed out')),
        remaining,
      );
      const abort = () => finish(undefined, Error('Import cancelled'));
      function finish(value?: T, error?: unknown) {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        error ? reject(error) : resolve(value!);
      }
      signal?.addEventListener('abort', abort, { once: true });
      try {
        start(
          (value) => finish(value),
          (error) => finish(undefined, error),
        );
      } catch (error) {
        finish(undefined, error);
      }
    });
  }
  async function visit(entry: DropEntry, depth: number) {
    active(signal);
    if (++visited > 1000 || depth > 8)
      throw Error('Image folder exceeds 1,000 entries or eight nested folders');
    if (entry.isFile) {
      if (entry.name === '.DS_Store') return;
      if (!entry.file) throw Error('Dropped file cannot be read; use Choose files');
      const file = await read<File>((yes, no) => entry.file!(yes, no));
      files.push({ file, path: entry.fullPath || file.name });
      if (files.length > 101) throw Error('Choose at most one data file and 100 local images');
    } else if (entry.isDirectory && entry.createReader) {
      const reader = entry.createReader();
      while (true) {
        const entries = await read<DropEntry[]>((yes, no) => reader.readEntries(yes, no));
        if (!entries.length) break;
        for (const child of entries) await visit(child, depth + 1);
      }
    } else throw Error('Dropped folder cannot be read; use Choose image folder');
  }
  if (!roots.length) return fallback;
  for (const root of roots) {
    if (root.entry?.isDirectory) await visit(root.entry, 0);
    else if (root.file) files.push({ file: root.file, path: root.file.name });
    else if (root.entry) await visit(root.entry, 0);
    else throw Error('Dropped folder cannot be read; use Choose image folder');
  }
  return files;
}
const imageTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
export interface RepeatFileStage {
  images: Record<string, string>;
  imageNames: string[];
  data?: RepeatData;
  text?: string;
  format?: 'csv' | 'json';
}
/** Validate the complete supplied batch before replacing any staged import UI. */
export async function readRepeatFiles(
  supplied: RepeatFile[],
  signal?: AbortSignal,
): Promise<RepeatFileStage> {
  active(signal);
  const files = supplied
    .filter(({ file }) => file.name !== '.DS_Store')
    .sort((a, b) => compare(a.file.name, b.file.name));
  if (!files.length) throw Error('Choose a CSV, JSON or text file, or PNG, JPEG or WebP images');
  if (files.length > 101) throw Error('Choose at most one data file and 100 local images');
  const dataFiles = files.filter(({ file }) => /\.(csv|json|txt)$/i.test(file.name)),
    images = files.filter((item) => !dataFiles.includes(item));
  if (dataFiles.length > 1) throw Error('Choose one CSV, JSON or text data file');
  if (images.length > 100) throw Error('Choose at most 100 local images');
  const names = new Set<string>();
  let total = 0;
  for (const { file } of files) {
    if (
      !file.name ||
      /[\\/]/.test(file.name) ||
      ['.', '..', '__proto__', 'constructor', 'prototype'].includes(file.name)
    )
      throw Error('Choose files with plain unique local filenames');
    if (names.has(file.name)) throw Error('Duplicate image filename: ' + file.name);
    names.add(file.name);
  }
  for (const { file } of images) {
    const type = imageTypes[file.name.split('.').at(-1)!.toLowerCase()];
    if (!type || (file.type && file.type !== type) || file.size > 5_000_000)
      throw Error('Choose PNG, JPEG or WebP images at most 5 MB each');
    total += file.size;
  }
  if (total > 8_000_000) throw Error('Chosen images exceed 8 MB');
  const result: RepeatFileStage = { images: {}, imageNames: images.map(({ file }) => file.name) };
  const dataFile = dataFiles[0]?.file;
  if (dataFile) {
    if (dataFile.size > 1_000_000) throw Error('Data file exceeds 1 MB');
    const source = await dataFile.text();
    active(signal);
    const textList = /\.txt$/i.test(dataFile.name);
    result.format = /\.csv$/i.test(dataFile.name) ? 'csv' : 'json';
    let lines = source.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
    if (lines.at(-1) === '') lines = lines.slice(0, -1);
    result.text = textList ? JSON.stringify(lines.map((text) => ({ text }))) : source;
    result.data = parseRepeatData(result.text, result.format);
  }
  for (const { file } of images) {
    active(signal);
    const bytes = new Uint8Array(await file.arrayBuffer());
    active(signal);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    const type = imageTypes[file.name.split('.').at(-1)!.toLowerCase()],
      source = 'data:' + type + ';base64,' + btoa(binary);
    embeddedAsset(source);
    result.images[file.name] = source;
  }
  return result;
}
export function orderedImageData(names: string[]) {
  return { fields: ['image'], rows: names.map((image) => ({ image })) };
}
