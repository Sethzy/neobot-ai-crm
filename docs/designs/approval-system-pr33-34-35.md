# Design: Approval System (PRs 33 + 34 + 35)

> **Status:** Draft — awaiting review
> **Date:** 2026-03-09
> **PRs:** 33 (gate implementation), 34 (events + UI), 35 (Mission Control)

---

## 1. Context

Sunder's safety model has two tiers (SAFETY-01):

- **Internal work** auto-runs (CRM reads, file reads, web search, memory writes)
- **External-facing actions** require user approval (CRM mutations, connection actions, future email/Telegram sends)

Today this is enforced via **prompt-only** — the system prompt tells the agent to describe the action and wait for the user to type "yes". There is no mechanical gate. The agent can (and occasionally does) skip the ask.

### What already exists (PR 22b)

The AI SDK integration and UI scaffolding is **already shipped**:

| Layer          | What's done                                                                                                        | File                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Message schema | `approval-requested`, `approval-responded`, `output-denied` states + `approval: { id, approved?, reason? }` object | `src/lib/chat/schemas.ts`                  |
| UI component   | Approve/Deny buttons on tool cards, amber pulsing dot, denied state                                                | `src/components/chat/tool-call-inline.tsx` |
| Chat panel     | `addToolApprovalResponse()` wired from useChat hook, `handleToolApproval` callback threaded to MessageList         | `src/components/chat/chat-panel.tsx`       |
| Transport      | Detects approval continuations, sends full message history on approval response                                    | `app/api/chat/route.ts`                    |
| Auto-continue  | `sendAutomaticallyWhen()` triggers on `approval-responded` + `approved === true`                                   | `src/components/chat/chat-panel.tsx`       |
| Message utils  | Extracts `tool-approval-request` and `tool-output-denied` content parts from steps, persists approval metadata     | `src/lib/runner/message-utils.ts`          |

**What's missing:** the backend gate that actually blocks tool execution.

---

## 2. AI SDK v6 `needsApproval` Pattern

AI SDK v6 provides a first-class `needsApproval` property on tools. This is the recommended pattern — no need to remove `execute` functions.

```typescript
// Static: always require approval
const createContact = tool({
  description: "Create a new CRM contact",
  inputSchema: createContactSchema,
  needsApproval: true,
  execute: async (args) => {
    /* ... */
  },
});

// Dynamic: conditional approval based on input
const paymentTool = tool({
  description: "Process a payment",
  inputSchema: z.object({ amount: z.number() }),
  needsApproval: async ({ amount }) => amount > 1000,
  execute: async (args) => {
    /* ... */
  },
});
```

**How it works:**

1. Model calls a tool with `needsApproval: true`
2. SDK emits `tool-approval-request` content part (with `approvalId`) instead of executing
3. Frontend renders approve/deny UI (already built in PR 22b)
4. User clicks → `addToolApprovalResponse({ id, approved })` → auto-continues via `sendAutomaticallyWhen`
5. On next request, SDK checks approval response:
   - **Approved:** `execute()` runs normally
   - **Denied:** model receives denial, responds accordingly

**Key insight:** We don't need to restructure our tools, split execute functions, or build a custom gate. We just add `needsApproval: true` to the right tools.

Sources:

- [AI SDK 6 announcement — Tool Execution Approval](https://vercel.com/blog/ai-sdk-6)
- [Next.js Human-in-the-Loop cookbook](https://ai-sdk.dev/cookbook/next/human-iun-the-loop)
- [Tool Execution Approval guide](https://oboe.com/learn/mastering-vercel-ai-sdk-v6-1nmf34r/tool-execution-approval-156v70c)

---

## 3. Design: PR 33 — Gate Implementation

### 3.1 Tool Classification

Two categories. No per-action granularity in v1 (SAFETY-04).

| Category                         | Approval                         | Tools                                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Internal (auto-run)**          | `needsApproval: false` (default) | `search_contacts`, `search_deals`, `search_tasks`, `search_interactions`, `describe_crm_schema`, `get_contact_deals`, `get_company_contacts`, `get_company_deals`, `get_deal_contacts`, `read_file`, `write_file` (memory only), `web_search`, `manage_todo`, `list_todo`, `list_triggers`, `get_trigger`                        |
| **External (approval required)** | `needsApproval: true`            | `create_contact`, `update_contact`, `batch_create_contacts`, `create_deal`, `update_deal`, `link_contact_to_deal`, `unlink_contact_from_deal`, `create_interaction`, `create_task`, `update_task`, `create_trigger`, `update_trigger`, `delete_trigger`, all `connection_*` mutation tools, future `send_email`, `send_telegram` |

### 3.2 Implementation

**Option A (recommended): Registry constant + factory injection**

```typescript
// src/lib/runner/tools/approval-registry.ts

/** Tools that require user approval before execution (SAFETY-01). */
export const TOOLS_REQUIRING_APPROVAL = new Set([
  "create_contact",
  "update_contact",
  "batch_create_contacts",
  "create_deal",
  "update_deal",
  "link_contact_to_deal",
  "unlink_contact_from_deal",
  "create_interaction",
  "create_task",
  "update_task",
  "create_trigger",
  "update_trigger",
  "delete_trigger",
  // Connection mutations (added dynamically from Composio)
  // Future: send_email, send_telegram
] as const);
```

Each tool factory adds `needsApproval: true` when the tool name is in the registry:

```typescript
// In createCrmTools, createTriggerTools, etc.
export function createCrmTools(supabase, clientId, options) {
  return {
    create_contact: tool({
      description: "...",
      inputSchema: createContactSchema,
      needsApproval: true, // ← add this
      execute: async (args) => {
        /* existing code unchanged */
      },
    }),
    search_contacts: tool({
      description: "...",
      inputSchema: searchContactsSchema,
      // no needsApproval — auto-runs
      execute: async (args) => {
        /* ... */
      },
    }),
  };
}
```

**Alternative (Option B): Wrapper in run-agent.ts that injects `needsApproval` post-creation.** This avoids touching every tool factory but is less explicit. Not recommended — we want approval intent visible at the tool definition site.

### 3.3 Autopilot Override

Autopilot runs (triggerType `"cron"` or `"trigger"`) currently have an `<approval-override>` in their system prompt that lets them auto-execute safe mutations. With the mechanical gate, we need to handle this:

- **Option A (recommended):** Pass `requireApproval: false` to tool factories for autopilot runs. The autopilot system prompt already defines which tools are safe to auto-execute (`create_task`, `update_task`, `log_interaction`, `manage_todo`, `write_file`). For autopilot, these tools skip `needsApproval`.
- **Option B:** Use `needsApproval: async (args) => triggerType === 'chat'` — dynamic based on run context. Cleaner but mixes concerns.

Decision: **Option A** — explicit flag in factory, consistent with existing `allowWriteTools` pattern.

### 3.4 System Prompt Cleanup

Remove the interim `<approval-required>` section from `system-prompt.ts` (lines 121-144). The mechanical gate replaces it. Keep a shorter note:

```markdown
<safety>
Write tools that modify CRM data, connections, or send external messages will
pause for your approval before executing. Read and search tools run immediately.
</safety>
```

### 3.5 Files Changed

| File                                        | Change                                                   |
| ------------------------------------------- | -------------------------------------------------------- |
| `src/lib/runner/tools/approval-registry.ts` | **New** — `TOOLS_REQUIRING_APPROVAL` set                 |
| `src/lib/runner/tools/crm/contacts.ts`      | Add `needsApproval: true` to create/update               |
| `src/lib/runner/tools/crm/deals.ts`         | Add `needsApproval: true` to create/update               |
| `src/lib/runner/tools/crm/interactions.ts`  | Add `needsApproval: true` to create                      |
| `src/lib/runner/tools/crm/tasks.ts`         | Add `needsApproval: true` to create/update               |
| `src/lib/runner/tools/crm/deal-contacts.ts` | Add `needsApproval: true` to link/unlink                 |
| `src/lib/runner/tools/crm/company-links.ts` | Add `needsApproval: true` to link tools                  |
| `src/lib/runner/tools/trigger-tools.ts`     | Add `needsApproval: true` to create/update/delete        |
| `src/lib/runner/tools/composio/`            | Add `needsApproval: true` to mutation tools              |
| `src/lib/ai/system-prompt.ts`               | Replace `<approval-required>` with short `<safety>` note |
| `src/lib/runner/run-agent.ts`               | Pass `requireApproval` flag based on triggerType         |

### 3.6 What We DON'T Build

- No custom approval middleware or interceptor
- No approval queue table (that's PR 34)
- No configurable approval matrix (SAFETY-04 — YAGNI'd for v1)
- No changes to message-utils, chat-panel, or tool-call-inline (already done in PR 22b)

---

## 4. Design: PR 34 — Approval Events + Trigger Thread Integration

### 4.1 `approval_events` Table

```sql
create table public.approval_events (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id),
  thread_id   uuid not null references public.threads(id),
  run_id      uuid,                          -- links to agent_runs if we have it
  tool_name   text not null,
  tool_input  jsonb not null default '{}',
  status      text not null default 'pending'
                check (status in ('pending', 'approved', 'denied', 'expired')),
  approval_id text not null,                 -- matches AI SDK approvalId
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- RLS: client_id tenant isolation
alter table public.approval_events enable row level security;
create policy "Clients see own approval events"
  on public.approval_events for all
  using (client_id = auth.uid());

-- Index for pending lookups
create index idx_approval_events_pending
  on public.approval_events (client_id, status)
  where status = 'pending';
```

### 4.2 Write Path

When the runner emits a `tool-approval-request`:

1. `onFinish` callback in `run-agent.ts` scans final steps for `tool-approval-request` content parts
2. For each, insert a row into `approval_events` with `status: 'pending'`
3. When user responds (approve/deny), the chat route updates the row to `approved`/`denied` + sets `resolved_at`

### 4.3 Trigger Thread Integration

When a trigger/cron run needs approval:

1. The run pauses (SDK stops after emitting approval request)
2. `approval_events` row created with `status: 'pending'`
3. The thread shows the pending tool call with approve/deny buttons (already rendered by PR 22b UI)
4. User opens the trigger thread → sees the pending approval → clicks approve/deny
5. `sendAutomaticallyWhen` triggers continuation

### 4.4 System-Reminder Integration

Add pending approval count to system-reminder:

```markdown
Pending approvals: 2
```

This helps the agent know there are unresolved approvals in the current thread.

### 4.5 Files Changed

| File                                             | Change                                                |
| ------------------------------------------------ | ----------------------------------------------------- |
| `supabase/migrations/XXXXXX_approval_events.sql` | **New** — table + RLS + index                         |
| `src/types/database.ts`                          | Regenerate with new table                             |
| `src/lib/runner/run-agent.ts`                    | Write `approval_events` rows on tool-approval-request |
| `app/api/chat/route.ts`                          | Update `approval_events` on approval response         |
| `src/lib/ai/system-prompt.ts`                    | Add pending approval count to system-reminder         |

### 4.6 What We DON'T Build

- No separate "Approvals Queue" page — approvals are resolved in-thread
- No push notifications for pending approvals (future consideration)
- No expiry/timeout logic in v1 (manual `expired` status available but not automated)

---

## 5. Design: PR 35 — Mission Control

### 5.1 Scope

Simple status dashboard. Not a full ops console. Replace the "Coming soon" stub at `/mission-control`.

### 5.2 Sections

| Section               | Data Source                                | Content                                      |
| --------------------- | ------------------------------------------ | -------------------------------------------- |
| **Agent Status**      | `agent_runs` or thread activity            | Last active time, current run status         |
| **Pending Approvals** | `approval_events where status = 'pending'` | Count + list with thread links               |
| **Active Triggers**   | `agent_triggers where enabled = true`      | Trigger name, type, last fired, next fire    |
| **Recent Runs**       | Last N thread messages with tool calls     | Thread title, tools used, timestamp          |
| **Memory Stats**      | Supabase Storage list                      | File count, total size, last updated         |
| **Quick Actions**     | Hardcoded links                            | "New chat", "View triggers", "CRM dashboard" |

### 5.3 Implementation

- Server component for initial data fetch
- TanStack Query for client-side refresh
- Supabase Realtime subscription for `approval_events` changes (pending count badge)
- Cards layout, responsive grid (mobile: stack, desktop: 2-3 columns)

### 5.4 Files Changed

| File                                       | Change                                               |
| ------------------------------------------ | ---------------------------------------------------- |
| `app/(dashboard)/mission-control/page.tsx` | **Rewrite** — replace stub with dashboard            |
| `src/hooks/use-approval-events.ts`         | **New** — TanStack Query hook for approval events    |
| `src/hooks/use-agent-activity.ts`          | **New** — TanStack Query hook for recent runs/status |
| `src/components/mission-control/`          | **New** — card components for each section           |

---

## 6. Execution Order & Dependencies

```
PR 33 (gate)  ──→  PR 34 (events table)  ──→  PR 35 (Mission Control)
```

- **PR 33** is standalone — adds `needsApproval` to tools, removes prompt-based approval
- **PR 34** depends on PR 33 — needs the mechanical gate to produce approval events
- **PR 35** depends on PR 34 — Mission Control shows pending approvals from the events table

### Estimated Complexity

| PR  | Complexity | Rationale                                                                                                                                |
| --- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 33  | **Small**  | Adding `needsApproval: true` to ~15 tool definitions + registry constant + system prompt cleanup. No new logic — SDK handles everything. |
| 34  | **Medium** | New migration, write path in runner, update path in chat route, system-reminder integration. Straightforward but touches multiple files. |
| 35  | **Medium** | New page with multiple data sources, but all queries are simple. No new backend logic beyond what PR 34 provides.                        |

---

## 7. Risk & Alternatives Considered

| Risk                                                    | Mitigation                                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `needsApproval` not supported on our AI SDK version     | We're on v6 beta — feature is confirmed. Pin to `ai@6.0.0-beta.128+`.                     |
| Autopilot runs blocked by approval with no user present | Autopilot tool factories skip `needsApproval` for safe tools (Option A in §3.3).          |
| Approval events table adds latency to every run         | Only writes on approval-request (not every tool call). Indexed for fast pending lookups.  |
| User ignores pending approval, thread stuck             | No expiry in v1. Agent can still respond to other messages. Future: add TTL-based expiry. |

**Alternative rejected:** The cookbook's "tools without execute functions" pattern. This requires splitting execute logic into a separate `processToolCalls` utility and restructuring the API route. The `needsApproval` property is simpler, keeps execute in place, and is the officially recommended approach for AI SDK v6.
