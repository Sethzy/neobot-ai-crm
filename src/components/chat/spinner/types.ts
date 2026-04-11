/**
 * Spinner mode type for the streaming status indicator.
 * Maps to Claude Code's SpinnerMode — five fine-grained states that drive
 * visual behavior (shimmer speed, flash opacity, thinking indicator).
 *
 * Reference: cc-src/components/Spinner/types.ts (inferred from usages)
 * @module components/chat/spinner/types
 */

/**
 * Fine-grained streaming mode, derived from the AI SDK messages array.
 *
 * - `requesting`  — API request fired, awaiting first byte (fast shimmer)
 * - `thinking`    — Extended-thinking block open (shows "thinking..." indicator)
 * - `responding`  — Text block streaming (slow shimmer)
 * - `tool-input`  — Tool input JSON streaming (slow shimmer)
 * - `tool-use`    — Tool executing post-stream (slow shimmer + sine-wave flash on verb)
 */
export type SpinnerMode =
  | 'thinking'
  | 'requesting'
  | 'responding'
  | 'tool-input'
  | 'tool-use'
