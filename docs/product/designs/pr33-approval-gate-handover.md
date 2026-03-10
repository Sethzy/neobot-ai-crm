# PR 33 Handover: Approval Gate Implementation

## What's done

1. **Design doc approved:** `docs/designs/approval-system-pr33-34-35.md` — covers PRs 33, 34, 35 with all decisions finalized.
2. **CRM delete tools added:** 5 new tools (`delete_contact`, `delete_deal`, `delete_company`, `delete_interaction`, `delete_task`) in `src/lib/runner/tools/crm/`. All tests pass (162/162). Wired into `index.ts` behind `allowWriteTools`.
3. **PR 22b UI already shipped:** Approve/deny buttons, message schemas, transport wiring, `sendAutomaticallyWhen` auto-continue — all working in `chat-panel.tsx`, `tool-call-inline.tsx`, `schemas.ts`, `message-utils.ts`.

## What to build (PR 33)

Add `needsApproval: true` to these tools (and only these):

| Tool | File |
|------|------|
| `delete_contact` | `src/lib/runner/tools/crm/contacts.ts` |
| `delete_deal` | `src/lib/runner/tools/crm/deals.ts` |
| `delete_company` | `src/lib/runner/tools/crm/companies.ts` |
| `delete_interaction` | `src/lib/runner/tools/crm/interactions.ts` |
| `delete_task` | `src/lib/runner/tools/crm/tasks.ts` |
| `delete_connection` | `src/lib/runner/tools/connections/delete-connection.ts` |
| `manage_activated_tools_for_connections` | `src/lib/runner/tools/connections/manage-tools.ts` |
| `manage_active_triggers` delete action | `src/lib/runner/tools/triggers/manage-triggers.ts` |

Everything else auto-runs. No registry abstraction — just add `needsApproval` inline on each tool definition. For triggers, use a predicate so only `action === "delete"` is gated.

### Other PR 33 tasks

1. **System prompt:** Replace the `<approval-required>` block in `src/lib/ai/system-prompt.ts` (lines 121-144) with:
   ```markdown
   <safety>
   Destructive tools (deletes) and connection tool activation will pause for user approval
   before executing — the user sees an approve/deny card in chat.
   Before invoking one of these tools, briefly describe what will change and why.
   All other tools (creates, updates, reads, searches, tasks, memory, and unlinks) run immediately.
   </safety>
   ```
2. **Subagents:** Strip approval-gated delete tools from the subagent tool registry in `src/lib/runner/tool-registry.ts` via the CRM factory option in `src/lib/runner/tools/crm/index.ts`. Subagents can't use `needsApproval` (no user present), so this is a deliberate RUNNER-06 exception.
3. **Autopilot:** No behavior change, but refresh the stale `<approval-override>` copy in `src/lib/autopilot/constants.ts` so it references `<safety>` and forbids destructive tools plus connection activation.
4. **Final step:** Review tool matrix with user, confirm nothing's missing.

## Key files to read first

- `docs/designs/approval-system-pr33-34-35.md` — full design with decisions log
- `src/lib/runner/tools/crm/index.ts` — tool barrel, see how tools are registered
- `src/components/chat/tool-call-inline.tsx` — existing approve/deny UI
- `src/components/chat/chat-panel.tsx` — `addToolApprovalResponse` + `sendAutomaticallyWhen` wiring
- `src/lib/ai/system-prompt.ts` — current `<approval-required>` section to replace

## How to verify

1. Add approval gating to the 8 approval-gated surfaces listed above
2. In chat, ask the agent to delete a contact → should see approval card, not immediate execution
3. Click Approve → tool executes, agent confirms deletion
4. Click Deny → agent acknowledges, does not delete
5. Ask the agent to delete a connection → should also show approval card
6. Non-delete tools (create, update, search, link, unlink) should still auto-run with no approval card

## What comes after (PR 34, 35)

PR 34 adds `approval_events` table for tracking approval history + system-reminder integration. PR 35 builds Mission Control dashboard. Both depend on PR 33. See the design doc for full specs and correct schema patterns (FKs, RLS, unique constraints).
