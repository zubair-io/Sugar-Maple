import { test, expect, spyOn } from 'bun:test';
import {
  collectRepeatDrop,
  readRepeatFiles,
  repeatFileList,
  orderedImageData,
} from '../src/app/canvas/repeat-files';
import { pixel } from '../../../tools/repeat-fixture';
const image = (name: string) =>
  new File([Uint8Array.from(atob(pixel.split(',')[1]), (c) => c.charCodeAt(0))], name, {
    type: 'image/png',
  });
const data = (name: string, text: string) => new File([text], name, { type: 'text/plain' });

test('dropped CSV/JSON and text lists keep strict fields and authored line content', async () => {
  expect(
    (await readRepeatFiles(repeatFileList([data('people.csv', 'title\nFirst\nSecond')]))).data,
  ).toEqual({ fields: ['title'], rows: [{ title: 'First' }, { title: 'Second' }] });
  expect(
    (await readRepeatFiles(repeatFileList([data('people.json', '[{"title":"First"}]')]))).data
      ?.rows,
  ).toEqual([{ title: 'First' }]);
  expect(
    (await readRepeatFiles(repeatFileList([data('labels.txt', '  First  \r\nSecond\n')]))).data,
  ).toEqual({ fields: ['text'], rows: [{ text: '  First  ' }, { text: 'Second' }] });
});
test('ordered images use deterministic filename order, shared bytes and explicit image fields', async () => {
  const result = await readRepeatFiles(repeatFileList([image('02.png'), image('01.png')]));
  expect(result.imageNames).toEqual(['01.png', '02.png']);
  const nested = await readRepeatFiles([
    { file: image('02.png'), path: '/A/02.png' },
    { file: image('01.png'), path: '/B/01.png' },
  ]);
  expect(nested.imageNames).toEqual(['01.png', '02.png']);
  expect(result.images['01.png']).toBe(pixel);
  expect(orderedImageData(result.imageNames)).toEqual({
    fields: ['image'],
    rows: [{ image: '01.png' }, { image: '02.png' }],
  });
  const combined = await readRepeatFiles(
    repeatFileList([image('01.png'), data('people.csv', 'photo\n01.png')]),
  );
  expect(combined.data?.rows).toEqual([{ photo: '01.png' }]);
  expect(combined.imageNames).toEqual(['01.png']);
});
test('ambiguous, unsupported, malformed and oversized batches reject before returning staged content', async () => {
  for (const files of [
    [image('same.png'), image('same.png')],
    [data('a.csv', 'title\nFirst'), data('b.json', '[]')],
    [image('01.png'), data('script.js', 'alert(1)')],
    [image('01.png'), data('bad.json', '[{"title":7}]')],
    [data('large.csv', 'x'.repeat(1_000_001))],
    [new File(['not image bytes'], 'bad.png', { type: 'image/png' })],
    Array.from({ length: 101 }, (_, i) => image(i + '.png')),
  ]) {
    await expect(readRepeatFiles(repeatFileList(files))).rejects.toThrow();
  }
});
test('directory drops exhaust fragmented entry batches and ignore only macOS folder metadata', async () => {
  const fileEntry = (file: File) => ({
    isFile: true,
    isDirectory: false,
    name: file.name,
    fullPath: '/Images/' + file.name,
    file: (yes: any) => yes(file),
  });
  const batches = [
    [fileEntry(image('02.png'))],
    [fileEntry(data('.DS_Store', 'metadata')), fileEntry(image('01.png'))],
    [],
  ];
  const directory = {
    isFile: false,
    isDirectory: true,
    name: 'Images',
    fullPath: '/Images',
    createReader: () => ({ readEntries: (yes: any) => yes(batches.shift()!) }),
  };
  const transfer: any = {
    files: [],
    items: [{ kind: 'file', getAsFile: () => null, webkitGetAsEntry: () => directory }],
  };
  const result = await readRepeatFiles(await collectRepeatDrop(transfer));
  expect(result.imageNames).toEqual(['01.png', '02.png']);
  expect(batches).toHaveLength(0);
});
test('directory cancellation stops a pending reader without staging data', async () => {
  const controller = new AbortController();
  const directory = {
    isFile: false,
    isDirectory: true,
    name: 'Images',
    fullPath: '/Images',
    createReader: () => ({ readEntries: () => {} }),
  };
  const transfer: any = {
    files: [],
    items: [{ kind: 'file', getAsFile: () => null, webkitGetAsEntry: () => directory }],
  };
  const pending = collectRepeatDrop(transfer, controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow('cancelled');
});
test('directories honor depth limits and file-only drag stores retain a local fallback', async () => {
  const nested = (depth: number): any => ({
    isFile: false,
    isDirectory: true,
    name: 'nested',
    fullPath: '/nested',
    createReader: () => {
      let sent = false;
      return {
        readEntries: (yes: any) => {
          yes(sent ? [] : [nested(depth + 1)]);
          sent = true;
        },
      };
    },
  });
  await expect(
    collectRepeatDrop({
      files: [],
      items: [{ kind: 'file', getAsFile: () => null, webkitGetAsEntry: () => nested(0) }],
    } as any),
  ).rejects.toThrow('eight');
  const file = image('fallback.png');
  expect(await collectRepeatDrop({ items: [], files: [file] } as any)).toEqual([
    { file, path: file.name },
  ]);
});

function clockFixture() {
  const file = image('clock.png');
  const entry = {
    isFile: true,
    isDirectory: false,
    name: file.name,
    fullPath: '/Images/' + file.name,
    file: (yes: any) => yes(file),
  };
  const batches = [[entry], []];
  const directory = {
    isFile: false,
    isDirectory: true,
    name: 'Images',
    fullPath: '/Images',
    createReader: () => ({ readEntries: (yes: any) => yes(batches.shift()!) }),
  };
  return {
    file,
    transfer: {
      files: [],
      items: [{ kind: 'file', getAsFile: () => null, webkitGetAsEntry: () => directory }],
    } as any,
  };
}

test('directory traversal tolerates wall-clock changes while monotonic time remains within budget', async () => {
  const { file, transfer } = clockFixture();
  let wallClock = 0;
  const clock = spyOn(Date, 'now').mockImplementation(() => (wallClock += 60_000));
  try {
    expect(await collectRepeatDrop(transfer)).toEqual([{ file, path: '/Images/clock.png' }]);
  } finally {
    clock.mockRestore();
  }
});

test('directory traversal still rejects when its shared monotonic budget expires', async () => {
  const { transfer } = clockFixture();
  const clock = spyOn(performance, 'now')
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(0)
    .mockReturnValue(5001);
  try {
    await expect(collectRepeatDrop(transfer)).rejects.toThrow('timed out');
  } finally {
    clock.mockRestore();
  }
});
