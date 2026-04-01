# Review: Remove needsApproval, Replace with ask_user_question Gating

## What changed and why

We made `configure_crm` always-available (replacing the old time-limited `crm_config_mode_until` DB flag + settings toggle + `disable_crm_config_mode` tool). Initially we gated it with the AI SDK's `needsApproval: true` pattern, but this was fundamentally incompatible with Sunder's stateful runner architecture:

- The SDK's approval flow assumes **stateless** servers (client sends full message history every request)
- Sunder's runner is **stateful** (loads message history from DB, persists messages itself)
- The state transition `approval-requested` → `approval-responded` happens on the client, but the server reloads from DB where it's still `approval-requested`
- This caused `MissingToolResultsError`, infinite loops, `thought_signature` errors with Gemini, and required increasingly fragile patching

**Decision:** Remove `needsApproval` from ALL tools. Replace with system prompt instructions that require the model to call `ask_user_question` before any destructive tool. `ask_user_question` works natively with the stateful architecture — it's a normal tool call with `stopWhen`, the user's answer arrives as a regular message, no special state management needed.

## What to verify

### 1. Zero `needsApproval` references remain in source

```bash
grep -r "needsApproval" src/
# Should return nothing
```

These tools previously had `needsApproval`:
- `configure_crm` — `needsApproval: true` (removed)
- `delete_records` — `needsApproval: true` (removed)
- `delete_connection` — `needsApproval: true` (removed)
- `manage_activated_tools_for_connections` — `needsApproval: true` (removed)
- `manage_active_triggers` — `needsApproval: ({ action }) => action === "delete"` (removed)

### 2. System prompt safety gating is strict

In `src/lib/ai/system-prompt.ts`, the `<safety>` section now has an explicit **GATED TOOLS** list with a 4-step protocol (explain → ask_user_question → wait for approve → only then call). Check:

- Are all 4 gated tools named? (`configure_crm`, `delete_records`, `delete_connection`, `manage_activated_tools_for_connections`)
- Is `manage_active_triggers` missing from the list? (It had conditional approval only for deletes — should it be gated too?)
- Is the language strict enough that Gemini Flash 3 actually complies? Test with: "Add three custom fields to deals: expected_close_date (date), commission_rate (number), referral_source (text)."

### 3. Frontend approval infrastructure is fully removed

- `sendAutomaticallyWhen` — removed from `useChat` options in `chat-panel.tsx`
- `lastAssistantMessageIsCompleteWithApprovalResponses` — no longer imported
- `Confirmation` component — no longer wired into `message-bubble.tsx` (still exists at `src/components/ai-elements/confirmation.tsx` as dead code)
- `approvalResponses` — removed from runner payload schema, `assembleContext`, `run-agent.ts`, `chat/route.ts`, `continue-after-approval.ts`
- `patchApprovalParts` — removed from `context.ts`

### 4. CRM config mode infrastructure is fully deleted

From the original commit (`035e420`):
- `app/(dashboard)/settings/crm-config-mode-card.tsx` — deleted
- `app/api/settings/crm-config-mode/route.ts` + test — deleted
- `src/lib/runner/tools/crm/disable-config-mode.ts` + test — deleted
- `crm_config_mode_until` column — migration to drop it at `supabase/migrations/20260401120000_drop_crm_config_mode.sql`
- `includeConfigTool` flag — removed from schemas, tool-registry, run-agent, context, system-reminder, chat route
- Settings page — no longer loads or renders CRM config mode card

### 5. `configure_crm` is always in the tool registry

- In `src/lib/runner/tools/crm/index.ts`, `configure_crm` is behind `allowDeleteTools` — available in parent chat runs, excluded from subagent registries
- This is intentional: subagents cannot use `ask_user_question` to gate destructive actions, so they should not have access to schema-modifying tools

### 6. Dead approval infrastructure (low priority cleanup)

These files/tables still exist but are now dead code (never triggered since no tools have `needsApproval`):
- `approval_events` DB table + RLS policies + migration
- `src/lib/approvals/queries.ts` (createApprovalEvent, resolveApprovalEvent, expireApprovalEvent)
- `extractApprovalRequests` in `src/lib/runner/run-persistence.ts`
- `extractApprovalPartsFromPersisted` in `src/lib/runner/message-utils.ts`
- `getApprovalResponses` in `app/api/chat/route.ts`
- `resolveApprovalEvent` call in `app/api/chat/route.ts`
- `continue-after-approval.ts` (Telegram approval continuation)
- `hasApprovalContinuationState` in `chat-panel.tsx`
- `addToolApprovalResponse` destructured from `useChat`
- `pending_approval_count` in system-reminder context
- `src/components/ai-elements/confirmation.tsx` (unused component)
- `src/components/chat/tool-call-inline.tsx` approval button rendering

None of this is harmful — it just never executes. Can be cleaned up in a follow-up PR if desired.

### 7. AI SDK packages were upgraded

- `@ai-sdk/gateway`: 3.0.22 → 3.0.84
- `@ai-sdk/react`: 3.0.41 → 3.0.144
- `ai`: 6.0.116 → 6.0.142

This was to fix `thought_signature` errors with Gemini 3, which is now moot since we removed `needsApproval`. But the upgrades are good to keep — they include other bug fixes.

## Test coverage

- 939 tests pass across runner + chat route + UI + approval suites
- Tests removed: `needsApproval` assertions from 5 tool test files
- Tests updated: CRM index tests, chat-panel `sendAutomaticallyWhen` test, continue-after-approval tests

## Files changed

```
app/api/chat/route.ts                                  — approval continuation input handling
src/lib/ai/system-prompt.ts                             — GATED TOOLS list + ask_user_question instructions
src/lib/runner/tools/crm/configure-crm.ts               — removed needsApproval
src/lib/runner/tools/crm/delete-records.ts              — removed needsApproval
src/lib/runner/tools/crm/index.ts                       — configure_crm out of allowDeleteTools gate
src/lib/runner/tools/connections/delete-connection.ts   — removed needsApproval
src/lib/runner/tools/connections/manage-tools.ts        — removed needsApproval
src/lib/runner/tools/triggers/manage-triggers.ts        — removed needsApproval
src/components/chat/chat-panel.tsx                      — removed sendAutomaticallyWhen
src/components/chat/message-bubble.tsx                  — removed Confirmation wiring
src/components/chat/chat-panel.test.tsx                 — updated approval tests
+ test files for each tool above
```
