import { uid, type Operation, type SceneDocument } from './schema';
/** Actor labels reflect the command origin, not client-supplied identity claims. */
export function applyComment(
  doc: SceneDocument,
  op: Operation,
  ids: string[],
  author: 'human' | 'agent',
) {
  if (!['comment.add', 'comment.reply', 'comment.resolve'].includes(op.type)) return false;
  const now = new Date().toISOString();
  if (op.type === 'comment.add') {
    const id = op.id ?? uid();
    doc.comments.push({
      id,
      pageId: op.pageId,
      createdAt: now,
      messages: [{ id: uid(), text: op.text, author, createdAt: now }],
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
    });
    ids.push(id);
    return true;
  }
  if (op.type === 'comment.reply' || op.type === 'comment.resolve') {
    const thread = doc.comments.find((c) => c.id === op.id);
    if (!thread) throw Error('Comment not found');
    if (op.type === 'comment.reply') {
      thread.messages.push({ id: uid(), text: op.text, author, createdAt: now });
      thread.resolved = false;
      thread.resolvedBy = null;
      thread.resolvedAt = null;
    } else {
      thread.resolved = op.resolved;
      thread.resolvedBy = op.resolved ? author : null;
      thread.resolvedAt = op.resolved ? now : null;
    }
    return true;
  }
  return false;
}
