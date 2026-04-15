# Chat UI Patterns

Reference for structured UI patterns used in the Sunder chat interface.

---

## Structured Input Collection (Ask User Question)

When the agent needs a structured response from the user mid-conversation, there are three established industry patterns. Sunder uses Pattern 3.

### Pattern 1: Quick Replies / Suggested Actions

Ephemeral pill/chip buttons floating just above the composer. Non-blocking — user can ignore them and type freely. Disappear after use or when conversation advances.

**Used by:** Messenger, WhatsApp Business, Telegram bots, Intercom  
**Best for:** Simple single-choice prompts ("Yes/No", "Option A/B")  
**Not used in Sunder.**

### Pattern 2: Inline Cards

Widget rendered inside the message bubble in the scroll area. Gets buried when conversation scrolls past.

**Used by:** Botpress, Rasa, BotFramework-WebChat, most bot frameworks  
**Best for:** Historical/auditable interactions, forms that should persist in transcript  
**Was Sunder's original implementation — removed in favor of Pattern 3.**

### Pattern 3: Blocking Interstitial ✓ (Sunder's choice)

Widget renders as a flex sibling between the message list and the chat composer. Disables the composer while active — the user must answer (or skip) before free-text input resumes.

**Used by:** Claude.ai  
**Best for:** Agent tool calls that genuinely block on a user answer before the run can continue  
**Why Sunder uses this:** `ask_user_question` is a blocking tool call — the agent is paused waiting for a result. The interstitial physically communicates this state to the user and prevents out-of-order free-text that would break the agent's logic flow.

**Implementation:** `src/components/chat/ask-user-question-overlay.tsx`, wired into `src/components/chat/chat-panel.tsx` between `<MessageList />` and `<ChatComposer />`.

**Industry term:** "Structured input collection" or "interactive cards." The specific blocking-overlay-above-composer flavor is associated with Claude.ai — no widely adopted name yet (as of April 2026).
