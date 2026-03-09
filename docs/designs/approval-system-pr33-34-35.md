# Design: Approval System (PRs 33 + 34 + 35)

> **Status:** Approved (v2)
> **Date:** 2026-03-09
> **PRs:** 33 (gate implementation), 34 (events + UI), 35 (Mission Control)

---

## 1. Context

Sunder's safety model (SAFETY-01) has two tiers: internal work auto-runs, external/destructive actions require approval. Today this is enforced via **prompt-only** — the `<approval-required>` system prompt section tells the agent to describe actions and wait for the user to type "yes". There is no mechanical gate.

### Design principle (decided 2026-03-09)

**Only gate destructive/irreversible actions.** Everything else auto-runs — let the AI fly. Creates, updates, reads, searches, memory writes, tasks, interactions, todos — all autonomous. The gate exists for things you can't undo: deletes and connection tool activation (which grants the agent new external capabilities).

### What already exists (PR 22b)

The AI SDK integration and UI scaffolding is **already shipped**:

| Layer | What's done | File |
|-------|------------|------|
| Message schema | `approval-requested`, `approval-responded`, `output-denied` states + `approval: { id, approved?, reason? }` object | `src/lib/chat/schemas.ts` |
| UI component | Approve/Deny buttons on tool cards, amber pulsing dot, denied state | `src/components/chat/tool-call-inline.tsx` |
| Chat panel | `addToolApprovalResponse()` from useChat hook, `handleToolApproval` callback threaded to MessageList | `src/components/chat/chat-panel.tsx` |
| Transport | Detects approval continuations, sends full message history on approval response | `app/api/chat/route.ts` |
| Auto-continue | `sendAutomaticallyWhen()` triggers on `approval-responded` + `approved === true` | `src/components/chat/chat-panel.tsx` |
| Message utils | Extracts `tool-approval-request` and `tool-output-denied` content parts from steps, persists approval metadata | `src/lib/runner/message-utils.ts` |

**What's missing:** the backend `needsApproval` flag on destructive tools.

---

## 2. AI SDK v6 `needsApproval` Pattern

AI SDK v6 provides a first-class `needsApproval` property on tools. The tool keeps its `execute` function — the SDK pauses execution until the user approves.

```typescript
const deleteDeal = tool({
  description: 'Permanently delete a deal',
  inputSchema: deleteDealSchema,
  needsApproval: true,
  execute: async (args) => { /* existing code unchanged */ },
});
```

**Flow:**
1. Model calls a tool with `needsApproval: true`
2. SDK emits `tool-approval-request` (with `approvalId`) instead of executing
3. Frontend renders approve/deny UI (already built in PR 22b)
4. User clicks Approve → `addToolApprovalResponse({ id, approved: true })` → `sendAutomaticallyWhen` auto-continues
5. SDK runs `execute()` on approval, or delivers denial to model

Sources:
- [AI SDK 6 — Tool Execution Approval](https://vercel.com/blog/ai-sdk-6)
- [Next.js Human-in-the-Loop cookbook](https://ai-sdk.dev/cookbook/next/human-in-the-loop)

---

## 3. Design: PR 33 — Gate Implementation

### 3.1 Tool Classification

Only destructive actions are gated. Everything else auto-runs.

| Category | `needsApproval` | Tools |
|----------|----------------|-------|
| **Auto-run** | `false` (default) | All reads, searches, creates, updates, links, unlinking, tasks, interactions, todos, memory, file tools, web search, triggers (create/update/list/get), subagent delegation |
| **Approval required** | `true` | CRM delete tools (contacts, deals, companies, interactions, tasks), `delete_trigger`, `manage_activated_tools_for_connections` |

> **Note:** `manage_activated_tools_for_connections` already has its own Tasklet-style UI approval card (user approves permission changes). Adding `needsApproval` provides a mechanical gate in addition to the UI card. Future external sends (`send_email`, `send_telegram`) will be added to the approval list when PR 32a ships.

### 3.2 Implementation

Add `needsApproval: true` directly on each gated tool definition. No registry abstraction needed — the list is short (~8 tools) and unlikely to change often.

```typescript
// Example: src/lib/runner/tools/crm/contacts.ts
delete_contact: tool({
  description: 'Permanently delete a contact and all associated data',
  inputSchema: deleteContactSchema,
  needsApproval: true,
  execute: async (args) => { /* ... */ },
}),
```

### 3.3 Autopilot & Subagents

- **Autopilot:** Won't hit approval gates in practice — autopilot doesn't delete records. The `<approval-override>` prompt stays as-is. No factory flag changes needed.
- **Subagents:** System prompt already says "Do not delegate anything that requires direct user interaction or approval-gated external actions" (`system-prompt.ts:117`). Subagents cannot use `needsApproval` (no user present). For safety, **strip delete tools from subagent tool registries** — don't give them tools they can't use.
- **Dynamically loaded Composio tools:** Once activated, connection tools auto-run. The gate is on `manage_activated_tools_for_connections` (activating them), not on individual activated tools. When external sends ship (PR 32a), we'll add `needsApproval` to send-type connection actions.

### 3.4 System Prompt Update

Replace the verbose `<approval-required>` section (lines 121-144) with a slim note. Keep a conversational instruction so the agent explains destructive actions before triggering the approval card:

```markdown
<safety>
Destructive tools (deletes, connection activation) will pause for user approval
before executing — the user sees an approve/deny card in chat.
Before invoking a destructive tool, briefly describe what will be deleted and why.
All other tools (creates, updates, reads, searches, tasks, memory) run immediately.
</safety>
```

### 3.5 Files Changed

| File | Change |
|------|--------|
| `src/lib/runner/tools/crm/contacts.ts` | Add `needsApproval: true` to `delete_contact` |
| `src/lib/runner/tools/crm/deals.ts` | Add `needsApproval: true` to `delete_deal` |
| `src/lib/runner/tools/crm/companies.ts` | Add `needsApproval: true` to `delete_company` |
| `src/lib/runner/tools/crm/interactions.ts` | Add `needsApproval: true` to `delete_interaction` |
| `src/lib/runner/tools/crm/tasks.ts` | Add `needsApproval: true` to `delete_task` |
| `src/lib/runner/tools/trigger-tools.ts` | Add `needsApproval: true` to `delete_trigger` |
| `src/lib/runner/tools/connections/manage-tools.ts` | Add `needsApproval: true` to `manage_activated_tools_for_connections` |
| `src/lib/ai/system-prompt.ts` | Replace `<approval-required>` with slim `<safety>` note |
| `src/lib/runner/run-subagent.ts` | Strip delete tools from subagent tool registry |
| **Final step** | Review tool matrix with user, confirm nothing's missing |

### 3.6 What We DON'T Build

- No approval registry abstraction (list is short, just set `needsApproval` inline)
- No autopilot factory flag changes (autopilot doesn't delete things)
- No custom middleware or interceptor (SDK handles it)
- No changes to message-utils, chat-panel, or tool-call-inline (already done in PR 22b)
- No gating of Composio activated tools (gate is on activation, not usage)
- No `write_file` path-aware gating (fully auto-run in v1)

---

## 4. Design: PR 34 — Approval Events + Trigger Thread Integration

### 4.1 `approval_events` Table

```sql
create table public.approval_events (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(client_id),
  thread_id   uuid not null references public.conversation_threads(thread_id),
  run_id      uuid references public.runs(run_id),
  tool_name   text not null,
  tool_input  jsonb not null default '{}',
  status      text not null default 'pending'
                check (status in ('pending', 'approved', 'denied', 'expired')),
  approval_id text not null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),

  constraint uq_approval_events_approval_id unique (client_id, approval_id)
);

alter table public.approval_events enable row level security;

create policy "approval_events_select"
  on public.approval_events for select
  using (client_id = public.get_my_client_id());

create policy "approval_events_insert"
  on public.approval_events for insert
  with check (client_id = public.get_my_client_id());

create policy "approval_events_update"
  on public.approval_events for update
  using (client_id = public.get_my_client_id())
  with check (client_id = public.get_my_client_id());

create index idx_approval_events_pending
  on public.approval_events (client_id, status)
  where status = 'pending';
```

### 4.2 Write Path

1. `onFinish` in `run-agent.ts` scans steps for `tool-approval-request` content parts
2. For each, upsert into `approval_events` with `status: 'pending'` (unique on `client_id, approval_id` prevents duplicates on retries)
3. When user responds (approve/deny), chat route updates the row → `approved`/`denied` + `resolved_at = now()`

### 4.3 Trigger Thread Integration

When a trigger/cron run hits an approval-gated tool (unlikely for deletes, but possible for future sends):
1. Run pauses (SDK stops after emitting approval request)
2. `approval_events` row created with `status: 'pending'`
3. Thread shows pending tool call with approve/deny buttons (PR 22b UI)
4. User opens trigger thread → approves/denies → `sendAutomaticallyWhen` continues

**Known limitation:** Trigger thread approval continuation may need a server-side resume path since trigger runs don't persist a user message. This is deferred — unlikely to trigger in v1 since autopilot doesn't delete. Will address when external sends (PR 32a) make trigger-thread approvals realistic.

### 4.4 System-Reminder Integration

Add pending approval count to system-reminder:

```markdown
Pending approvals: 2
```

### 4.5 Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/XXXXXX_approval_events.sql` | **New** — table + RLS + indexes |
| `src/types/database.ts` | Regenerate with new table |
| `src/lib/runner/run-agent.ts` | Write `approval_events` on tool-approval-request in `onFinish` |
| `app/api/chat/route.ts` | Update `approval_events` on approval response |
| `src/lib/runner/system-reminder.ts` | Add pending approval count |

### 4.6 What We DON'T Build

- No separate "Approvals Queue" page — approvals are resolved in-thread
- No push notifications for pending approvals
- No expiry/timeout automation (column exists, logic deferred)
- No trigger-thread server-side resume path (deferred until external sends ship)

---

## 5. Design: PR 35 — Mission Control

### 5.1 Scope

Simple status summary per the v2 plan (UX-03). Replace the "Coming soon" stub at `/mission-control`. Not a full ops console.

### 5.2 Sections

| Section | Data Source | Content |
|---------|------------|---------|
| **Pending Approvals** | `approval_events where status = 'pending'` | Count + list with thread links |
| **Active Triggers** | `agent_triggers where enabled = true` | Trigger name, type, last fired |
| **Recent Runs** | `runs` table (last N) | Thread title, status, model, timestamp |
| **Memory Stats** | Supabase Storage list | File count, total size, last updated |
| **Quick Actions** | Hardcoded links | "New chat", "View triggers", "CRM dashboard" |

### 5.3 Implementation

- Server component for initial data fetch
- TanStack Query for client-side refresh
- Supabase Realtime subscription for `approval_events` (pending count updates live)
- Responsive card grid (mobile: stack, desktop: 2-3 columns)

### 5.4 Files Changed

| File | Change |
|------|--------|
| `app/(dashboard)/mission-control/page.tsx` | **Rewrite** — replace stub |
| `src/hooks/use-approval-events.ts` | **New** — TanStack Query hook |
| `src/hooks/use-recent-runs.ts` | **New** — TanStack Query hook |
| `src/components/mission-control/` | **New** — card components |

---

## 6. Execution Order & Dependencies

```
PR 33 (gate)  ──→  PR 34 (events table)  ──→  PR 35 (Mission Control)
```

- **PR 33** is standalone — adds `needsApproval` to destructive tools + prompt cleanup
- **PR 34** depends on PR 33 — needs the gate to produce approval events
- **PR 35** depends on PR 34 — Mission Control shows pending approvals
- **Not blocked on PR 32a** (email) — validate on CRM deletes + connection activation

**Prerequisite:** CRM delete tools must exist before PR 33 is meaningful. Add delete tools first, then ship PR 33.

### Estimated Complexity

| PR | Complexity | Rationale |
|----|-----------|-----------|
| 33 | **Small** | `needsApproval: true` on ~8 tool definitions + system prompt swap. SDK handles everything else. |
| 34 | **Medium** | Migration + write/update path + system-reminder integration. Straightforward. |
| 35 | **Medium** | New page with queries. No new backend logic. |

---

## 7. Decisions Log

| # | Question | Decision |
|---|----------|----------|
| 1 | Which tools are gated? | Only destructive: CRM deletes, `delete_trigger`, `manage_activated_tools_for_connections`. Everything else auto-runs. |
| 2 | Composio activated tools? | Auto-run once activated. Gate is on activation (`manage_activated_tools_for_connections`), not on individual tool usage. Future sends get `needsApproval` when PR 32a ships. |
| 3 | Subagents? | Strip delete tools from subagent registries. Subagents can't use `needsApproval` (no user). |
| 4 | Trigger thread resume? | Deferred — autopilot won't hit deletes. Address when external sends make it realistic. |
| 5 | `write_file` gating? | Fully auto-run. No path-aware split in v1. |
| 6 | Schema patterns? | Fixed: `clients(client_id)`, `conversation_threads(thread_id)`, `runs(run_id)`, `get_my_client_id()` RLS, unique `(client_id, approval_id)`. |
| 7 | Prompt cleanup? | Keep slim `<safety>` instruction — agent describes destructive action before invoking. Don't remove conversational explanation entirely. |
| 8 | PR 32a dependency? | Decoupled. Validate on CRM deletes + connection activation. |

---

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| `needsApproval` not on our SDK version | Confirmed in AI SDK v6. We're on v6 beta. |
| Autopilot hits an approval gate | Won't happen — autopilot doesn't delete. Prompt override stays as backup. |
| User ignores pending approval | Thread not stuck — agent can still respond. No expiry in v1. |
| CRM delete tools don't exist yet | **Prerequisite** — add delete tools before PR 33. |
