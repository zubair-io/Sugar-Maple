import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReviewDiffBudgetError } from './diff.js';

export class RevisionDiffError extends Error {}
const validRevision = (value: string) => /^[a-f0-9]{40}$/i.test(value);

export function revisionArguments(base: string, head: string) {
  if (!validRevision(base) || !validRevision(head))
    throw new RevisionDiffError('Exact revision diff requires two full commit SHA values.');
  return ['diff', '--no-color', '--no-ext-diff', '--no-textconv', base, head, '--'];
}

export function gitAuthentication(token: string, environment: NodeJS.ProcessEnv = process.env) {
  const authorization = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
  return { ...environment, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0: authorization };
}

function git(args: string[], root: string, environment: NodeJS.ProcessEnv, operation: string, maxBuffer: number) {
  try {
    return execFileSync('git', ['-c', `core.hooksPath=${join(root, 'jules-disabled-hooks')}`, '-c', 'credential.helper=', ...args], {
      cwd: root, env: environment, encoding: 'utf8', timeout: 120_000, maxBuffer,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const failure = error as { status?: number; stderr?: unknown; code?: string };
    // Extract only a status; never log Git response bodies, URLs or headers.
    const status = String(failure.stderr ?? '').match(/returned error:\s*(\d{3})\b/)?.[1];
    const exit = Number.isInteger(failure.status) ? `exit ${failure.status}` : 'no exit status';
    const category = failure.code === 'ETIMEDOUT' ? 'timeout' : failure.code === 'ENOBUFS' ? 'output limit' : exit;
    throw new RevisionDiffError(`Exact revision ${operation} failed (${status ? `HTTP ${status}; ` : ''}${category}). No code review was inferred; response bodies were withheld.`);
  }
}

export function readRevisionDiff(root: string, base: string, head: string) {
  return git(revisionArguments(base, head), root, process.env, 'diff', 64 * 1024 * 1024);
}

export function fetchRevisionDiff(repository: string, base: string, head: string, token: string) {
  revisionArguments(base, head);
  if (!/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(repository))
    throw new RevisionDiffError('Exact revision fetch requires a GitHub owner/repository name.');
  // Keep shallow boundaries and fetched objects out of the working checkout.
  // Both complete trees are available even with a depth-one PR merge ref.
  const root = mkdtempSync(join(tmpdir(), 'jules-revision-diff-'));
  try {
    git(['init', '--bare', '--quiet'], root, process.env, 'initialization', 1024 * 1024);
    // Credentials stay in the child environment, never in command arguments.
    git(['fetch', '--no-tags', '--depth=1', `https://github.com/${repository}.git`, base, head],
      root, gitAuthentication(token), 'fetch', 1024 * 1024);
    return readRevisionDiff(root, base, head);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

export function safeReviewFailure(error: unknown, operation: string, sessionId?: string) {
  if (error instanceof RevisionDiffError || error instanceof ReviewDiffBudgetError) return error.message;
  const value = error as { status?: unknown; message?: unknown } | null;
  const status = typeof value?.status === 'number' && Number.isInteger(value.status) && value.status >= 100 && value.status <= 599
    ? String(value.status) : typeof value?.message === 'string' ? value.message.match(/\bHTTP\s*(\d{3})\b/)?.[1] : undefined;
  return `Review operation ${operation} failed${status ? ` (HTTP ${status})` : ' (no safe upstream detail)'}. ` +
    (sessionId ? `Session ${sessionId} retained; inspect that exact session.` : 'No session handle was recorded; do not infer a completed review or a safe creation retry.');
}
