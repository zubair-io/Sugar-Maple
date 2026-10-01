/** Only a completed session with an explicit verdict is a finished review. */
export function isFinalReview(state: string, message: string): boolean {
  return state.toLowerCase() === 'completed' && /^`?VERDICT:\s*(approve|comment|block)`?\s*$/im.test(message);
}
export class SessionCleanupError extends Error {}

export async function deleteSession(
  sessionId: string, apiKey: string, request: typeof fetch,
  delay: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<number> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) throw new SessionCleanupError('Invalid session ID');
  for (let attempt = 1; attempt <= 3; attempt++) {
    let failure = 'network/timeout', retryable = true;
    try {
      const response = await request(`https://jules.googleapis.com/v1alpha/sessions/${sessionId}`, {
        method: 'DELETE', headers: { 'x-goog-api-key': apiKey }, redirect: 'error', signal: AbortSignal.timeout(30_000),
      });
      if (response.ok || response.status === 404) return attempt;
      failure = `HTTP ${response.status}`;
      retryable = [429, 500, 502, 503, 504].includes(response.status);
      await response.body?.cancel().catch(() => {});
    } catch (error) {
      retryable = error instanceof Error && ['TypeError', 'TimeoutError', 'AbortError'].includes(error.name);
    }
    if (!retryable || attempt === 3) throw new SessionCleanupError(`${failure}; ${attempt} cleanup attempt(s)`);
    await delay(attempt * 1000);
  }
  throw new SessionCleanupError('Cleanup exhausted');
}

/** Preserve the review on GitHub before deleting this run's exact session. */
export async function publishThenDelete(
  sessionId: string,
  apiKey: string,
  publish: () => Promise<void>,
  request: typeof fetch,
  cleanupFailed: (message: string) => void,
): Promise<void> {
  await publish();
  try {
    await deleteSession(sessionId, apiKey, request);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'cleanup failed';
    cleanupFailed(`Review saved, but Jules session ${sessionId} could not be deleted (${detail}). The published verdict remains intact. Use the documented exact-session recovery workflow.`);
  }
}
