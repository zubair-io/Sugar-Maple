import { isFinalReview } from './cleanup.js';
class TerminalReviewError extends Error {}
const safeState = (state: string) => /^(queued|planning|awaitingPlanApproval|awaitingUserFeedback|inProgress|paused|completed|failed|QUEUED|PLANNING|AWAITING_PLAN_APPROVAL|AWAITING_USER_FEEDBACK|IN_PROGRESS|PAUSED|COMPLETED|FAILED)$/.test(state) ? state : 'unknown';
export interface ReviewSession {
  id: string;
  info(): Promise<{ state: string }>;
  hydrate(): Promise<number>;
  history(): AsyncIterable<{ type: string; message?: string }>;
}
export interface PollOptions {
  timeoutMs: number;
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
  report?: (message: string) => void;
}
export async function collectReview(session: ReviewSession, options: PollOptions) {
  const now = options.now ?? Date.now;
  const delay = options.delay ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const deadline = now() + options.timeoutMs;
  let state = 'unknown', attempts = 0, activities = 0, messages = 0, completedWithoutVerdict = 0;
  while (now() < deadline) {
    attempts++;
    try {
      state = safeState((await session.info()).state);
      if (state.toLowerCase() === 'failed') throw new TerminalReviewError(`Session ${session.id} failed without a published review. Retained for investigation.`);
      await session.hydrate();
      let last = ''; activities = messages = 0;
      for await (const activity of session.history()) {
        activities++;
        if (activity.type === 'agentMessaged') { messages++; last = activity.message ?? ''; }
      }
      state = safeState((await session.info()).state);
      options.report?.(`Session ${session.id}: state=${state}; activities=${activities}; agentMessages=${messages}; attempt=${attempts}.`);
      if (isFinalReview(state, last)) return { review: last, state, attempts, activities, messages, timedOut: false };
      if (state.toLowerCase() === 'failed') throw new TerminalReviewError(`Session ${session.id} failed without a published review. Retained for investigation.`);
      if (state.toLowerCase() === 'completed' && ++completedWithoutVerdict >= 3)
        throw new TerminalReviewError(`Session ${session.id} completed without an explicit final verdict after three reads. Retained for investigation.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (error instanceof TerminalReviewError) throw error;
      const status = message.match(/\b(401|403)\b/)?.[1];
      if (status) throw Error(`Jules API returned HTTP ${status}; check JULES_API_KEY permissions. Session ${session.id} retained.`);
      // Do not print arbitrary upstream bodies or messages with credentials.
      options.report?.(`Session ${session.id}: transient polling error; lastState=${state}; attempt=${attempts}.`);
    }
    await delay(Math.max(0, Math.min(20_000, deadline - now())));
  }
  return { review: '', state, attempts, activities, messages, timedOut: true };
}
