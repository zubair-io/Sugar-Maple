import { digest } from 'lib0/hash/sha256';

export type AssetTable = Record<string, string>;
export const assetKeyPattern = /^sha256-[0-9a-f]{64}$/;
export const assetReferencePattern = /^asset:sha256-[0-9a-f]{64}$/;
const embeddedPattern = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
export function assetSource(document: { assets?: AssetTable }, reference: string): string {
  return reference.startsWith('asset:') ? (document.assets?.[reference.slice(6)] ?? '') : reference;
}
/** Validate the canonical bytes and MIME, then address the bytes rather than the filename. */
export function embeddedAsset(source: string) {
  const match = embeddedPattern.exec(source);
  if (!match || match[2].length > 6_666_668)
    throw Error('Choose an embedded PNG, JPEG or WebP under 5 MB');
  let binary: string;
  try {
    binary = atob(match[2]);
  } catch {
    throw Error('Invalid image base64');
  }
  if (btoa(binary) !== match[2] || binary.length > 5_000_000)
    throw Error('Invalid image base64 or size');
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const png =
    bytes.length >= 33 &&
    bytes.slice(0, 8).every((v, i) => v === [137, 80, 78, 71, 13, 10, 26, 10][i]) &&
    binary.slice(12, 16) === 'IHDR';
  const jpeg =
    bytes.length >= 4 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes.at(-2) === 255 &&
    bytes.at(-1) === 217;
  const webp = bytes.length >= 20 && binary.startsWith('RIFF') && binary.slice(8, 12) === 'WEBP';
  if (!(
    (match[1] === 'png' && png) ||
    (match[1] === 'jpeg' && jpeg) ||
    (match[1] === 'webp' && webp)
  ))
    throw Error('Image bytes do not match the PNG, JPEG or WebP MIME type');
  const key =
    'sha256-' + Array.from(digest(bytes), (v) => v.toString(16).padStart(2, '0')).join('');
  return { key, reference: 'asset:' + key, source, byteLength: bytes.length };
}
export function validateAssets(assets: AssetTable) {
  if (Object.keys(assets).length > 1000) throw Error('Too many embedded images');
  let size = 0;
  for (const [key, source] of Object.entries(assets)) {
    const asset = embeddedAsset(source);
    if (key !== asset.key) throw Error('Image content hash does not match its address');
    size += asset.byteLength;
  }
  if (size > 8_000_000) throw Error('Shared images exceed the 8 MB document image limit');
}
