# CRM Schema Awareness — System Prompt + Tool

**Goal:** Give the agent full knowledge of each client's CRM field definitions — both passively in the system prompt (prevention) and on-demand via the `get_agent_db_schema` tool (recovery).

**Architecture:** A shared `formatFieldDefinitions()` function renders `FieldDefinition[]` arrays into compact text. It's called from two places: (1) `buildCrmVocabularyBlock()` in platform-instructions.ts to auto-inject into every system prompt, and (2) `get_agent_db_schema` tool in sql.ts to enrich the response when the agent explicitly requests schema info. Both read from the per-client `crm_config` row.

**Tech Stack:** TypeScript, Vitest, Vercel AI SDK `tool()`, Supabase, Zod

**Plan:** `.claude/plans/dreamy-tinkering-haven.md`

---

## Design Decisions (resolved during review)

These decisions were made after an executor review surfaced 5 issues with the original plan. Apply these as hard constraints:

1. **Key mismatch — labels only in passive prompt.** `FieldDefinition.key` is a display concept, not a storage key (e.g. `name` ≠ `first_name + last_name` in contacts). The passive system prompt must show **labels and types only** (e.g. `Name (full_name, required)`) — no keys. The `get_agent_db_schema` tool response includes keys because the agent explicitly asked for schema details and can cross-reference with the raw column list.

2. **Keep legacy custom field summaries.** Do NOT remove or rename `formatCustomFieldDefinitionSummary()`. The `*_custom_fields` and `*_fields` arrays coexist and may diverge. Keep the existing deal/contact/company/task custom field summary lines. Append the new field definition lines below them. Redundancy is fine.

3. **Pass `crmConfig` through — don't load twice.** The runner already loads `crmConfig` at the start of every run. Pass it as an optional param to `createSqlTools()`. Only fall back to `loadCrmConfig()` if not supplied. This avoids a duplicate DB call.

4. **Strict error contract.** On `get_agent_db_schema` RPC failure, return only `{ success: false, error }`. No partial `crm_fields`. Clean and consistent with every other tool.

5. **Tasklist is advisory.** Verify file paths, match repo conventions, and read existing code before implementing each step.

---

## Relevant Files

**Modify:**
- `src/lib/ai/platform-instructions.ts` — add `formatFieldDefinitions()`, update vocabulary block
- `src/lib/ai/__tests__/platform-instructions.test.ts` — tests for field injection
- `src/lib/ai/__tests__/platform-instructions-configurable.test.ts` — tests with escaping
- `src/lib/runner/__tests__/context-crm-config.test.ts` — verify fields in assembled context
- `src/lib/runner/tools/utility/sql.ts` — enrich `get_agent_db_schema` with CRM fields
- `src/lib/runner/tools/utility/index.ts` — pass `crmConfig` to `createSqlTools()`
- `src/lib/runner/tools/utility/__tests__/sql.test.ts` — tests for enriched schema tool
- `src/lib/runner/tools/utility/__tests__/index.test.ts` — update `createSqlTools` call signature

**Reference (read-only):**
- `src/lib/crm/field-definitions.ts` — `FieldDefinition` type, `CONTACT_DEFAULT_FIELDS`, `COMPANY_DEFAULT_FIELDS`, `DEAL_DEFAULT_FIELDS`
- `src/lib/crm/config.ts` — `CrmVocabConfig`, `CRM_DEFAULTS`, `loadCrmConfig()`
- `src/lib/runner/system-reminder.ts` — `escapeXml()`
- `src/lib/runner/context.ts` — `assembleContext()` pipeline
- `src/lib/runner/run-agent.ts` — where `crmConfig` is loaded and passed to tool creation
- `src/lib/runner/tool-registry.ts` — `createRunnerTools()` where `createUtilityTools()` is called

---

## Batch 1 — Shared Formatter: `formatFieldDefinitions()`

### Task 1: Add `formatFieldDefinitions()` to platform-instructions.ts

**Files:**
- Modify: `src/lib/ai/platform-instructions.ts`
- Modify: `src/lib/ai/__tests__/platform-instructions.test.ts`

**Step 1: Write failing tests for `formatFieldDefinitions`**

Add to `src/lib/ai/__tests__/platform-instructions.test.ts`:

**IMPORTANT:** Per decision #1, the passive formatter omits keys. Format is `Label (type, annotations) [extras]` — NOT `key — Label (...)`.

```typescript
import { formatFieldDefinitions } from "../platform-instructions";
import type { FieldDefinition } from "@/lib/crm/field-definitions";

describe("formatFieldDefinitions", () => {
  it("formats a basic visible editable text field — label and type only, no key", () => {
    const fields: FieldDefinition[] = [
      { key: "name", label: "Name", type: "text", source: "column", tier: "indestructible", visible: true, order: 0, editable: true, required: true },
    ];
    expect(formatFieldDefinitions(fields)).toBe("Name (text, required)");
  });

  it("marks hidden fields", () => {
    const fields: FieldDefinition[] = [
      { key: "city", label: "City", type: "text", source: "column", tier: "default", visible: false, order: 0, editable: true, required: false },
    ];
    expect(formatFieldDefinitions(fields)).toBe("City (text) [hidden]");
  });

  it("marks read-only fields", () => {
    const fields: FieldDefinition[] = [
      { key: "created_at", label: "Created", type: "date", source: "column", tier: "default", visible: true, order: 0, editable: false, required: false },
    ];
    expect(formatFieldDefinitions(fields)).toBe("Created (date, read-only)");
  });

  it("marks custom source fields", () => {
    const fields: FieldDefinition[] = [
      { key: "budget", label: "Budget", type: "currency", source: "custom", tier: "custom", visible: true, order: 0, editable: true, required: false },
    ];
    expect(formatFieldDefinitions(fields)).toBe("Budget (currency, custom)");
  });

  it("shows relation target", () => {
    const fields: FieldDefinition[] = [
      { key: "company_id", label: "Company", type: "relation", source: "column", tier: "default", visible: true, order: 0, editable: true, required: false, related_entity: "companies" },
    ];
    expect(formatFieldDefinitions(fields)).toBe("Company (relation \u2192 companies)");
  });

  it("shows select options", () => {
    const fields: FieldDefinition[] = [
      { key: "type", label: "Type", type: "select", source: "column", tier: "default", visible: true, order: 0, editable: true, required: false, options: ["buyer", "seller"] },
    ];
    expect(formatFieldDefinitions(fields)).toBe("Type (select) [options: buyer, seller]");
  });

  it("sorts by order", () => {
    const fields: FieldDefinition[] = [
      { key: "b", label: "B", type: "text", source: "column", tier: "default", visible: true, order: 2, editable: true, required: false },
      { key: "a", label: "A", type: "text", source: "column", tier: "default", visible: true, order: 1, editable: true, required: false },
    ];
    expect(formatFieldDefinitions(fields)).toBe("A (text); B (text)");
  });

  it("combines multiple annotations", () => {
    const fields: FieldDefinition[] = [
      { key: "budget", label: "Budget", type: "currency", source: "custom", tier: "custom", visible: false, order: 0, editable: false, required: true },
    ];
    expect(formatFieldDefinitions(fields)).toBe("Budget (currency, required, read-only, custom) [hidden]");
  });

  it("escapes XML-unsafe characters in labels and options", () => {
    const fields: FieldDefinition[] = [
      { key: "tier", label: 'Tier "Band"', type: "select", source: "column", tier: "default", visible: true, order: 0, editable: true, required: false, options: ["a & b", "c <d>"] },
    ];
    const result = formatFieldDefinitions(fields);
    expect(result).toContain("Tier &quot;Band&quot;");
    expect(result).toContain("a &amp; b");
    expect(result).toContain("c &lt;d&gt;");
  });

  it("returns empty string for empty array", () => {
    expect(formatFieldDefinitions([])).toBe("");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/ai/__tests__/platform-instructions.test.ts`
Expected: FAIL — `formatFieldDefinitions` is not exported

**Step 3: Implement `formatFieldDefinitions`**

Add to `src/lib/ai/platform-instructions.ts` after the existing imports:

```typescript
import type { FieldDefinition } from "@/lib/crm/field-definitions";

/**
 * Formats a FieldDefinition[] array into a compact semicolon-delimited string
 * for system prompt injection. Shows labels and types only — no keys (keys are
 * display aliases, not storage column names).
 */
export function formatFieldDefinitions(fields: FieldDefinition[]): string {
  if (fields.length === 0) return "";

  return [...fields]
    .sort((a, b) => a.order - b.order)
    .map((f) => {
      const annotations: string[] = [];

      if (f.type === "relation" && f.related_entity) {
        annotations.push(`relation \u2192 ${f.related_entity}`);
      } else {
        annotations.push(f.type);
      }

      if (f.required) annotations.push("required");
      if (!f.editable) annotations.push("read-only");
      if (f.source === "custom") annotations.push("custom");

      const extras: string[] = [];
      if (!f.visible) extras.push("hidden");
      if ((f.type === "select" || f.type === "tags") && f.options && f.options.length > 0) {
        extras.push(`options: ${f.options.map(escapeXml).join(", ")}`);
      }

      const extrasStr = extras.length > 0 ? ` [${extras.join("; ")}]` : "";

      return `${escapeXml(f.label)} (${annotations.join(", ")})${extrasStr}`;
    })
    .join("; ");
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/ai/__tests__/platform-instructions.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/ai/platform-instructions.ts src/lib/ai/__tests__/platform-instructions.test.ts
git commit -m "feat(crm-schema): add formatFieldDefinitions() shared formatter"
```

---

## Batch 2 — System Prompt Injection

### Task 2: Update vocabulary block with field definitions

**Files:**
- Modify: `src/lib/ai/platform-instructions.ts`
- Modify: `src/lib/ai/__tests__/platform-instructions.test.ts`
- Modify: `src/lib/ai/__tests__/platform-instructions-configurable.test.ts`

**Step 1: Write failing test for field definitions in vocabulary block**

Add to `src/lib/ai/__tests__/platform-instructions.test.ts` inside the existing `describe("buildPlatformInstructions", ...)`:

```typescript
it("includes field definitions for all three CRM entities", () => {
  const instructions = buildPlatformInstructions(CRM_DEFAULTS);

  expect(instructions).toContain("Contact fields:");
  expect(instructions).toContain("Company fields:");
  expect(instructions).toContain("Deal fields:");
  // Verify a known default field label appears
  expect(instructions).toContain("Name (full_name");
});

it("shows relation fields with target entity", () => {
  const instructions = buildPlatformInstructions(CRM_DEFAULTS);

  expect(instructions).toContain("relation \u2192 companies");
});

it("shows hidden fields with [hidden] marker", () => {
  const instructions = buildPlatformInstructions(CRM_DEFAULTS);

  // city on contacts is visible: false in defaults
  expect(instructions).toContain("[hidden]");
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/ai/__tests__/platform-instructions.test.ts`
Expected: FAIL — output doesn't contain "Contact fields:"

**Step 3: Add `formatFieldDefinitionsSummary` and update `buildCrmVocabularyBlock`**

In `src/lib/ai/platform-instructions.ts`, add a new internal function:

```typescript
function formatFieldDefinitionsSummary(config: CrmVocabConfig) {
  const collections = [
    ["Contact fields", config.contact_fields],
    ["Company fields", config.company_fields],
    ["Deal fields", config.deal_fields],
  ] as const;

  return collections
    .map(([label, definitions]) => {
      const summary = formatFieldDefinitions(definitions as FieldDefinition[]);
      return `${label}: ${summary || "none"}`;
    })
    .join("\n");
}
```

Then update `buildCrmVocabularyBlock` to **append** the field definitions after the existing custom field summary. Do NOT remove `formatCustomFieldDefinitionSummary` — keep the existing output intact per decision #2.

Add after the existing `${formatCustomFieldDefinitionSummary(normalizedConfig)}` line:

```typescript
${formatFieldDefinitionsSummary(normalizedConfig)}
```

The final `<crm-vocabulary>` block should look like:

```xml
<crm-vocabulary>
Deal label: Deal
Company label: Company
Deal stages: leads, negotiation, offer, closing, lost
Contact types: buyer, seller, landlord, tenant, agent, other
Company industries: property_agency, developer, law_firm, bank, government, other
Interaction types: call, meeting, email, message, viewing, note
Deal contact roles: buyer, seller, agent, other
Deal custom fields: none
Contact custom fields: none
Company custom fields: none
Task custom fields: none
Contact fields: Name (full_name, required); Email (email); Phone (phone); ...
Company fields: Name (text, required); Website (url); ...
Deal fields: Name (text, required); Amount (currency); ...
</crm-vocabulary>
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/ai/__tests__/platform-instructions.test.ts`
Expected: ALL PASS

**Step 5: Update configurable test file for escaping**

Add to `src/lib/ai/__tests__/platform-instructions-configurable.test.ts`:

```typescript
import { CONTACT_DEFAULT_FIELDS } from "@/lib/crm/field-definitions";
import type { FieldDefinition } from "@/lib/crm/field-definitions";

it("escapes special characters in field definition labels", () => {
  const customField: FieldDefinition = {
    key: "custom_1",
    label: 'Custom "Field" <One>',
    type: "text",
    source: "custom",
    tier: "custom",
    visible: true,
    order: 99,
    editable: true,
    required: false,
  };

  const result = buildPlatformInstructions({
    ...CRM_DEFAULTS,
    contact_fields: [...CONTACT_DEFAULT_FIELDS, customField],
  });

  expect(result).toContain("Custom &quot;Field&quot; &lt;One&gt;");
});

it("reflects custom config field definitions, not defaults", () => {
  const minimalFields: FieldDefinition[] = [
    { key: "name", label: "Full Name", type: "full_name", source: "column", tier: "indestructible", visible: true, order: 0, editable: false, required: true },
  ];

  const result = buildPlatformInstructions({
    ...CRM_DEFAULTS,
    contact_fields: minimalFields,
  });

  expect(result).toContain("Contact fields: Full Name");
  // Should NOT contain default fields that were removed
  expect(result).not.toMatch(/Contact fields:.*Email \(email\)/);
});
```

**Step 6: Run all platform-instructions tests**

Run: `npx vitest run src/lib/ai/__tests__/platform-instructions`
Expected: ALL PASS

**Step 7: Update context assembly test**

Add to `src/lib/runner/__tests__/context-crm-config.test.ts` inside the existing describe:

```typescript
it("includes field definitions in the system prompt", async () => {
  const supabase = createMockSupabaseClient({
    selectResult: { data: [], error: null },
  });

  const result = await assembleContext({
    supabase: supabase as never,
    threadId: "thread-1",
    currentMessage: "Show my contacts",
    clientId: "client-123",
    crmConfig: CRM_DEFAULTS,
  });

  expect(result.system).toContain("Contact fields:");
  expect(result.system).toContain("Company fields:");
  expect(result.system).toContain("Deal fields:");
});
```

**Step 8: Run context tests**

Run: `npx vitest run src/lib/runner/__tests__/context-crm-config.test.ts`
Expected: ALL PASS

**Step 9: Commit**

```bash
git add src/lib/ai/platform-instructions.ts src/lib/ai/__tests__/platform-instructions.test.ts src/lib/ai/__tests__/platform-instructions-configurable.test.ts src/lib/runner/__tests__/context-crm-config.test.ts
git commit -m "feat(crm-schema): inject field definitions into system prompt vocabulary block"
```

---

## Batch 3 — Enrich `get_agent_db_schema` Tool

### Task 3: Thread `crmConfig` into `createSqlTools`

Per decision #3, pass optional `crmConfig` through from the runner — don't add a second `loadCrmConfig()` call.

**Files:**
- Modify: `src/lib/runner/tools/utility/sql.ts`
- Modify: `src/lib/runner/tools/utility/index.ts`
- Modify: `src/lib/runner/tool-registry.ts` (if `crmConfig` isn't already passed to `createUtilityTools`)
- Modify: `src/lib/runner/tools/utility/__tests__/sql.test.ts`

**Step 1: Update `createSqlTools` signature**

In `src/lib/runner/tools/utility/sql.ts`, change:

```typescript
// Before
export function createSqlTools(supabase: SupabaseClient<Database>) {

// After
import type { CrmVocabConfig } from "@/lib/crm/config";
import { formatFieldDefinitions } from "@/lib/ai/platform-instructions";

export function createSqlTools(
  supabase: SupabaseClient<Database>,
  crmConfig?: CrmVocabConfig,
) {
```

**Step 2: Update call sites**

In `src/lib/runner/tools/utility/index.ts`, update the `CreateUtilityToolsOptions` interface and function:

```typescript
import type { CrmVocabConfig } from "@/lib/crm/config";

export interface CreateUtilityToolsOptions {
  isSubagent?: boolean;
  includeSendMessage?: boolean;
  crmConfig?: CrmVocabConfig;
}
```

Update the call:

```typescript
// Before
...createSqlTools(supabase),

// After
...createSqlTools(supabase, options?.crmConfig),
```

Then check `src/lib/runner/tool-registry.ts` — update `createUtilityTools` call to pass `crmConfig`:

```typescript
// Before
const utilityTools = createUtilityTools(supabase, clientId, threadId, {
  isSubagent,
  includeSendMessage: options?.includeSendMessage ?? !isSubagent,
});

// After
const utilityTools = createUtilityTools(supabase, clientId, threadId, {
  isSubagent,
  includeSendMessage: options?.includeSendMessage ?? !isSubagent,
  crmConfig: options?.crmConfig,
});
```

**Step 3: Update existing tests**

In `src/lib/runner/tools/utility/__tests__/sql.test.ts`, all existing `createSqlTools(supabase as never)` calls remain valid — `crmConfig` is optional. No changes needed for existing tests.

**Step 4: Run tests to verify nothing broke**

Run: `npx vitest run src/lib/runner/tools/utility/__tests__/sql.test.ts`
Expected: ALL PASS

Run: `npx vitest run src/lib/runner/tools/utility/__tests__/index.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/runner/tools/utility/sql.ts src/lib/runner/tools/utility/index.ts src/lib/runner/tool-registry.ts
git commit -m "refactor(sql-tools): thread optional crmConfig into createSqlTools"
```

---

### Task 4: Enrich `get_agent_db_schema` with CRM field definitions

**Files:**
- Modify: `src/lib/runner/tools/utility/sql.ts`
- Modify: `src/lib/runner/tools/utility/__tests__/sql.test.ts`

**Step 1: Write failing test for enriched schema response**

Add to `src/lib/runner/tools/utility/__tests__/sql.test.ts` inside the existing `describe("get_agent_db_schema", ...)`:

```typescript
import { CRM_DEFAULTS } from "@/lib/crm/config";

it("returns crm_fields alongside raw schema when crmConfig is provided", async () => {
  const mockSchema = [
    { table: "contacts", row_count: 5, columns: [] },
  ];

  const supabase = createMockSupabaseClient({
    rpcResults: {
      get_client_accessible_schema: { data: mockSchema, error: null },
    },
  });

  const tools = createSqlTools(supabase as never, CRM_DEFAULTS);
  const result = await tools.get_agent_db_schema.execute({}, EXECUTION_OPTIONS);

  expect(result).toHaveProperty("success", true);
  expect(result).toHaveProperty("schema", mockSchema);
  expect(result).toHaveProperty("crm_fields");

  const crmFields = (result as { crm_fields: Record<string, string> }).crm_fields;
  expect(crmFields).toHaveProperty("contacts");
  expect(crmFields).toHaveProperty("companies");
  expect(crmFields).toHaveProperty("deals");
  // Verify it contains actual field definitions from defaults
  expect(crmFields.contacts).toContain("Name");
  expect(crmFields.contacts).toContain("Email");
});

it("omits crm_fields when crmConfig is not provided", async () => {
  const mockSchema = [
    { table: "contacts", row_count: 5, columns: [] },
  ];

  const supabase = createMockSupabaseClient({
    rpcResults: {
      get_client_accessible_schema: { data: mockSchema, error: null },
    },
  });

  const tools = createSqlTools(supabase as never);
  const result = await tools.get_agent_db_schema.execute({}, EXECUTION_OPTIONS);

  expect(result).toEqual({ success: true, schema: mockSchema });
  expect(result).not.toHaveProperty("crm_fields");
});

it("returns strict error on RPC failure — no partial crm_fields", async () => {
  const supabase = createMockSupabaseClient({
    rpcResults: {
      get_client_accessible_schema: { data: null, error: { message: "rpc error" } },
    },
  });

  const tools = createSqlTools(supabase as never, CRM_DEFAULTS);
  const result = await tools.get_agent_db_schema.execute({}, EXECUTION_OPTIONS);

  expect(result).toEqual({ success: false, error: "rpc error" });
  expect(result).not.toHaveProperty("crm_fields");
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/runner/tools/utility/__tests__/sql.test.ts`
Expected: FAIL — result doesn't have `crm_fields`

**Step 3: Implement enriched `get_agent_db_schema`**

In `src/lib/runner/tools/utility/sql.ts`, update the `get_agent_db_schema` tool:

```typescript
const get_agent_db_schema = tool({
  description:
    "Get available tables, columns, row counts, and CRM field definitions for the agent SQL workspace. " +
    "Includes field types, labels, relations, and custom field definitions per CRM entity.",
  inputSchema: z.object({}),
  execute: async () => {
    const { data, error } = await supabase.rpc("get_client_accessible_schema");

    if (error) {
      return { success: false as const, error: error.message };
    }

    // When crmConfig is available, enrich with field definitions
    if (crmConfig) {
      return {
        success: true as const,
        schema: data,
        crm_fields: {
          contacts: formatFieldDefinitions(crmConfig.contact_fields),
          companies: formatFieldDefinitions(crmConfig.company_fields),
          deals: formatFieldDefinitions(crmConfig.deal_fields),
        },
      };
    }

    return { success: true as const, schema: data };
  },
});
```

**Step 4: Update existing schema test assertion**

The existing test `"calls get_client_accessible_schema RPC"` does not pass `crmConfig`, so it should still return `{ success: true, schema: mockSchema }` without `crm_fields`. Verify the assertion still holds as-is.

**Step 5: Run all sql tool tests**

Run: `npx vitest run src/lib/runner/tools/utility/__tests__/sql.test.ts`
Expected: ALL PASS

**Step 6: Run full utility test suite to check nothing broke**

Run: `npx vitest run src/lib/runner/tools/utility/__tests__/`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add src/lib/runner/tools/utility/sql.ts src/lib/runner/tools/utility/__tests__/sql.test.ts
git commit -m "feat(crm-schema): enrich get_agent_db_schema with CRM field definitions"
```

---

## Batch 4 — Final Verification

### Task 5: Full test suite + token budget check

**Step 1: Run all affected test suites**

```bash
npx vitest run src/lib/ai/__tests__/platform-instructions.test.ts src/lib/ai/__tests__/platform-instructions-configurable.test.ts src/lib/runner/__tests__/context-crm-config.test.ts src/lib/runner/tools/utility/__tests__/sql.test.ts src/lib/runner/tools/utility/__tests__/index.test.ts
```

Expected: ALL PASS

**Step 2: Spot-check token budget**

Write a quick one-liner to check the output size:

```bash
npx tsx -e "
  import { buildPlatformInstructions } from './src/lib/ai/platform-instructions';
  import { CRM_DEFAULTS } from './src/lib/crm/config';
  const output = buildPlatformInstructions(CRM_DEFAULTS);
  const fieldLines = output.split('\n').filter(l => l.includes('fields:'));
  fieldLines.forEach(l => console.log(l));
  console.log('---');
  console.log('Total chars:', output.length);
  console.log('Approx tokens:', Math.ceil(output.length / 4));
"
```

Expected: field definition lines present, total token increase ~300-500 over baseline.

**Step 3: Run broader test suite to catch regressions**

```bash
npx vitest run src/lib/runner/__tests__/
```

Expected: ALL PASS

**Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "test(crm-schema): final verification and fixups"
```

---

Tasklist complete and saved to `docs/product/tasks/2026-04-02-crm-schema-awareness-tasklist.md`. Open a new session to do batch execution with checkpoint.
