/**
 * Derives the fine-grained SpinnerMode from AI SDK's coarse ChatStatus + messages.
 *
 * This is the only justified drift from Claude Code's implementation: CC drives
 * streamMode directly from raw Anthropic API stream events (content_block_start etc.)
 * because it owns the HTTP stream. Sunder uses AI SDK's useChat which only exposes
 * status: "ready" | "submitted" | "streaming" | "error" and the messages array.
 *
 * The derivation inspects the last message's last part to reconstruct what CC would
 * have emitted — see cc-src/utils/messages.ts:2984–3093 for the authoritative mapping.
 *
 * @module lib/chat/derive-spinner-mode
 */

import type { ChatStatus } from '@/types/chat'
import type { SpinnerMode } from '@/components/chat/spinner/types'
import type { ChatUIMessage } from '@/components/chat/message-content'

/**
 * Derives the SpinnerMode from the current chat status and last assistant message.
 *
 * Mapping (mirrors handleMessageFromStream in cc-src/utils/messages.ts):
 * - submitted → "requesting" (API fired, awaiting first byte)
 * - last part = reasoning → "thinking"
 * - last part = tool, state input-streaming/input-available → "tool-input"
 * - last part = tool, state output-available/approval-requested → "tool-use"
 * - last part = text → "responding"
 * - fallback → "responding"
 */
export function deriveSpinnerMode(
  status: ChatStatus,
  messages: ChatUIMessage[],
): SpinnerMode {
  if (status === 'submitted') return 'requesting'

  const last = messages.at(-1)
  if (!last || last.role !== 'assistant') return 'responding'

  const lastPart = last.parts.at(-1)
  if (!lastPart) return 'responding'

  if (lastPart.type.startsWith('tool-')) {
    const state = (lastPart as { state?: string }).state
    if (state === 'input-streaming' || state === 'input-available') {
      return 'tool-input'
    }
    if (state === 'output-available' || state === 'approval-requested') {
      return 'tool-use'
    }
  }

  if (lastPart.type === 'reasoning') return 'thinking'
  if (lastPart.type === 'text') return 'responding'

  return 'responding'
}
