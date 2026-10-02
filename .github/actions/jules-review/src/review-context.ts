import { RevisionDiffError, revisionArguments } from './revision-diff.js';

export function pinnedCurrentPull<T extends { head: { sha: string }; base: { sha: string } }>(expectedHead: string, pull: T): T {
  revisionArguments(pull.base.sha, expectedHead);
  if (pull.head.sha !== expectedHead)
    throw new RevisionDiffError('PR head changed since the workflow event; no new review session was created. Use the current-head workflow.');
  return pull;
}

export function pinnedPreparedPull<T extends { head: { sha: string }; base: { sha: string } }>(expectedHead: string, expectedBase: string, pull: T): T {
  pinnedCurrentPull(expectedHead, pull);
  if (pull.base.sha !== expectedBase)
    throw new RevisionDiffError('PR base changed during source preparation; no new review session was created. Revalidate the current base before reviewing.');
  return pull;
}

export function completeMergeBase(base: string, head: string, value: unknown): string {
  revisionArguments(base, head);
  if (typeof value !== 'string')
    throw new RevisionDiffError('GitHub did not return a complete merge-base revision; no partial file patches were used.');
  revisionArguments(value, head);
  return value;
}
