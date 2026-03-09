# PR 33: Approval Gate Implementation Tasklist

**PR:** 33

**Goal:** Wire `needsApproval: true` on destructive tools so the AI SDK pauses for user approval before executing. Swap the system prompt's `<approval-required>` section. Strip delete tools from subagents. Add minimal delete-tool smoke tests.

**Design doc:** `docs/designs/approval-system-pr33-34-35.md`
**Handover:** `docs/designs/pr33-approval-gate-handover.md`

**Approved scope:**
- Add `needsApproval: true` to 7 tools (5 CRM deletes + `delete_trigger` action in `manage_active_triggers` + `manage_activated_tools_for_connections`)
- Replace `<approval-required>` system prompt block with slim `<safety>` note
- Strip delete tools from subagent tool registry
- Minimal delete tool smoke tests (success + error per tool, ~10 tests)

**Non-goals:**
- No `approval_events` table (PR 34)
- No Mission Control dashboard (PR 35)
- No autopilot changes (autopilot doesn't delete things)
- No refactoring of delete tools — they're intentionally minimal

## Relevant Files

| File | Action |
|---|---|
| `src/lib/runner/tools/crm/__tests__/contacts.test.ts` | Modify: add delete_contact tests |
| `src/lib/runner/tools/crm/__tests__/deals.test.ts` | Modify: add delete_deal tests |
| `src/lib/runner/tools/crm/__tests__/companies.test.ts` | Modify: add delete_company tests |
| `src/lib/runner/tools/crm/__tests__/interactions.test.ts` | Modify: add delete_interaction tests |
| `src/lib/runner/tools/crm/__tests__/tasks.test.ts` | Modify: add delete_task tests |
| `src/lib/runner/tools/crm/contacts.ts` | Modify: add `needsApproval: true` to delete_contact |
| `src/lib/runner/tools/crm/deals.ts` | Modify: add `needsApproval: true` to delete_deal |
| `src/lib/runner/tools/crm/companies.ts` | Modify: add `needsApproval: true` to delete_company |
| `src/lib/runner/tools/crm/interactions.ts` | Modify: add `needsApproval: true` to delete_interaction |
| `src/lib/runner/tools/crm/tasks.ts` | Modify: add `needsApproval: true` to delete_task |
| `src/lib/runner/tools/connections/manage-tools.ts` | Modify: add `needsApproval: true` |
| `src/lib/runner/tools/triggers/manage-triggers.ts` | Modify: add `needsApproval: true` (conditional — only for mutating mode) |
| `src/lib/ai/system-prompt.ts` | Modify: replace `<approval-required>` block with `<safety>` |
| `src/lib/runner/tool-registry.ts` | Modify: strip delete tools from subagent path |
| `src/lib/runner/tools/crm/index.ts` | Modify: export helper for read+write-no-delete tools |
| `src/lib/runner/tools/crm/__tests__/index.test.ts` | Modify: add subagent tool-set assertion |

## Implementation Rules

1. Use `pnpm`, not `npm`.
2. Follow strict TDD:
   - Write a failing test
   - Run it and confirm the expected failure
   - Implement the minimum code to pass
   - Re-run the focused tests
3. Stage only touched files if committing. Never use `git add -A` in this repo.
4. `needsApproval` is a first-class AI SDK v6 property on `tool()` — no custom wrappers needed.

---

## Task 1: Delete tool smoke tests — contacts

**Files:**
- Modify: `src/lib/runner/tools/crm/__tests__/contacts.test.ts`

These tests cover the already-implemented `delete_contact` tool. No production code changes needed — tests should pass immediately against existing code. This is a coverage-gap task, not a TDD-from-scratch task.

### Step 1 — RED: Write delete_contact success test

Add a `describe("delete_contact")` block at the end of `contacts.test.ts`:

```typescript
describe("delete_contact", () => {
  it("deletes a contact by id and returns the deleted record", async () => {
    const deleted = {
      contact_id: "550e8400-e29b-41d4-a716-446655440000",
      first_name: "John",
      last_name: "Smith",
      email: "john@example.com",
    };
    const { client, builders } = createMockSupabase({
      contacts: { data: deleted, error: null },
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.delete_contact.execute(
      { contact_id: "550e8400-e29b-41d4-a716-446655440000" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, contact: deleted });
    expect(builders.contacts.delete).toHaveBeenCalled();
    expect(builders.contacts.eq).toHaveBeenCalledWith(
      "contact_id", "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(builders.contacts.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });
});
```

Run: `pnpm vitest run src/lib/runner/tools/crm/__tests__/contacts.test.ts`
Expected: PASS (tool already exists).

### Step 2 — RED: Write delete_contact error test

Add inside the same `describe("delete_contact")` block:

```typescript
  it("returns error when contact not found", async () => {
    const { client } = createMockSupabase({
      contacts: { data: null, error: { message: "Row not found" } },
    });
    const tools = createContactTools(client, CLIENT_ID);

    const result = await tools.delete_contact.execute(
      { contact_id: "00000000-0000-0000-0000-000000000000" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "Row not found" });
  });
```

Run: `pnpm vitest run src/lib/runner/tools/crm/__tests__/contacts.test.ts`
Expected: PASS.

### Checkpoint

Run full CRM test suite: `pnpm vitest run src/lib/runner/tools/crm/__tests__/`
Expected: All pass, 2 new tests added.

---

## Task 2: Delete tool smoke tests — deals, companies, interactions, tasks

**Files:**
- Modify: `src/lib/runner/tools/crm/__tests__/deals.test.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/companies.test.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/interactions.test.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/tasks.test.ts`

Same pattern as Task 1 — add `describe("delete_xxx")` blocks with success + error tests for each. All tests should pass against existing code.

### Step 1 — Add delete_deal tests to deals.test.ts

Add a `describe("delete_deal")` block. Mock table is `deals`, PK is `deal_id`, response key is `deal`.

```typescript
describe("delete_deal", () => {
  it("deletes a deal by id and returns the deleted record", async () => {
    const deleted = { deal_id: "...", title: "Bishan Condo" };
    const { client, builders } = createMockSupabase({
      deals: { data: deleted, error: null },
    });
    const tools = createDealTools(client, CLIENT_ID);

    const result = await tools.delete_deal.execute(
      { deal_id: deleted.deal_id },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, deal: deleted });
    expect(builders.deals.delete).toHaveBeenCalled();
    expect(builders.deals.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("returns error when deal not found", async () => {
    const { client } = createMockSupabase({
      deals: { data: null, error: { message: "Row not found" } },
    });
    const tools = createDealTools(client, CLIENT_ID);

    const result = await tools.delete_deal.execute(
      { deal_id: "00000000-0000-0000-0000-000000000000" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "Row not found" });
  });
});
```

### Step 2 — Add delete_company tests to companies.test.ts

Same pattern. Mock table is `companies`, PK is `company_id`, response key is `company`.

### Step 3 — Add delete_interaction tests to interactions.test.ts

Same pattern. Mock table is `interactions`, PK is `interaction_id`, response key is `interaction`.

### Step 4 — Add delete_task tests to tasks.test.ts

Same pattern. Mock table is `crm_tasks`, PK is `task_id`, response key is `task`.

### Checkpoint

Run: `pnpm vitest run src/lib/runner/tools/crm/__tests__/`
Expected: All pass, 10 new delete tests total (2 per entity x 5 entities).

---

## Task 3: Add `needsApproval: true` to CRM delete tools

**Files:**
- Modify: `src/lib/runner/tools/crm/contacts.ts`
- Modify: `src/lib/runner/tools/crm/deals.ts`
- Modify: `src/lib/runner/tools/crm/companies.ts`
- Modify: `src/lib/runner/tools/crm/interactions.ts`
- Modify: `src/lib/runner/tools/crm/tasks.ts`

### Step 1 — RED: Write needsApproval assertion for delete_contact

In `contacts.test.ts`, add inside the `describe("delete_contact")` block:

```typescript
  it("has needsApproval set to true", () => {
    const { client } = createMockSupabase();
    const tools = createContactTools(client, CLIENT_ID);

    expect(tools.delete_contact).toHaveProperty("needsApproval", true);
  });
```

Run: `pnpm vitest run src/lib/runner/tools/crm/__tests__/contacts.test.ts`
Expected: FAIL — `needsApproval` is undefined.

### Step 2 — GREEN: Add needsApproval to delete_contact

In `src/lib/runner/tools/crm/contacts.ts`, on the `delete_contact` tool definition, add `needsApproval: true`:

```typescript
const delete_contact = tool({
  description: "Permanently delete a contact by id...",
  inputSchema: z.object({ ... }),
  needsApproval: true,
  execute: async ({ contact_id }) => { ... },
});
```

Run: `pnpm vitest run src/lib/runner/tools/crm/__tests__/contacts.test.ts`
Expected: PASS.

### Step 3 — Repeat for remaining 4 delete tools

For each of `deals.ts`, `companies.ts`, `interactions.ts`, `tasks.ts`:
1. Add `needsApproval` assertion test (RED — confirm fail)
2. Add `needsApproval: true` to tool definition (GREEN — confirm pass)

### Checkpoint

Run: `pnpm vitest run src/lib/runner/tools/crm/__tests__/`
Expected: All pass, 5 new `needsApproval` tests added.

---

## Task 4: Add `needsApproval: true` to `manage_activated_tools_for_connections`

**Files:**
- Modify: `src/lib/runner/tools/connections/manage-tools.ts`

### Step 1 — Add needsApproval

Add `needsApproval: true` to the `manage_activated_tools_for_connections` tool definition in `createManageToolsTool`:

```typescript
manage_activated_tools_for_connections: tool({
  description: "Activates or deactivates tools for existing connections...",
  inputSchema: manageToolsInputSchema,
  needsApproval: true,
  execute: async ({ connections: connectionRequests }) => { ... },
}),
```

No test for this one — the Composio mock is heavyweight and the property is trivial. Covered by manual verification.

---

## Task 5: Add `needsApproval: true` to `manage_active_triggers` (mutating mode only)

**Files:**
- Modify: `src/lib/runner/tools/triggers/manage-triggers.ts`

### Step 1 — Add needsApproval

`manage_active_triggers` already has a `readOnly` mode that restricts to list/view. Add `needsApproval: true` only when NOT in read-only mode:

```typescript
const manage_active_triggers = tool({
  description: readOnly
    ? "List and inspect active user-created triggers..."
    : "List, inspect, edit, delete, or simulate active user-created triggers...",
  inputSchema: z.object({ ... }),
  ...(readOnly ? {} : { needsApproval: true }),
  execute: async (input) => { ... },
});
```

This means listing/viewing triggers in read-only subagent mode won't prompt for approval, but the full mutating version will.

Note: This gates ALL mutating trigger actions (edit, delete, simulate), not just delete. This is acceptable — trigger mutations are significant actions.

---

## Task 6: Strip delete tools from subagent tool registry

**Files:**
- Modify: `src/lib/runner/tools/crm/__tests__/index.test.ts`
- Modify: `src/lib/runner/tools/crm/index.ts`
- Modify: `src/lib/runner/tool-registry.ts`

### Step 1 — RED: Write subagent tool-set assertion

In `index.test.ts`, add a new test:

```typescript
it("excludes delete tools when allowDeleteTools is false", () => {
  const { client } = createMockSupabase();

  const tools = createCrmTools(client, CLIENT_ID, {
    allowWriteTools: true,
    allowDeleteTools: false,
  });

  const toolNames = Object.keys(tools).sort();
  expect(toolNames).not.toContain("delete_contact");
  expect(toolNames).not.toContain("delete_deal");
  expect(toolNames).not.toContain("delete_company");
  expect(toolNames).not.toContain("delete_interaction");
  expect(toolNames).not.toContain("delete_task");
  // Should still have write tools
  expect(toolNames).toContain("create_contact");
  expect(toolNames).toContain("update_contact");
});
```

Run: `pnpm vitest run src/lib/runner/tools/crm/__tests__/index.test.ts`
Expected: FAIL — `allowDeleteTools` option doesn't exist yet.

### Step 2 — GREEN: Add allowDeleteTools option to createCrmTools

In `src/lib/runner/tools/crm/index.ts`:

1. Add `allowDeleteTools?: boolean` to `CreateCrmToolsOptions` interface.
2. Destructure with default `true`: `const { allowDeleteTools = true, ... } = options ?? {}`.
3. In the write-tools return block, conditionally spread delete tools:

```typescript
return {
  ...readTools,
  create_company: companyTools.create_company,
  update_company: companyTools.update_company,
  batch_create_companies: companyTools.batch_create_companies,
  create_contact: contactTools.create_contact,
  update_contact: contactTools.update_contact,
  batch_create_contacts: contactTools.batch_create_contacts,
  create_deal: dealTools.create_deal,
  update_deal: dealTools.update_deal,
  batch_create_deals: dealTools.batch_create_deals,
  link_contact_to_company: companyLinkTools.link_contact_to_company,
  unlink_contact_from_company: companyLinkTools.unlink_contact_from_company,
  link_deal_to_company: companyLinkTools.link_deal_to_company,
  unlink_deal_from_company: companyLinkTools.unlink_deal_from_company,
  link_contact_to_deal: dealContactTools.link_contact_to_deal,
  unlink_contact_from_deal: dealContactTools.unlink_contact_from_deal,
  create_interaction: interactionTools.create_interaction,
  create_task: taskTools.create_task,
  update_task: taskTools.update_task,
  ...(allowDeleteTools ? {
    delete_company: companyTools.delete_company,
    delete_contact: contactTools.delete_contact,
    delete_deal: dealTools.delete_deal,
    delete_interaction: interactionTools.delete_interaction,
    delete_task: taskTools.delete_task,
  } : {}),
};
```

Run: `pnpm vitest run src/lib/runner/tools/crm/__tests__/index.test.ts`
Expected: PASS.

### Step 3 — Wire allowDeleteTools in tool-registry for subagents

In `src/lib/runner/tool-registry.ts`, update the CRM tools creation:

```typescript
const crmTools = createCrmTools(supabase, clientId, {
  allowWriteTools: true,
  allowDeleteTools: !isSubagent,
  mode: options?.crmMode ?? "normal",
  config: options?.crmConfig,
});
```

This strips delete tools from subagents since they can't present approval UI.

### Checkpoint

Run: `pnpm vitest run src/lib/runner/tools/crm/__tests__/`
Expected: All pass. Existing "returns all 33 expected CRM tools" test still passes (it uses default options where `allowDeleteTools` defaults to `true`).

---

## Task 7: Replace system prompt `<approval-required>` with `<safety>`

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`

### Step 1 — Replace the block

Replace lines 121-144 (the `<approval-required>...</approval-required>` block) with:

```markdown
<safety>
Destructive tools (deletes, connection activation) will pause for user approval
before executing — the user sees an approve/deny card in chat.
Before invoking a destructive tool, briefly describe what will be deleted and why.
All other tools (creates, updates, reads, searches, tasks, memory) run immediately.
</safety>
```

Also update the module-level JSDoc (lines 10-13) — remove the reference to "interim approval instructions" and note that the mechanical gate is now active.

### Checkpoint

Run: `pnpm vitest run src/lib/runner/tools/crm/__tests__/`
Expected: Still all pass (prompt changes don't affect tool tests).

---

## Task 8: Final review

### Step 1 — Run full test suite

```bash
pnpm vitest run
```

Expected: All tests pass.

### Step 2 — Manual verification checklist

Review with user:

| Tool | `needsApproval` | Subagent access |
|------|-----------------|-----------------|
| `delete_contact` | `true` | stripped |
| `delete_deal` | `true` | stripped |
| `delete_company` | `true` | stripped |
| `delete_interaction` | `true` | stripped |
| `delete_task` | `true` | stripped |
| `manage_active_triggers` (mutating) | `true` | already excluded (no trigger tools for subagents) |
| `manage_activated_tools_for_connections` | `true` | already read-only (allowMutations=false for subagents) |
| All other CRM tools | auto-run | full access |

### Step 3 — Commit

```bash
git add <specific files>
git commit -m "feat(pr33): approval gate — needsApproval on destructive tools, system prompt swap, subagent stripping"
```
