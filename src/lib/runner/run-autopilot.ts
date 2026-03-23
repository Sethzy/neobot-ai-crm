/**
 * Autonomous autopilot pulse runner — thin wrapper around runAgent.
 * @module lib/runner/run-autopilot
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { AUTOPILOT_INSTRUCTION_PROMPT } from "@/lib/autopilot/constants";
import { runAgent } from "@/lib/runner/run-agent";
import type { Database } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;

export interface RunAutopilotInput {
  clientId: string;
  threadId: string;
  supabase: ChatSupabaseClient;
}

export type RunAutopilotResult =
  | { status: "completed" }
  | { status: "skipped_busy" }
  | { status: "failed"; error: string };

/**
 * Executes one autopilot pulse by delegating to the unified runner.
 * Busy threads are skipped (not queued). Errors are caught and returned
 * as `{ status: "failed" }` — this function never throws.
 *
 * Uses `consumeStream({ onError })` to block until the full stream
 * (including `onFinish` / `finalizeRun`) completes. The `onError` callback
 * detects stream and finalization failures that `consumeStream()` would
 * otherwise silently swallow. Do NOT use `.text` — it resolves before
 * `onFinish` fires (verified in AI SDK source: stream-text.ts flush()).
 */
export async function runAutopilot({
  clientId,
  threadId,
  supabase,
}: RunAutopilotInput): Promise<RunAutopilotResult> {
  try {
    const result = await runAgent({
      clientId,
      threadId,
      input: "",
      triggerType: "pulse",
      channel: "web",
      consumeMessageQuota: false,
      instructions: AUTOPILOT_INSTRUCTION_PROMPT,
    }, supabase);

    if (result.status === "streaming") {
      // consumeStream() waits for the full stream including onFinish (which
      // calls finalizeRun). The onError callback detects failures that would
      // otherwise be silently swallowed:
      //
      // 1. Stream errors (LLM timeout, network) — runAgent's onError callback
      //    calls recordFailedRun, then the stream errors, consumeStream catches
      //    the read error and calls our onError.
      // 2. onFinish/finalizeRun errors — flush() catches the throw, calls
      //    controller.error(error), stream errors, consumeStream catches and
      //    calls our onError.
      //
      // Verified in AI SDK source: consume-stream.ts:26 catches reader.read()
      // errors and calls onError. stream-text.ts:1170 flush() catch calls
      // controller.error(error) which propagates through teed streams.
      let streamError: unknown = null;
      await result.streamResult.consumeStream({
        onError: (error: unknown) => { streamError = error; },
      });

      if (streamError) {
        const message = streamError instanceof Error
          ? streamError.message
          : "Stream consumption failed";
        return { status: "failed", error: message };
      }

      return { status: "completed" };
    }

    // "queued" from runAgent means thread was busy and pulse was not
    // enqueued (pulse guard in runAgent skips enqueue).
    return { status: "skipped_busy" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown autopilot error";

    // Note: runAgent's recordFailedRun already marked the run as failed
    // and emitted analytics before throwing. We just translate the error
    // contract from "throw" to "return { status: failed }".
    return { status: "failed", error: message };
  }
}
