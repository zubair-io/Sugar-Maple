import { z } from 'zod';
import { validateDocument, type SceneDocument } from './schema';

const envelope = z.object({
  version: z.literal(1), documentId: z.string().min(1).max(128),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  rootId: z.string().min(1).max(128), document: z.unknown(),
}).strict();
export interface PreviewSnapshot {
  version: 1; documentId: string; revision: number; rootId: string; document: SceneDocument;
}
/** A projection feed, never a document store. Only newer snapshots of the same
 * document/root can enter an existing preview session. */
export class PreviewFeed {
  current: PreviewSnapshot | null = null;
  accept(value: unknown): PreviewSnapshot | null {
    const parsed = envelope.parse(value);
    if (this.current && (parsed.documentId !== this.current.documentId || parsed.rootId !== this.current.rootId))
      throw Error('Document changed. Start a new preview.');
    if (this.current && parsed.revision <= this.current.revision) return null;
    const document = validateDocument(parsed.document);
    if (document.id !== parsed.documentId) throw Error('Preview document identity does not match its snapshot.');
    if (!document.nodes.some(n => n.id === parsed.rootId && n.kind === 'artboard' && !n.hidden))
      throw Error('The starting artboard is no longer available.');
    return this.current = { ...parsed, document };
  }
}
