# PR 48 — CRM Configuration Mode (Time-Limited, UI-Gated)

## Context

QA surface 03 found that `configure_crm` is only available in `mode: "setup"` — users cannot reconfigure CRM stages/fields after initial onboarding. The fix: expose `configure_crm` in normal chat **only** when explicitly activated from Settings, with a 1-hour TTL and auto-expiry safety net.

**Design:**
- DB: `crm_config_mode_until timestamptz null` on `clients` table (null = off, timestamp = active until)
- Settings UI: "Reconfigure CRM" button → destructive confirmation modal → API call
- API: `POST /api/settings/crm-config-mode` (enable with 1h TTL / disable)
- Tool factory: New `includeConfigTool: boolean` on `createCrmTools` — adds `configure_crm` alongside normal tools (NOT setup mode which removes all other tools)
- New tool: `disable_crm_config_mode` — agent calls to turn off the flag
- Chat route: Check client's flag, if active + not expired → pass `includeConfigTool: true`, inject system reminder line
- Auto-expiry: 1h TTL safety net (flag simply expires, no cron needed)

**Key decisions:** SAFETY-01 (mixed autonomy), SAFETY-04 (approval matrix), TOOL-02 (fixed tool surface)

---

## Batch 1 — DB migration + type regeneration

### Step 1: Write migration SQL

Create `supabase/migrations/20260313000000_add_crm_config_mode.sql`:

```sql
-- PR48: Add time-limited CRM configuration mode flag to clients.
-- null = config mode off, timestamptz = config mode active until that time.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS crm_config_mode_until timestamptz;

COMMENT ON COLUMN public.clients.crm_config_mode_until IS
  'When set and in the future, configure_crm tool is available in normal chat. Auto-expires. Set from Settings UI.';
```

- [ ] Create the migration file with the SQL above

### Step 2: Apply migration locally

```bash
npx supabase db push
```

- [ ] Run `npx supabase db push` and confirm the column is added without errors

### Step 3: Regenerate database types

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

- [ ] Run type generation and confirm `crm_config_mode_until` appears in the `clients` table type in `src/types/database.ts`

**Checkpoint: Batch 1 done.** The `clients` table has the new column. Types are regenerated. Commit: `feat(pr48): add crm_config_mode_until column to clients`

---

## Batch 2 — Tool factory: `includeConfigTool` option

### Step 4: Write test for `includeConfigTool` option

In `src/lib/runner/tools/crm/__tests__/index.test.ts` (create if not exists), add tests:

```typescript
import { describe, expect, it, vi } from "vitest";

import { createCrmTools } from "../index";

// Minimal supabase mock — tools are factories, they don't call DB at creation time
const mockSupabase = {} as any;
const clientId = "test-client-id";

describe("createCrmTools", () => {
  it("returns configure_crm when includeConfigTool is true", () => {
    const tools = createCrmTools(mockSupabase, clientId, {
      includeConfigTool: true,
    });

    expect(tools).toHaveProperty("configure_crm");
    // Also has normal tools
    expect(tools).toHaveProperty("search_crm");
    expect(tools).toHaveProperty("create_record");
  });

  it("does NOT return configure_crm in normal mode without includeConfigTool", () => {
    const tools = createCrmTools(mockSupabase, clientId);

    expect(tools).not.toHaveProperty("configure_crm");
    expect(tools).toHaveProperty("search_crm");
  });

  it("setup mode still returns ONLY configure_crm", () => {
    const tools = createCrmTools(mockSupabase, clientId, {
      mode: "setup",
    });

    expect(tools).toHaveProperty("configure_crm");
    expect(tools).not.toHaveProperty("search_crm");
  });

  it("includeConfigTool is ignored when mode is setup", () => {
    const tools = createCrmTools(mockSupabase, clientId, {
      mode: "setup",
      includeConfigTool: true,
    });

    // Setup mode returns only configure_crm regardless
    expect(tools).toHaveProperty("configure_crm");
    expect(tools).not.toHaveProperty("search_crm");
  });
});
```

- [ ] Write the test file
- [ ] Run `npx vitest run src/lib/runner/tools/crm/__tests__/index.test.ts` — tests fail (property `includeConfigTool` not recognized yet)

### Step 5: Add `includeConfigTool` to `CreateCrmToolsOptions`

In `src/lib/runner/tools/crm/index.ts`:

1. Add `includeConfigTool?: boolean` to the `CreateCrmToolsOptions` interface (after `allowDeleteTools`):

```typescript
interface CreateCrmToolsOptions {
  mode?: "normal" | "setup";
  config?: CrmVocabConfig;
  allowWriteTools?: boolean;
  allowDeleteTools?: boolean;
  /** When true, includes configure_crm alongside normal tools. Set when CRM config mode is active. */
  includeConfigTool?: boolean;
}
```

2. Destructure `includeConfigTool = false` from options in `createCrmTools()`.

3. After the normal tools return block (line 70-81), spread `configure_crm` conditionally:

```typescript
return {
  ...readTools,
  create_record: createRecordTools.create_record,
  update_record: updateRecordTools.update_record,
  link_records: linkRecordTools.link_records,
  create_interaction: interactionTools.create_interaction,
  create_task: taskTools.create_task,
  update_task: taskTools.update_task,
  ...(allowDeleteTools ? {
    delete_records: createDeleteRecordsTool(supabase, clientId).delete_records,
  } : {}),
  ...(includeConfigTool ? createConfigureCrmTool(supabase, clientId) : {}),
};
```

- [ ] Add `includeConfigTool` option and conditional spread
- [ ] Run `npx vitest run src/lib/runner/tools/crm/__tests__/index.test.ts` — all tests pass

### Step 6: Pass `includeConfigTool` through tool-registry

In `src/lib/runner/tool-registry.ts`:

1. Add `includeConfigTool?: boolean` to `CreateRunnerToolsOptions` interface.
2. Pass it through to `createCrmTools()`:

```typescript
const crmTools = createCrmTools(supabase, clientId, {
  allowWriteTools: true,
  allowDeleteTools: !isSubagent,
  mode: options?.crmMode ?? "normal",
  config: options?.crmConfig,
  includeConfigTool: options?.includeConfigTool,
});
```

- [ ] Add `includeConfigTool` to `CreateRunnerToolsOptions` and pass it through

**Checkpoint: Batch 2 done.** Tool factory supports `includeConfigTool`. Commit: `feat(pr48): add includeConfigTool option to CRM tool factory`

---

## Batch 3 — `disable_crm_config_mode` tool

### Step 7: Write test for `disable_crm_config_mode`

Create `src/lib/runner/tools/crm/__tests__/disable-config-mode.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

import { createDisableConfigModeTool } from "../disable-config-mode";

function createMockSupabase(updateResult: { error: null | { message: string } }) {
  return {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue(updateResult),
      }),
    }),
  } as any;
}

const clientId = "test-client-id";

describe("disable_crm_config_mode", () => {
  it("returns a tool object with disable_crm_config_mode key", () => {
    const tools = createDisableConfigModeTool(createMockSupabase({ error: null }), clientId);
    expect(tools).toHaveProperty("disable_crm_config_mode");
  });

  it("sets crm_config_mode_until to null on execute", async () => {
    const supabase = createMockSupabase({ error: null });
    const tools = createDisableConfigModeTool(supabase, clientId);
    const result = await tools.disable_crm_config_mode.execute({});

    expect(result).toEqual({
      success: true,
      message: "CRM configuration mode has been disabled. The configure_crm tool will no longer be available.",
    });
    expect(supabase.from).toHaveBeenCalledWith("clients");
  });

  it("returns error on DB failure", async () => {
    const supabase = createMockSupabase({ error: { message: "DB error" } });
    const tools = createDisableConfigModeTool(supabase, clientId);
    const result = await tools.disable_crm_config_mode.execute({});

    expect(result).toEqual({
      success: false,
      error: "DB error",
    });
  });
});
```

- [ ] Write the test file
- [ ] Run `npx vitest run src/lib/runner/tools/crm/__tests__/disable-config-mode.test.ts` — fails (module doesn't exist)

### Step 8: Implement `disable_crm_config_mode` tool

Create `src/lib/runner/tools/crm/disable-config-mode.ts`:

```typescript
/**
 * Tool to disable CRM configuration mode (agent self-service).
 * @module lib/runner/tools/crm/disable-config-mode
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";

/**
 * Creates the disable_crm_config_mode tool.
 * The agent calls this to turn off config mode after finishing CRM reconfiguration.
 */
export function createDisableConfigModeTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const disable_crm_config_mode = tool({
    description:
      "Disable CRM configuration mode for this workspace. " +
      "Call this after finishing CRM reconfiguration to remove the configure_crm tool from future turns. " +
      "The user activated config mode from Settings — you should disable it when done.",
    parameters: z.object({}),
    execute: async () => {
      const { error } = await supabase
        .from("clients")
        .update({ crm_config_mode_until: null })
        .eq("client_id", clientId);

      if (error) {
        return { success: false as const, error: error.message };
      }

      return {
        success: true as const,
        message: "CRM configuration mode has been disabled. The configure_crm tool will no longer be available.",
      };
    },
  });

  return { disable_crm_config_mode };
}
```

- [ ] Create the file
- [ ] Run `npx vitest run src/lib/runner/tools/crm/__tests__/disable-config-mode.test.ts` — all pass

### Step 9: Include `disable_crm_config_mode` in tool factory

In `src/lib/runner/tools/crm/index.ts`:

1. Add import: `import { createDisableConfigModeTool } from "./disable-config-mode";`
2. Update the `includeConfigTool` spread to also include the disable tool:

```typescript
...(includeConfigTool ? {
  ...createConfigureCrmTool(supabase, clientId),
  ...createDisableConfigModeTool(supabase, clientId),
} : {}),
```

- [ ] Add import and spread both tools
- [ ] Run `npx vitest run src/lib/runner/tools/crm/__tests__/index.test.ts` — update test to also check for `disable_crm_config_mode` when `includeConfigTool` is true

Update the test from Step 4 — the `includeConfigTool: true` test should also expect `disable_crm_config_mode`:

```typescript
it("returns configure_crm and disable_crm_config_mode when includeConfigTool is true", () => {
  const tools = createCrmTools(mockSupabase, clientId, {
    includeConfigTool: true,
  });

  expect(tools).toHaveProperty("configure_crm");
  expect(tools).toHaveProperty("disable_crm_config_mode");
  expect(tools).toHaveProperty("search_crm");
});
```

- [ ] Update test and confirm all pass

**Checkpoint: Batch 3 done.** Both config tools exist and are gated behind `includeConfigTool`. Commit: `feat(pr48): create disable_crm_config_mode tool and wire into factory`

---

## Batch 4 — API endpoint for enabling/disabling config mode

### Step 10: Write test for the API endpoint

Create `app/api/settings/crm-config-mode/__tests__/route.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock dependencies before importing route
vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: vi.fn(),
  jsonError: vi.fn((msg: string, status: number) =>
    Response.json({ error: msg }, { status }),
  ),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: vi.fn(),
}));

import { authenticateRequest } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";

describe("POST /api/settings/crm-config-mode", () => {
  const mockSupabase = {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (authenticateRequest as any).mockResolvedValue({
      kind: "ok",
      supabase: mockSupabase,
      userId: "user-1",
    });
    (resolveClientId as any).mockResolvedValue("client-1");
  });

  it("enables config mode with a 1h TTL when action is enable", async () => {
    const { POST } = await import("../route");
    const request = new Request("http://localhost/api/settings/crm-config-mode", {
      method: "POST",
      body: JSON.stringify({ action: "enable" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.action).toBe("enable");
    expect(mockSupabase.from).toHaveBeenCalledWith("clients");
  });

  it("disables config mode when action is disable", async () => {
    const { POST } = await import("../route");
    const request = new Request("http://localhost/api/settings/crm-config-mode", {
      method: "POST",
      body: JSON.stringify({ action: "disable" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.action).toBe("disable");
  });

  it("rejects invalid action", async () => {
    const { POST } = await import("../route");
    const request = new Request("http://localhost/api/settings/crm-config-mode", {
      method: "POST",
      body: JSON.stringify({ action: "invalid" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
```

- [ ] Write the test file
- [ ] Run `npx vitest run app/api/settings/crm-config-mode/__tests__/route.test.ts` — fails (module doesn't exist)

### Step 11: Implement the API endpoint

Create `app/api/settings/crm-config-mode/route.ts`:

```typescript
/**
 * Enable/disable CRM configuration mode for the current client.
 * @module app/api/settings/crm-config-mode/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";

const CRM_CONFIG_MODE_TTL_MS = 60 * 60 * 1000; // 1 hour

const requestBodySchema = z.object({
  action: z.enum(["enable", "disable"]),
});

export async function POST(request: Request): Promise<Response> {
  let body: z.infer<typeof requestBodySchema>;
  try {
    body = requestBodySchema.parse(await request.json());
  } catch {
    return jsonError("Invalid request body. Expected { action: 'enable' | 'disable' }.", 400);
  }

  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  const clientId = await resolveClientId(supabase, userId);

  const configModeUntil = body.action === "enable"
    ? new Date(Date.now() + CRM_CONFIG_MODE_TTL_MS).toISOString()
    : null;

  const { error } = await supabase
    .from("clients")
    .update({ crm_config_mode_until: configModeUntil })
    .eq("client_id", clientId);

  if (error) {
    return jsonError("Failed to update CRM configuration mode.", 500);
  }

  return Response.json({
    success: true,
    action: body.action,
    ...(configModeUntil ? { expiresAt: configModeUntil } : {}),
  });
}
```

- [ ] Create the route file
- [ ] Run `npx vitest run app/api/settings/crm-config-mode/__tests__/route.test.ts` — all pass

**Checkpoint: Batch 4 done.** API endpoint works. Commit: `feat(pr48): add POST /api/settings/crm-config-mode endpoint`

---

## Batch 5 — Chat route: check flag and pass `includeConfigTool`

### Step 12: Add config mode check to chat route

In `app/api/chat/route.ts`, after `resolveClientId` (around line 189-190), add a check:

```typescript
const resolvedClientId = await resolveClientId(supabase, userId);
clientId = resolvedClientId;

// Check if CRM config mode is active (non-null and not expired)
const { data: clientRow } = await supabase
  .from("clients")
  .select("crm_config_mode_until")
  .eq("client_id", resolvedClientId)
  .single();

const isCrmConfigModeActive = Boolean(
  clientRow?.crm_config_mode_until &&
  new Date(clientRow.crm_config_mode_until) > new Date()
);
```

Then in the `runAgent()` call (line 258-268), pass the flag:

```typescript
const result = await runAgent(
  {
    clientId: resolvedClientId,
    threadId,
    triggerType: "chat",
    consumeMessageQuota: body.message?.role === "user",
    input,
    ...(fileParts.length > 0 ? { fileParts } : {}),
    crmMode: body.crmMode,
    includeConfigTool: isCrmConfigModeActive,
  },
  supabase,
);
```

- [ ] Add config mode check query after `resolveClientId`
- [ ] Pass `includeConfigTool` to `runAgent()`

### Step 13: Add `includeConfigTool` to runner payload schema

In `src/lib/runner/schemas.ts`, add to `runnerPayloadSchema`:

```typescript
export const runnerPayloadSchema = z.object({
  clientId: z.string().uuid(),
  threadId: z.string().uuid(),
  triggerType: z.enum(triggerTypeValues),
  consumeMessageQuota: z.boolean().optional(),
  input: z.string(),
  fileParts: z.array(runnerFilePartSchema).optional(),
  crmMode: z.enum(["normal", "setup"]).optional(),
  includeConfigTool: z.boolean().optional(),
});
```

- [ ] Add `includeConfigTool` to `runnerPayloadSchema`

### Step 14: Pass `includeConfigTool` through `run-agent.ts`

In `src/lib/runner/run-agent.ts`, around line 214-218 where `createRunnerTools()` is called:

```typescript
const runnerTools = createRunnerTools(supabase, clientId, threadId, {
  allowTriggerMutations: payload.triggerType === "chat",
  crmMode,
  crmConfig,
  includeConfigTool: payload.includeConfigTool,
});
```

- [ ] Pass `includeConfigTool` from payload to `createRunnerTools()`
- [ ] Run `npx vitest run src/lib/runner/tools/crm/__tests__/index.test.ts` — still pass

**Checkpoint: Batch 5 done.** Chat route checks the flag, passes it through runner → tool-registry → tool factory. Commit: `feat(pr48): wire chat route to check config mode flag and pass includeConfigTool`

---

## Batch 6 — System reminder injection

### Step 15: Write test for config mode system reminder line

In `src/lib/runner/__tests__/system-reminder.test.ts`, add a test:

```typescript
it("includes CRM config mode line when crmConfigModeActive is true", async () => {
  const result = await buildSystemReminder(mockSupabase, "client-1", "thread-1", {
    crmConfigModeActive: true,
  });

  expect(result).toContain("CRM configuration mode: ACTIVE");
  expect(result).toContain("configure_crm");
  expect(result).toContain("disable_crm_config_mode");
});
```

- [ ] Add the test
- [ ] Run test — fails (buildSystemReminder doesn't accept options yet)

### Step 16: Add config mode line to `buildSystemReminder`

In `src/lib/runner/system-reminder.ts`:

1. Add an options parameter to `buildSystemReminder()`:

```typescript
interface BuildSystemReminderOptions {
  /** When true, injects a CRM configuration mode active notice. */
  crmConfigModeActive?: boolean;
}

export async function buildSystemReminder(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
  options?: BuildSystemReminderOptions,
): Promise<string> {
```

2. After the existing reminder lines (before the return), add:

```typescript
if (options?.crmConfigModeActive) {
  reminderLines.push(
    "CRM configuration mode: ACTIVE — configure_crm and disable_crm_config_mode tools are available. " +
    "Remind the user to disable config mode when reconfiguration is complete.",
  );
}
```

- [ ] Add options parameter and conditional line
- [ ] Run `npx vitest run src/lib/runner/__tests__/system-reminder.test.ts` — all pass

### Step 17: Pass config mode flag to `buildSystemReminder` from context assembly

In `src/lib/runner/context.ts`, the `loadSystemPromptState` function calls `buildSystemReminder`. Thread the `includeConfigTool` flag through:

1. Add `crmConfigModeActive?: boolean` to the `loadSystemPromptState` params and `assembleContext` params.
2. Pass it to `buildSystemReminder()`:

In `assembleContext` (around line 226):

```typescript
const { memoryContext, systemReminder, compactionState } = await loadSystemPromptState({
  supabase,
  threadId,
  clientId,
  includeCompactionState: true,
  crmConfigModeActive,
});
```

In `loadSystemPromptState` (around line 171):

```typescript
systemReminder = await buildSystemReminder(supabase, clientId, threadId, {
  crmConfigModeActive: options?.crmConfigModeActive,
});
```

3. In `run-agent.ts`, pass the flag to `assembleContext()`:

```typescript
const { system, messages } = await assembleContext({
  supabase,
  threadId,
  currentMessage: "",
  clientId,
  crmConfig,
  crmMode,
  crmConfigModeActive: payload.includeConfigTool,
});
```

- [ ] Thread `crmConfigModeActive` through context.ts → system-reminder.ts
- [ ] Thread from run-agent.ts → assembleContext
- [ ] Run all system-reminder + context tests: `npx vitest run src/lib/runner/__tests__/system-reminder.test.ts src/lib/runner/__tests__/context.test.ts`

**Checkpoint: Batch 6 done.** System reminder shows config mode status. Commit: `feat(pr48): inject CRM config mode notice in system reminder`

---

## Batch 7 — Settings UI: Reconfigure CRM button + confirmation modal

### Step 18: Add CRM configuration mode card to settings page

In `app/(dashboard)/settings/page.tsx`, replace the "Roadmap" placeholder card (lines 249-273) with the CRM configuration mode card.

This is a Server Component page, so the interactive button + modal needs a client component. Create `app/(dashboard)/settings/crm-config-mode-card.tsx`:

```typescript
/**
 * CRM Configuration Mode card with destructive confirmation modal.
 * @module app/(dashboard)/settings/crm-config-mode-card
 */
"use client";

import { useState } from "react";

import { AlertTriangle } from "@/components/icons/lucide-compat";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function CrmConfigModeCard() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    expiresAt?: string;
    error?: string;
  } | null>(null);

  async function handleEnable() {
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/settings/crm-config-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enable" }),
      });

      const data = await response.json();

      if (!response.ok) {
        setResult({ success: false, error: data.error ?? "Failed to enable." });
        return;
      }

      setResult({ success: true, expiresAt: data.expiresAt });
    } catch {
      setResult({ success: false, error: "Network error." });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDisable() {
    setIsLoading(true);
    try {
      await fetch("/api/settings/crm-config-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disable" }),
      });
      setResult(null);
    } catch {
      // Ignore — worst case it auto-expires
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="gap-2">
        <CardDescription>CRM Configuration</CardDescription>
        <CardTitle className="text-xl">Reconfigure CRM</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Activate configuration mode to let Sunder change your CRM stages, contact types,
          custom fields, and other vocabulary. This is a destructive operation — changes
          affect all existing records.
        </p>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">Warning</p>
              <p>
                Configuration mode gives the agent access to modify your CRM schema.
                It auto-expires after 1 hour. Only activate when you intend to make changes.
              </p>
            </div>
          </div>
        </div>

        {result?.success && result.expiresAt && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
            <p className="font-medium text-foreground">Configuration mode is active.</p>
            <p>
              Go to chat and ask Sunder to reconfigure your CRM. Expires at{" "}
              {new Date(result.expiresAt).toLocaleTimeString()}.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={isLoading}
              onClick={handleDisable}
            >
              Disable now
            </Button>
          </div>
        )}

        {result?.success === false && (
          <p className="text-sm text-destructive">{result.error}</p>
        )}
      </CardContent>
      <CardFooter className="border-t">
        {!result?.success ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isLoading}>
                {isLoading ? "Activating..." : "Activate configuration mode"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Activate CRM configuration mode?</AlertDialogTitle>
                <AlertDialogDescription>
                  This gives Sunder the ability to modify your CRM stages, contact types,
                  custom fields, and other vocabulary for the next hour. Changes affect all
                  existing records and cannot be easily undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleEnable}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Yes, activate
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </CardFooter>
    </Card>
  );
}
```

- [ ] Create `app/(dashboard)/settings/crm-config-mode-card.tsx`

### Step 19: Replace the roadmap placeholder in settings page

In `app/(dashboard)/settings/page.tsx`, replace the roadmap `<Card>` (lines 249-273) with:

```typescript
import { CrmConfigModeCard } from "./crm-config-mode-card";
```

And in the JSX, replace the card:

```tsx
<CrmConfigModeCard />
```

- [ ] Add import and replace the placeholder card
- [ ] Verify the page renders without errors: `npm run build` (or dev server check)

### Step 20: Check AlertTriangle icon exists in lucide-compat

Verify `AlertTriangle` is exported from `@/components/icons/lucide-compat`. If not, add it.

- [ ] Check and add `AlertTriangle` export if needed

**Checkpoint: Batch 7 done.** Settings UI has the CRM configuration mode card with destructive confirmation. Commit: `feat(pr48): add Reconfigure CRM card with confirmation modal to Settings`

---

## Batch 8 — Integration test and manual verification

### Step 21: End-to-end flow verification

1. Start dev server: `npm run dev`
2. Go to Settings page — confirm the "Reconfigure CRM" card appears
3. Click "Activate configuration mode" — confirm modal appears with warning
4. Confirm activation — check that the success state shows with expiry time
5. Go to chat — send "Change my deal stages to: prospecting, quoted, negotiation, closed-won, closed-lost"
6. Confirm agent calls `configure_crm` (check Langfuse trace)
7. Confirm agent suggests disabling config mode after completion
8. Back in Settings — click "Disable now" to manually turn off

- [ ] Manual flow verification passes

### Step 22: Run existing test suites to confirm no regressions

```bash
npx vitest run src/lib/runner/__tests__/
npx vitest run app/api/chat/
```

- [ ] All existing tests pass without modification (besides the ones we created/updated)

**Checkpoint: Batch 8 done.** Full integration verified. Final commit: `feat(pr48): CRM configuration mode — time-limited, UI-gated reconfiguration`
