// Fixed-height editor rows. Keep a small overscan and at most two focus/tab-stop pins.
export const LAYER_ROW_HEIGHT = 36;
export function layerWindow(count: number, scrollTop: number, height: number, pins: readonly number[] = []) {
  const first = Math.max(0, Math.min(count, Math.floor(scrollTop / LAYER_ROW_HEIGHT) - 8));
  const end = Math.min(count, Math.ceil((scrollTop + height) / LAYER_ROW_HEIGHT) + 8);
  const indices = new Set<number>();
  for (let index = first; index < end; index++) indices.add(index);
  for (const pin of pins) if (pin >= 0 && pin < count) indices.add(pin);
  return [...indices].sort((a, b) => a - b);
}
