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
| `delete_trigger` | `src/lib/runner/tools/trigger-tools.ts` |
| `manage_activated_tools_for_connections` | `src/lib/runner/tools/connections/manage-tools.ts` |

Everything else auto-runs. No registry abstraction — just add `needsApproval: true` inline on each tool definition.

### Other PR 33 tasks

1. **System prompt:** Replace the `<approval-required>` block in `src/lib/ai/system-prompt.ts` (lines 121-144) with:
   ```markdown
   <safety>
   Destructive tools (deletes, connection activation) will pause for user approval
   before executing — the user sees an approve/deny card in chat.
   Before invoking a destructive tool, briefly describe what will be deleted and why.
   All other tools (creates, updates, reads, searches, tasks, memory) run immediately.
   </safety>
   ```
2. **Subagents:** Strip delete tools from the subagent tool registry in `src/lib/runner/run-subagent.ts`. Subagents can't use `needsApproval` (no user present).
3. **Autopilot:** No changes needed — autopilot doesn't delete things.
4. **Final step:** Review tool matrix with user, confirm nothing's missing.

## Key files to read first

- `docs/designs/approval-system-pr33-34-35.md` — full design with decisions log
- `src/lib/runner/tools/crm/index.ts` — tool barrel, see how tools are registered
- `src/components/chat/tool-call-inline.tsx` — existing approve/deny UI
- `src/components/chat/chat-panel.tsx` — `addToolApprovalResponse` + `sendAutomaticallyWhen` wiring
- `src/lib/ai/system-prompt.ts` — current `<approval-required>` section to replace

## How to verify

1. Add `needsApproval: true` to the 7 tools listed above
2. In chat, ask the agent to delete a contact → should see approval card, not immediate execution
3. Click Approve → tool executes, agent confirms deletion
4. Click Deny → agent acknowledges, does not delete
5. Non-delete tools (create, update, search) should still auto-run with no approval card

## What comes after (PR 34, 35)

PR 34 adds `approval_events` table for tracking approval history + system-reminder integration. PR 35 builds Mission Control dashboard. Both depend on PR 33. See the design doc for full specs and correct schema patterns (FKs, RLS, unique constraints).
