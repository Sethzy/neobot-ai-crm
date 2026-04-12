/**
 * Custom AI SDK v6 ChatTransport that talks to `/api/chat/send` +
 * `/api/chat/stream` instead of the default one-request/one-stream
 * `POST /api/chat`.
 *
 * Opens the thread-level SSE stream eagerly, then closes it when the
 * server emits a `finish` chunk (end-of-turn). On the next
 * `sendMessages` call the SSE is lazily reopened — no Vercel function
 * stays alive between turns or during approval waits. Each
 * `sendMessages` call creates a fresh per-turn
 * `ReadableStream<UIMessageChunk>` that the `useChat` hook consumes;
 * the stream closes when the server emits a `finish` chunk (signalling
 * end-of-turn), which makes `useChat` set `status → ready`.
 *
 * Two client-side patterns from the Vercel managed-agents starter:
 *
 * 1. **Event dedup** — a `Set<string>` tracks every Anthropic source
 *    event id the transport has already enqueued. When the SSE
 *    reconnects (tab wake, network hiccup, Vercel function restart),
 *    the server replays events the client already rendered. Without
 *    dedup, users see duplicate text blocks or tool calls.
 *
 * 2. **Optimistic user messages** — handled at the `chat-panel.tsx`
 *    level, not inside the transport. The transport doesn't own the
 *    message list — the `useChat` hook does.
 *
 * @module components/chat/session-chat-transport
 */
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import {
  EventSourceParserStream,
  type EventSourceMessage,
} from "eventsource-parser/stream";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SendMessagesOptions = Parameters<
  ChatTransport<UIMessage>["sendMessages"]
>[0];

type ReconnectOptions = Parameters<
  ChatTransport<UIMessage>["reconnectToStream"]
>[0];

// ---------------------------------------------------------------------------
// Approval detection
// ---------------------------------------------------------------------------

interface ApprovalPayload {
  toolUseId: string;
  result: "allow" | "deny";
}

/**
 * Check the last two messages for a tool-invocation part with
 * `state === "approval-responded"` or `state === "output-denied"`.
 * Scoped to trailing messages only to match the legacy transport's
 * `hasApprovalContinuationState` check — older approvals deeper in the
 * history must never cause a later unrelated send to be routed as a
 * `user.tool_confirmation`.
 */
function extractApprovalFromMessages(
  messages: UIMessage[],
): ApprovalPayload | null {
  // Only inspect the last two messages (same scope as the legacy
  // transport's isToolApprovalContinuation check in chat-panel.tsx).
  const start = Math.max(0, messages.length - 2);
  for (let i = messages.length - 1; i >= start; i--) {
    const msg = messages[i];
    if (!msg.parts) continue;
    for (const part of msg.parts) {
      if (!("type" in part) || part.type !== "tool-invocation") continue;
      const state = "state" in part ? (part as { state?: string }).state : undefined;
      if (state !== "approval-responded" && state !== "output-denied") continue;
      const toolCallId =
        "toolCallId" in part ? (part as { toolCallId?: string }).toolCallId : undefined;
      if (!toolCallId) continue;
      const approval =
        "approval" in part
          ? (part as { approval?: { approved?: boolean } }).approval
          : undefined;
      return {
        toolUseId: toolCallId,
        result: state === "output-denied" || !approval?.approved ? "deny" : "allow",
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export class SessionChatTransport implements ChatTransport<UIMessage> {
  private readonly threadId: string;

  /**
   * The currently-selected model from the chat picker.
   * Initialized at construction time from the cookie-restored model so the
   * first send carries the right agent. Updated via `setSelectedChatModel()`
   * whenever the user changes the picker.
   */
  private _selectedChatModel: string | undefined;

  setSelectedChatModel(modelId: string): void {
    this._selectedChatModel = modelId;
  }

  // ── Persistent SSE state ─────────────────────────────────────────────
  private sseAbort: AbortController | null = null;
  private sseConnected = false;
  /**
   * Resolves when the SSE connection's HTTP response headers have been
   * received. `sendMessages` awaits this before POSTing to ensure the
   * subscribe-before-send guarantee.
   */
  private sseReady: Promise<void> | null = null;
  /** Reconnect loop flag — cleared when `destroy()` is called. */
  private alive = true;

  // ── Per-turn stream ──────────────────────────────────────────────────
  private currentController: ReadableStreamDefaultController<UIMessageChunk> | null =
    null;
  /** True after a `finish` chunk is received — suppresses auto-reconnect. */
  private turnComplete = false;

  // ── Dedup ────────────────────────────────────────────────────────────
  /**
   * Tracks Anthropic source event ids whose chunks have been fully
   * delivered. On SSE reconnect the server replays history — ids in
   * this set are skipped so users never see duplicate text blocks.
   */
  private seenSourceEventIds = new Set<string>();
  /**
   * The source event id currently being delivered. We defer adding it
   * to `seenSourceEventIds` until the NEXT marker arrives (proving the
   * previous event's chunks were all delivered). If the SSE drops
   * mid-event, the pending id stays out of the set so the partially-
   * delivered event is replayed fully on reconnect.
   */
  private pendingSourceEventId: string | null = null;
  /** When true, chunks are dropped until the next unseen source-event-id. */
  private skipMode = false;

  constructor(threadId: string, initialModel?: string) {
    this.threadId = threadId;
    this._selectedChatModel = initialModel;
    // Open the SSE eagerly so the connection is live when the user sends
    // their first message. On fresh threads (no session yet) the GET
    // returns 404 — the reconnect loop retries after 1s, by which time
    // the POST /api/chat/send has created the session.
    this.openStream();
  }

  // ── ChatTransport interface ──────────────────────────────────────────

  async sendMessages(
    options: SendMessagesOptions,
  ): Promise<ReadableStream<UIMessageChunk>> {
    // Re-open if the SSE was torn down (destroy + re-use, or clean turn
    // end where we deliberately didn't reconnect).
    if (!this.sseConnected && this.alive) {
      this.turnComplete = false;
      this.openStream();
    }

    // Wait for the SSE response headers before POSTing — ensures the
    // subscribe-before-send guarantee per Anthropic skill §7.
    if (this.sseReady) {
      await this.sseReady;
    }

    // Create a fresh per-turn ReadableStream. The hook consumes this
    // stream and sets status → streaming / ready based on its lifecycle.
    const stream = new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        // If there's an existing controller from a previous turn that
        // wasn't closed (e.g. abort), close it first.
        this.closeTurnStream();
        this.currentController = controller;
      },
      cancel: () => {
        // useChat aborted this turn — detach the controller but keep the
        // SSE connection alive for future turns.
        this.currentController = null;
      },
    });

    // Detect approval continuations — the sendAutomaticallyWhen hook
    // fires sendMessages after the user clicks approve/deny. In that
    // case we POST a tool confirmation, not a user message.
    const approval = extractApprovalFromMessages(options.messages);

    const response = await fetch("/api/chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        approval
          ? { threadId: this.threadId, approval }
          : {
              threadId: this.threadId,
              message: options.messages[options.messages.length - 1],
              ...(this._selectedChatModel
                ? { selectedChatModel: this._selectedChatModel }
                : {}),
            },
      ),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || "Failed to send message.");
    }

    return stream;
  }

  async reconnectToStream(
    _options: ReconnectOptions,
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    // The session transport handles auto-reconnection at the SSE level.
    // Returning null tells useChat there's no active stream to resume,
    // which is correct — new events arrive via the persistent SSE.
    return null;
  }

  // ── SSE connection ───────────────────────────────────────────────────

  /** Build the SSE URL, including the client cursor when available. */
  private buildSseUrl(): string {
    const url = new URL(`/api/chat/stream`, window.location.origin);
    url.searchParams.set("threadId", this.threadId);
    // Pass the last finalized source event id so the server tails from
    // that cursor instead of replaying the entire session history.
    const lastFinalized = this.lastFinalizedSourceEventId();
    if (lastFinalized) {
      url.searchParams.set("afterId", lastFinalized);
    }
    return url.pathname + url.search;
  }

  /** The most recent source event id committed to the seen set. */
  private lastFinalizedSourceEventId(): string | null {
    // The Set doesn't preserve insertion order in a way we can read
    // "last inserted". Track it explicitly.
    return this._lastFinalizedId;
  }
  private _lastFinalizedId: string | null = null;

  private openStream(): void {
    this.sseAbort = new AbortController();
    this.sseConnected = true;
    this.skipMode = false;

    const url = this.buildSseUrl();

    // Create the sseReady promise that resolves when the fetch response
    // headers arrive (or immediately on error so sendMessages doesn't hang).
    let resolveReady!: () => void;
    this.sseReady = new Promise<void>((r) => {
      resolveReady = r;
    });

    this.consumeSse(url, this.sseAbort.signal, resolveReady);
  }

  /**
   * Tail the SSE endpoint. Parses events, deduplicates, and routes
   * chunks to the active per-turn controller. Automatically reconnects
   * on connection drop (unless `destroy()` was called).
   */
  private async consumeSse(
    url: string,
    signal: AbortSignal,
    onReady: () => void,
  ): Promise<void> {
    try {
      const response = await fetch(url, { signal });
      // SSE connection established — resolve sseReady.
      onReady();

      if (!response.ok || !response.body) {
        this.sseConnected = false;
        this.scheduleReconnect();
        return;
      }

      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new EventSourceParserStream())
        .getReader();

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        this.handleSseEvent(value);
      }
    } catch {
      // AbortError (expected on destroy/navigate), network errors, etc.
      // Resolve sseReady so sendMessages doesn't hang on a failed connection.
      onReady();
    }

    this.sseConnected = false;

    // Reconnect on dirty close (network error, Vercel restart). Skip
    // reconnect after a clean turn end — sendMessages() will reopen
    // the SSE lazily when the user sends the next message.
    if (this.alive && !signal.aborted && !this.turnComplete) {
      this.scheduleReconnect();
    }
  }

  /**
   * Process a single SSE event. Handles dedup markers, enqueues normal
   * UIMessageChunks into the per-turn stream, and closes the turn on
   * `finish` chunks.
   */
  private handleSseEvent(event: EventSourceMessage): void {
    // Ignore the [DONE] sentinel emitted when the server stream closes.
    if (event.data === "[DONE]") return;

    let chunk: UIMessageChunk;
    try {
      chunk = JSON.parse(event.data) as UIMessageChunk;
    } catch {
      return;
    }

    // ── Dedup via data-source-event-id markers ──────────────────────
    if (
      (chunk as { type: string }).type === "data-source-event-id" &&
      typeof (chunk as { data?: unknown }).data === "object" &&
      (chunk as { data: { id?: unknown } }).data !== null
    ) {
      const sourceId = (chunk as { data: { id?: string } }).data.id;
      if (typeof sourceId === "string" && sourceId.length > 0) {
        // Finalize the PREVIOUS pending id as fully delivered. We
        // defer this until now so that a mid-event SSE drop leaves
        // the pending id OUT of the set — on reconnect, the server
        // replays it and the client re-processes the full event.
        if (this.pendingSourceEventId) {
          this.seenSourceEventIds.add(this.pendingSourceEventId);
          this._lastFinalizedId = this.pendingSourceEventId;
        }

        if (this.seenSourceEventIds.has(sourceId)) {
          this.skipMode = true;
          this.pendingSourceEventId = null;
        } else {
          this.skipMode = false;
          this.pendingSourceEventId = sourceId;
        }
      }
      // Don't forward data-source-event-id to the hook — it's internal.
      return;
    }

    // Drop replayed chunks while in skip mode.
    if (this.skipMode) return;

    // ── Track turn completion for reconnect suppression ──────────────
    // Must run before the currentController guard — the SSE may deliver
    // a finish event with no active turn stream (e.g. reconnect to idle
    // session), and we still need to suppress auto-reconnect.
    const isFinish = (chunk as { type: string }).type === "finish";
    if (isFinish) {
      if (this.pendingSourceEventId) {
        this.seenSourceEventIds.add(this.pendingSourceEventId);
        this._lastFinalizedId = this.pendingSourceEventId;
        this.pendingSourceEventId = null;
      }
      this.turnComplete = true;
    }

    // ── Enqueue into the per-turn stream ────────────────────────────
    if (!this.currentController) return;

    try {
      this.currentController.enqueue(chunk);
    } catch {
      // Controller may be closed (abort race).
      return;
    }

    // ── Close the per-turn stream on finish ─────────────────────────
    if (isFinish) {
      this.closeTurnStream();
    }
  }

  /**
   * Schedule an SSE reconnect with a short back-off delay.
   */
  private scheduleReconnect(): void {
    if (!this.alive) return;

    setTimeout(() => {
      if (!this.alive) return;
      this.sseAbort = new AbortController();
      this.sseConnected = true;
      // Reset skip + pending — the new connection starts fresh. The
      // pending id is deliberately NOT finalized into the seen set so
      // the partially-delivered event gets replayed fully.
      this.skipMode = false;
      this.pendingSourceEventId = null;

      // Rebuild the URL so the afterId cursor reflects the latest
      // finalized source event id — the server tails from there.
      const url = this.buildSseUrl();

      let resolveReady!: () => void;
      this.sseReady = new Promise<void>((r) => {
        resolveReady = r;
      });
      this.consumeSse(url, this.sseAbort.signal, resolveReady);
    }, 1000);
  }

  /**
   * Close the current per-turn ReadableStream controller (if any).
   * Does NOT close the underlying SSE connection.
   */
  private closeTurnStream(): void {
    if (!this.currentController) return;
    try {
      this.currentController.close();
    } catch {
      // Already closed.
    }
    this.currentController = null;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /**
   * Tear down the transport. Aborts the SSE connection and closes any
   * active per-turn stream. Call this when the thread is no longer
   * visible (e.g. navigating away).
   */
  destroy(): void {
    this.alive = false;
    this.sseAbort?.abort();
    this.sseAbort = null;
    this.sseConnected = false;
    this.closeTurnStream();
  }
}
