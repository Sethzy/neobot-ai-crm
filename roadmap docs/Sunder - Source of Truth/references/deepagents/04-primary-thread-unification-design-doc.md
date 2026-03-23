# Primary Thread Unification — Design Doc

**Status:** Design doc (not yet implemented)
**Date:** 2026-03-23
**References:**
- OpenClaw main session pattern (`session.dmScope: "main"`)
- Manus "Agents" page pattern (persistent agent session vs. task threads)
**Related:**
- `03-runner-unification-design-doc.md` — runner refactor (prerequisite)
- `02-harness-fixes-design-doc.md` — subagent + approval fixes (independent)

---

## Problem

Today a user has three separate threads that should be one conversation:

```
"Sunder Autopilot" (pinned)  — pulse fires here, user never checks it
Telegram DM thread           — created on pairing, separate from everything
Web chat (default)           — new thread created on first message
```

The agent in the autopilot thread has no context from the user's chat. The agent in the Telegram thread has no context from the web. Pulse results sit unseen in a thread nobody opens. The user has to actively check three places.

There is no "home" for the agent. No single place where the user interacts with their persistent assistant.

---

## Reference: Manus UX Pattern

Manus has two distinct concepts:

**"Agents"** — the persistent main session. One continuous conversation with the agent. Always the same thread. This is where:
- The agent greets the user and learns preferences
- Telegram connects (messages mirror here)
- The agent proactively messages the user
- The user has ongoing dialogue with their assistant

**"New task"** — creates a separate one-off task thread. Each task appears in "All tasks" in the sidebar. These are isolated — the agent works on a specific thing and returns a result.

**"Agents" has two states:**
1. **Before Telegram connected:** Onboarding/deployment screen — messaging platform icons, feature cards, "Get started on Telegram" CTA
2. **After Telegram connected:** Persistent chat — the main session with full conversation history

---

## Reference: OpenClaw Main Session

OpenClaw collapses all DMs across all channels into one session (`session.dmScope: "main"`). Telegram, WhatsApp, Discord, terminal — all feed into `agent:main:main`. Cron jobs with `--session main` fire into the same session. One continuous conversation.

---

## Solution

Follow the Manus pattern exactly. Add an "Agent" page as the home for the persistent main session. Rename existing "Chat" to "New Task."

### Sidebar change

```
BEFORE:                          AFTER:
AGENT                            AGENT
  Chat          ← new thread      Agent         ← NEW: main session
  Skills                           New Task      ← RENAMED from Chat
  Tasks                            Skills
  Automations                      Tasks
  Memory                           Automations
                                   Memory

SESSIONS                         SESSIONS (renamed from current)
  Sunder Autopilot (pinned)        Task 1
  Thread 1                         Task 2
  Thread 2                         Task 3
```

### "Agent" page — two states

**State 1: Telegram not connected (onboarding)**

```
┌────────────────┬──────────────────────────────────────────┐
│  Sidebar       │                                          │
│                │  [Telegram / WhatsApp / messenger icons] │
│  AGENT         │                                          │
│    Agent  ←    │  Deploy your agent                       │
│    New Task    │                                          │
│    Skills      │  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│    ...         │  │ Brand    │ │ Memory & │ │ Custom   │ │
│                │  │ identity │ │ computer │ │ skills   │ │
│  SESSIONS      │  └──────────┘ └──────────┘ └──────────┘ │
│    (empty)     │                                          │
│                │  [ Get started on Telegram ]             │
│                │                                          │
│                │  Coming soon: WhatsApp, Messenger        │
└────────────────┴──────────────────────────────────────────┘
```

Matches the Manus "Agents" onboarding screen. Feature cards explain the value. CTA connects Telegram.

**State 2: Telegram connected (main session)**

```
┌────────────────┬──────────────────────────────────────────┐
│  Sidebar       │  Agent                                   │
│                │                                          │
│  AGENT         │  sunder                                  │
│    Agent  ←    │  Hey! I'm online as your agent.          │
│    New Task    │  What should I call you?                  │
│    Skills      │                                          │
│    ...         │                        Seth              │
│                │                                          │
│  SESSIONS      │  sunder                                  │
│    Task 1      │  Great, Seth. I'll update that.          │
│    Task 2      │                                          │
│                │  [Compose: Describe a task...]           │
└────────────────┴──────────────────────────────────────────┘
```

This IS the primary thread. Same thread that Telegram messages go to. Same thread that pulse fires in. The user can type here or in Telegram — both show up.

### "New Task" page

This is what "Chat" is today. "What can I do for you?" with suggestion cards and a composer. Creates a fresh thread on first message. Each thread appears under SESSIONS in the sidebar.

```
┌────────────────┬──────────────────────────────────────────┐
│  Sidebar       │                                          │
│                │  What can I do for you?                  │
│  AGENT         │                                          │
│    Agent       │  [158 / 999999 messages used]            │
│    New Task ←  │                                          │
│    Skills      │  [Describe a task or responsibility]     │
│    ...         │                                          │
│                │  ┌────────────┐ ┌────────────┐           │
│  SESSIONS      │  │ Morning    │ │ Follow-up  │           │
│    Task 1      │  │ CRM brief  │ │ reminder   │           │
│    Task 2      │  └────────────┘ └────────────┘           │
└────────────────┴──────────────────────────────────────────┘
```

---

## What Changes

### 1. New route: `/agent`

**Create** `app/(dashboard)/agent/page.tsx` — the Agent page.

**Logic:**
```typescript
export default async function AgentPage() {
  const supabase = await createClient();
  const clientId = await getClientId(supabase);

  // Check if Telegram is connected
  const { data: mapping } = await supabase
    .from("conversation_channel_mappings")
    .select("thread_id")
    .eq("client_id", clientId)
    .eq("channel", "telegram")
    .maybeSingle();

  if (!mapping) {
    // State 1: Show onboarding/deployment screen
    return <AgentOnboarding />;
  }

  // State 2: Show main session chat (primary thread)
  const { data: primaryThread } = await supabase
    .from("conversation_threads")
    .select("thread_id")
    .eq("client_id", clientId)
    .eq("is_primary", true)
    .single();

  return <ChatPanel threadId={primaryThread.thread_id} />;
}
```

The page reuses the existing `ChatPanel` component — same message list, same composer, same streaming. Just pointed at the primary thread.

### 2. Rename "Chat" to "New Task"

**Modify** `src/components/layout/app-sidebar.tsx`:
- Change nav item label from "Chat" to "New Task"
- Change icon to match Manus (pencil/compose icon)
- URL stays `/chat` (existing welcome screen + thread creation logic unchanged)

### 3. Add "Agent" nav item

**Modify** `src/components/layout/app-sidebar.tsx`:
- Add "Agent" as the first item in the AGENT section
- URL: `/agent`
- Icon: agent/bot icon (matching Manus)

### 4. Rename sidebar "SESSIONS" section threads

Currently the session list shows all threads including "Sunder Autopilot." After the change:
- The primary thread no longer appears in the SESSIONS list (it has its own nav item: "Agent")
- SESSIONS only shows non-primary threads (task threads)

**Modify** `src/hooks/use-threads.ts` or `src/contexts/thread-context.tsx`:
- Filter out `is_primary = true` from the thread list query

### 5. Bootstrap: Add `is_primary` column

**DB migration:**
```sql
ALTER TABLE conversation_threads ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT false;

-- Ensure at most one primary per client
CREATE UNIQUE INDEX idx_conversation_threads_primary
  ON conversation_threads (client_id)
  WHERE is_primary = true;

-- Rename existing autopilot threads
UPDATE conversation_threads
SET is_primary = true, title = 'Agent'
WHERE title = 'Sunder Autopilot' AND is_pinned = true;
```

**Update bootstrap trigger:**
- `supabase/migrations/20260306030002_bootstrap_autopilot_on_signup.sql` — create thread with `title = 'Agent'`, `is_primary = true`, `is_pinned = true`

### 6. Telegram pairing: Route to primary thread

**Current** (`app/api/webhook/telegram/route.ts:266`): Creates a new thread on pairing.

**Change:** Look up the primary thread and point the mapping there.

```typescript
const { data: primaryThread } = await supabase
  .from("conversation_threads")
  .select("thread_id")
  .eq("client_id", pairingToken.client_id)
  .eq("is_primary", true)
  .single();

await supabase.from("conversation_channel_mappings").insert({
  client_id: pairingToken.client_id,
  thread_id: primaryThread.thread_id,
  channel: "telegram",
  external_conversation_id: chatId,
});
```

No new thread created. The Telegram DM maps to the same thread the Agent page shows.

### 7. Telegram `/new` and `/main` commands

- `/new` — creates a task thread, updates mapping (existing behavior, unchanged)
- `/main` — **new command**: switches Telegram mapping back to primary thread

### 8. Pulse: Already fires in the right place

Pulse fires in the autopilot thread. That's now the primary thread. No change needed.

### 9. Delivery: Already works

`deliverToExternalChannels()` queries mappings by `thread_id`. Primary thread has Telegram mapping → pulse results deliver to Telegram automatically.

### 10. Runner unification (prerequisite)

`runAutopilot` becomes a thin wrapper around `runAgent` (design doc 03). Must ship before or alongside.

---

## What Doesn't Change

| Component | Status |
|-----------|--------|
| `conversation_channel_mappings` table | Same schema, same queries |
| `deliverToExternalChannels()` | Same logic, same routing |
| `conversation_channel_delivery_receipts` | Same idempotency mechanism |
| Approval flow | Same — approvals in primary thread deliver to Telegram |
| Question flow | Same — `telegram_pending_questions` unchanged |
| `ChatPanel` component | Reused on Agent page — same messages, composer, streaming |
| `/chat` route | Same — becomes "New Task" but logic unchanged |
| `/chat/[threadId]` route | Same — renders any thread by ID |
| Pulse trigger | Same `thread_id` (primary thread) |

---

## User Experience

### Before
1. User pairs Telegram → new thread, isolated
2. User chats on web → different thread
3. Pulse fires → results in "Sunder Autopilot" thread, unseen
4. No single "home" for the agent

### After
1. User opens app → "Agent" page shows onboarding or main session
2. User pairs Telegram → maps to primary thread
3. User chats on Agent page or Telegram → same thread, full context
4. Pulse fires → results in primary thread → delivered to Telegram
5. User creates tasks via "New Task" → separate threads in SESSIONS

### Telegram notification flow
```
Pulse fires (every 6h)
  → Agent runs in primary thread
  → Response saved → delivered to Telegram
  → User gets Telegram notification
  → User replies in Telegram → routes to primary thread
  → Agent sees full history (web + Telegram + pulse)
```

---

## AgentOnboarding Component (State 1)

Follows Manus onboarding layout:

```typescript
function AgentOnboarding() {
  return (
    <div className="flex flex-col items-center justify-center gap-8 p-8">
      {/* Messaging platform icons */}
      <div className="flex gap-4">
        <TelegramIcon />
        <WhatsAppIcon className="opacity-40" />  {/* coming soon */}
      </div>

      <h1 className="text-2xl font-bold">Deploy your agent</h1>

      {/* Feature cards */}
      <div className="grid grid-cols-4 gap-4">
        <FeatureCard title="Persistent memory" description="24/7 assistant with full context" />
        <FeatureCard title="CRM integration" description="Manages your contacts, deals, and tasks" />
        <FeatureCard title="Custom skills" description="Expert knowledge for your domain" />
        <FeatureCard title="Works in Telegram" description="Available on your phone" />
      </div>

      {/* CTA */}
      <TelegramPairingButton />

      {/* Coming soon */}
      <p className="text-sm text-muted">Coming soon: WhatsApp</p>
    </div>
  );
}
```

The `TelegramPairingButton` reuses existing pairing logic from the Settings/Channels page.

---

## Migration for Existing Users

**KISS approach:** Don't migrate old Telegram mappings. Pre-production, few users. Old threads stay as-is. On next pairing (or manual data migration), mapping updates to primary thread.

---

## Files to Touch

### Backend

| File | Change |
|------|--------|
| DB migration | Add `is_primary` column + partial unique index + data migration |
| `supabase/migrations/20260306030002_bootstrap_autopilot_on_signup.sql` | Create with `title = 'Agent'`, `is_primary = true` |
| `app/api/webhook/telegram/route.ts` | Pairing: look up primary thread. Add `/main` command. |
| `src/lib/autopilot/constants.ts` | Rename `AUTOPILOT_THREAD_TITLE` to `PRIMARY_THREAD_TITLE = "Agent"` |
| `src/types/database.ts` | Add `is_primary` to thread type |

### Frontend

| File | Change |
|------|--------|
| `app/(dashboard)/agent/page.tsx` | **Create** — Agent page (onboarding or chat, based on Telegram state) |
| `src/components/agent/agent-onboarding.tsx` | **Create** — onboarding component (Manus-style deploy screen) |
| `src/components/layout/app-sidebar.tsx` | Add "Agent" nav item, rename "Chat" to "New Task" |
| `src/hooks/use-threads.ts` or `src/contexts/thread-context.tsx` | Filter `is_primary` from session list |

---

## Scope Summary

| Change | Effort | Risk |
|--------|--------|------|
| Runner unification (design doc 03) | Small (thin wrapper) | Low |
| `is_primary` column + data migration | Small (migration) | Low |
| Update bootstrap | Small (SQL change) | Low |
| Telegram pairing → primary thread | Small (5 lines in webhook) | Low |
| `/main` command | Small (copy `/new` handler) | Low |
| `/agent` page + onboarding component | Medium (new page + component) | Low |
| Sidebar: add "Agent", rename "Chat" to "New Task" | Small (label + icon changes) | Low |
| Filter primary from session list | Small (one query filter) | Low |
| Delivery | Zero (already works) | None |

Total: ~2 days. Backend (migration, routing) + frontend (Agent page, onboarding, sidebar).

---

## What This Enables (Future)

- **WhatsApp pairing:** Same pattern. Maps to primary thread. Pulse delivers to both channels.
- **Multi-channel delivery:** Primary thread has multiple channel mappings.
- **Channel badges on messages:** "via Telegram", "Autopilot pulse" — deferred, not MVP.
- **Telegram session commands:** `/new` creates task threads. `/main` switches back.

---

## Drift from References

| Aspect | Manus | OpenClaw | Sunder (proposed) |
|--------|-------|----------|-------------------|
| Main session page | "Agents" nav item | N/A (CLI) | "Agent" nav item → `/agent` |
| Onboarding state | Deploy screen with Telegram CTA | N/A | Same — onboarding if not paired |
| Connected state | Persistent chat | `agent:main:main` session | Primary thread chat |
| Task threads | "New task" + "All tasks" | N/A | "New Task" nav item + SESSIONS list |
| Pulse/cron | N/A (not yet) | `--session main` | Fires in primary thread |
| Channel routing | Telegram only (WhatsApp coming) | All channels collapse to main | Telegram maps to primary thread |
