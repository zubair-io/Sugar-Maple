export class ReplySendError extends Error {}
/** Caller must first verify the exact pending session/source/question. */
export async function submitReply(sessionId: string, apiKey: string, reply: string, fetcher: typeof fetch = fetch): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId) || !reply.trim() || reply.includes('\0') || Buffer.byteLength(reply, 'utf8') > 8192)
    throw new ReplySendError('Invalid exact-session reply input; no reply sent.');
  let response: Response;
  try {
    // No automatic POST retry: a timeout may mean the server accepted it.
    response = await fetcher(`https://jules.googleapis.com/v1alpha/sessions/${sessionId}:sendMessage`, {
      method: 'POST', headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: reply }), redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ReplySendError('Reply delivery is uncertain; inspect the same session and activities before retrying.');
  }
  if (!response.ok) throw new ReplySendError(`Reply API returned HTTP ${response.status}; inspect the same session before retrying.`);
}
