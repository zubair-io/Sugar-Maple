import { DocumentStore } from '../src/web/src/app/model/store';
import { blankDocument, NodeSchema } from '../src/web/src/app/model/schema';
import { embeddedAsset } from '../src/web/src/app/model/assets';

// 10 complete, mixed 20-node cards remain visible at the editor's initial camera.
// The other cards are on the same page, far outside that camera (not hidden).
export function canvasBenchmarkFixture(total: 1000 | 10000) {
  const document = blankDocument('Canvas engine benchmark');
  document.id = `benchmark-${total}`;
  document.pages[0].id = 'benchmark-page';
  const pageId = document.pages[0].id;
  // 16×16 RGBA blue/white checker, valid chunk CRCs (not a permissively
  // decoded one-pixel PNG). The pixels make image work visible in captures.
  const image = embeddedAsset('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAK0lEQVR4nGNQTX79HxmjA0LyDMPAAFI1oMsPBwMGPhYG3gBSNQzCaKTUAABYeTcur975JwAAAABJRU5ErkJggg==');
  document.assets[image.key] = image.source;
  const kinds = ['text', 'button', 'input', 'ellipse', 'rectangle', 'image', 'path'] as const;
  for (let card = 0; card < total / 20; card++) {
    const visible = card < 10;
    const id = `card-${card}`;
    document.nodes.push(NodeSchema.parse({
      id, pageId, kind: 'frame', name: `Card ${card}`, padding: 6, gap: 6,
      layout: 'grid', columns: 3, width: 176, height: 366,
      x: visible ? 30 + (card % 5) * 184 : 3000 + (card % 100) * 184,
      y: visible ? 30 + Math.floor(card / 5) * 374 : Math.floor(card / 100) * 374,
      fill: '#f4f4f5', strokeWidth: 1, radius: 4,
    }));
    for (let child = 0; child < 19; child++) {
      const kind = kinds[child % kinds.length];
      document.nodes.push(NodeSchema.parse({
        id: `${id}-${child}`, parentId: id, pageId, kind, name: `${kind} ${card}/${child}`,
        width: 50, height: 44, widthMode: 'fill', padding: 0, fontSize: 10,
        fontFamily: 'Maple Sans', text: kind === 'text' ? 'Hello\nMaple' : 'Go',
        initialValue: kind === 'input' ? 'Draft' : '', accessibleLabel: 'Example field',
        fill: kind === 'button' ? '#2563eb' : '#ffffff', color: kind === 'button' ? '#ffffff' : '#18181b',
        stroke: '#71717a', strokeWidth: kind === 'path' ? 2 : 1, radius: 3,
        asset: kind === 'image' ? image.reference : '',
        pathData: kind === 'path' ? 'M 5 80 L 45 20 L 95 80' : '',
      }));
    }
  }
  const checkpoint = new DocumentStore(document).checkpoint();
  if (checkpoint.document.nodes.length !== total) throw Error('Benchmark fixture count differs');
  return checkpoint;
}

if (import.meta.main) {
  for (const total of [1000, 10000] as const)
    await Bun.write(`build/canvas-engine-benchmark/fixture-${total}.json`, JSON.stringify(canvasBenchmarkFixture(total)));
}
