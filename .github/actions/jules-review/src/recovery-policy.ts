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
