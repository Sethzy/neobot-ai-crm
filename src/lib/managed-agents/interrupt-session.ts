/**
 * Stops a Managed Agents session in two stages:
 *
 *   1. Send `user.interrupt` — the cookbook's graceful stop verb. Anthropic
 *      ends the in-flight generation and the SSE stream emits the next
 *      `session.status_idle`. Resumable.
 *   2. After 5s, if the session is still `running`, fall through to
 *      `sessions.archive` — the cookbook's hard-cancel verb (see
 *      `CMA_operate_in_production.ipynb`). Tears down the live container so
 *      the SSE stream closes and the chat composer re-enables, even when the
 *      stream itself has stalled and the interrupt event isn't observable.
 *
 * The escalation runs detached so the Stop button feels immediate — the user
 * gets their UI back without waiting on the 5s timer.
 *
 * @module lib/managed-agents/interrupt-session
 */
import type Anthropic from "@anthropic-ai/sdk";

const HARD_CANCEL_DELAY_MS = 5_000;

export async function interruptSession(
  anthropic: Anthropic,
  sessionId: string,
): Promise<void> {
  await anthropic.beta.sessions.events.send(sessionId, {
    events: [{ type: "user.interrupt" }],
  } as never);

  setTimeout(() => {
    void escalateToArchive(anthropic, sessionId);
  }, HARD_CANCEL_DELAY_MS);
}

async function escalateToArchive(
  anthropic: Anthropic,
  sessionId: string,
): Promise<void> {
  try {
    const session = await anthropic.beta.sessions.retrieve(sessionId);
    if (session.status !== "running") {
      return;
    }
    await anthropic.beta.sessions.archive(sessionId);
  } catch {
    // Best-effort. If retrieve/archive fails (already archived, network blip,
    // 404 race), there is nothing useful to do — the user has already gotten
    // their UI back, and Vercel function maxDuration is the platform-level
    // ceiling.
  }
}
