/**
 * Feature flag controlling which chat transport `useChat` uses.
 *
 * - `"legacy"` — default `POST /api/chat` round-trip (DefaultChatTransport).
 * - `"session"` — persistent SSE via `GET /api/chat/stream` + fire-and-forget
 *   `POST /api/chat/send` (SessionChatTransport).
 *
 * Resolution order:
 *   1. `localStorage.getItem("sunder_chat_transport")` — manual override for
 *      local testing (`localStorage.setItem("sunder_chat_transport", "session")`).
 *   2. `NEXT_PUBLIC_CHAT_TRANSPORT_MODE` env var — deploy-time flag.
 *   3. Falls back to `"legacy"`.
 *
 * @module lib/chat/session-transport-flag
 */

/** Transport modes supported by the chat panel. */
export type ChatTransportMode = "legacy" | "session";

/**
 * Resolve the active chat transport mode. Safe to call on both server and
 * client — returns `"legacy"` immediately on the server where `window` is
 * unavailable.
 */
export function resolveChatTransportMode(): ChatTransportMode {
  if (typeof window === "undefined") return "legacy";

  const override = window.localStorage.getItem("sunder_chat_transport");
  if (override === "legacy" || override === "session") return override;

  return process.env.NEXT_PUBLIC_CHAT_TRANSPORT_MODE === "session"
    ? "session"
    : "legacy";
}
