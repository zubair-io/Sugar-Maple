export class RecoveryPolicyError extends Error {}
export interface ReviewComment { body?: string | null; user: { login: string; type: string } | null }
export function validateRecoveryInput(sessionId: string, pr: string, mode: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId) || !/^[1-9][0-9]{0,8}$/.test(pr) || !['inspect', 'cleanup'].includes(mode))
    throw new RecoveryPolicyError('Invalid recovery session, PR number or mode.');
  return { sessionId, prNumber: Number(pr), mode };
}
export function publishedSessionReference(comments: ReviewComment[], sessionId: string, cleanup: boolean) {
  return comments.some(comment => {
    if (comment.user?.login !== 'github-actions[bot]' || comment.user.type !== 'Bot') return false;
    const body = comment.body ?? '';
    if (!body.startsWith('<!-- jules-pr-reviewer -->')) return false;
    const published = body.trim().endsWith(`_Session: \`${sessionId}\`_`) && /^`?VERDICT:\s*(approve|comment|block)`?\s*$/im.test(body);
    return published || (!cleanup && body.includes('Jules PR review failed to complete.') && body.includes(`Session: \`${sessionId}\``));
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

/** Artifact text is untrusted review data, never authorization or publication. */
export function completedReviewArtifact(state: string, activities: Record<string, unknown>[], truncated: boolean): string | null {
  if (state !== 'COMPLETED' || truncated) return null;
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
  return /^`?VERDICT:\s*(approve|comment|block)`?\s*$/im.test(last.text) ? last.text : null;
}
