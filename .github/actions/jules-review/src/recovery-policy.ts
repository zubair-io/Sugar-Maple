import { createHash } from 'node:crypto';
import { parseFinalVerdict } from './verdict.js';
export class RecoveryPolicyError extends Error {}
export interface ReviewComment { body?: string | null; user: { login: string; type: string } | null }
export function validateRecoveryInput(sessionId: string, pr: string, mode: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId) || !/^[1-9][0-9]{0,8}$/.test(pr) || !['inspect', 'cleanup', 'respond'].includes(mode))
    throw new RecoveryPolicyError('Invalid recovery session, PR number or mode.');
  return { sessionId, prNumber: Number(pr), mode };
}
export function publishedSessionReference(comments: ReviewComment[], sessionId: string, cleanup: boolean) {
  return comments.some(comment => {
    if (comment.user?.login !== 'github-actions[bot]' || comment.user.type !== 'Bot') return false;
    const body = comment.body ?? '';
    if (!body.startsWith('<!-- jules-pr-reviewer -->')) return false;
    const footer = `\n---\n_Session: \`${sessionId}\`_`;
    const published = body.trim().endsWith(footer) && parseFinalVerdict(body.trim().slice(0, -footer.length)) !== null;
    const retained = body.includes(`Session: \`${sessionId}\``)
      || body.includes(`Session ${sessionId} retained; inspect that exact session.`);
    return published || (!cleanup && body.includes('Jules PR review failed to complete.') && retained);
  });
}
export function validateSessionSource(session: { name?: string; sourceContext?: { source?: string } }, sessionId: string, repository: string) {
  if (session.name !== `sessions/${sessionId}` || session.sourceContext?.source !== `sources/github/${repository}`)
    throw new RecoveryPolicyError('Session identity/source does not match this repository. No cleanup performed.');
}
export function activitySummary(activities: Record<string, unknown>[]) {
  return {
    activities: activities.length,
    agentMessages: activities.filter(a => a.agentMessaged != null).length,
    failures: activities.filter(a => a.sessionFailed != null).length,
    completions: activities.filter(a => a.sessionCompleted != null).length,
  };
}

export function recoveryArtifactKind(mode: string, includeReview: boolean, includeFeedback: boolean): 'review' | 'feedback' | null {
  if ((includeReview || includeFeedback) && mode !== 'inspect')
    throw new RecoveryPolicyError('Artifacts require inspection-only mode.');
  if (includeReview && includeFeedback)
    throw new RecoveryPolicyError('Choose one artifact type: completed review or pending feedback.');
  return includeReview ? 'review' : includeFeedback ? 'feedback' : null;
}

/** Artifact text is untrusted data, never authorization or publication. */
function latestAgentMessage(activities: Record<string, unknown>[], truncated: boolean): string | null {
  if (truncated) return null;
  const messages: { timestamp: string; text: string }[] = [];
  for (const activity of activities) {
    const message = activity.agentMessaged;
    if (message == null) continue;
    if (typeof message !== 'object' || Array.isArray(message)) return null;
    const text = (message as Record<string, unknown>).agentMessage;
    const time = activity.createTime;
    if (typeof text !== 'string' || typeof time !== 'string') return null;
    const stamp = time.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/);
    if (!stamp || !Number.isFinite(Date.parse(time))) return null;
    messages.push({ timestamp: `${stamp[1]}.${(stamp[2] ?? '').padEnd(9, '0')}Z`, text });
  }
  messages.sort((a, b) => a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0);
  const last = messages.at(-1);
  // Tied latest messages leave ordering uncertain; preserve the session instead.
  if (!last || messages.filter(m => m.timestamp === last.timestamp).length !== 1) return null;
  if (Buffer.byteLength(last.text, 'utf8') > 128 * 1024 || last.text.includes('\0')) return null;
  return last.text.trim() ? last.text : null;
}

export function completedReviewArtifact(state: string, activities: Record<string, unknown>[], truncated: boolean): string | null {
  if (state !== 'COMPLETED') return null;
  const text = latestAgentMessage(activities, truncated);
  return text && parseFinalVerdict(text) !== null ? text : null;
}

/** Pending requests may be inspected, but cannot stand in for a final verdict. */
export function pendingFeedbackArtifact(state: string, activities: Record<string, unknown>[], truncated: boolean): string | null {
  if (state !== 'AWAITING_USER_FEEDBACK') return null;
  return latestAgentMessage(activities, truncated);
}

/** Manual reply binds to an inspected question; never restarts or approves. */
export function validatePendingReply(state: string, activities: Record<string, unknown>[], truncated: boolean, expectedHash: string, reply: string) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || !reply.trim() || reply.includes('\0') || Buffer.byteLength(reply, 'utf8') > 8192)
    throw new RecoveryPolicyError('A pending reply requires an exact SHA-256 and 1–8192 bytes of nonempty text.');
  const question = pendingFeedbackArtifact(state, activities, truncated);
  if (!question || createHash('sha256').update(question, 'utf8').digest('hex') !== expectedHash)
    throw new RecoveryPolicyError('Pending question/state changed or activities are incomplete; inspect the same session again before replying.');
  if (activities.some(activity => {
    const message = activity.userMessaged;
    return message != null && typeof message === 'object' && !Array.isArray(message)
      && (message as Record<string, unknown>).userMessage === reply;
  })) throw new RecoveryPolicyError('An identical reply is already recorded; session retained without another send.');
  return createHash('sha256').update(reply, 'utf8').digest('hex');
}
