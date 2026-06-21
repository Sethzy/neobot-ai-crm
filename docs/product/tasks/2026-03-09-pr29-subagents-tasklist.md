# PR 29: Subagents

**PR:** 29
**Decisions:** RUNNER-06 (tool inheritance), RUNNER-07 (workflows are markdown)
**Depends on:** PR 20 (trigger tools), PR 26 (connections)
**Design doc:** `docs/designs/pr29-subagents.md`

**Goal:** One new runner tool — `run_subagent` — that spawns an isolated `generateText()` call using a per-client markdown instruction file. The subagent inherits the full parent system prompt and receives the instruction markdown + payload as the first user message. Only the subagent's final text response returns to the parent's inline context. Intermediate tool calls are fully persisted in block storage.

---

## Relevant Files

### Create
- `src/lib/runner/tools/subagents/run-subagent.ts` — Tool definition + execute logic
- `src/lib/runner/tools/subagents/index.ts` — `createSubagentTool()` factory export
- `src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts` — Unit tests
- `supabase/migrations/{timestamp}_add_subagent_run_columns.sql` — `run_type` + `parent_run_id` columns

### Modify
- `src/lib/runner/run-agent.ts` — Wire `run_subagent` into tool registry, pass `parentRunId`, add `isSubagent` flag
- `src/lib/runner/tools/index.ts` — Export `createSubagentTool`
- `src/lib/ai/system-prompt.ts` — Add `<subagents>` section, update `<triggers>` section
- `src/lib/runner/run-lifecycle.ts` — Extend `CompleteRunInput` with `runType` and `parentRunId`

---

## Task 1: Database migration — `run_type` + `parent_run_id` columns

**Files:**
- Create: `supabase/migrations/{timestamp}_add_subagent_run_columns.sql`

### Step 1: Write migration SQL

Create migration file:

```sql
-- Add run_type and parent_run_id to runs table for subagent observability.
ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS run_type text NOT NULL DEFAULT 'chat',
  ADD COLUMN IF NOT EXISTS parent_run_id uuid REFERENCES public.runs(run_id);

COMMENT ON COLUMN public.runs.run_type IS
  'Type of run: chat (user-initiated), cron (trigger-fired), autopilot (pulse), subagent (delegated).';
COMMENT ON COLUMN public.runs.parent_run_id IS
  'For subagent runs, references the parent run that spawned this subagent.';

-- Index for querying subagent runs by parent
CREATE INDEX IF NOT EXISTS idx_runs_parent_run_id
  ON public.runs (parent_run_id)
  WHERE parent_run_id IS NOT NULL;
```

### Step 2: Apply migration

```bash
npx supabase db push
```

### Step 3: Regenerate TypeScript types

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

### Step 4: Commit

```bash
git add supabase/migrations/ src/types/database.ts
git commit -m "feat(pr29): add run_type and parent_run_id columns to runs table"
```

---

## Task 2: Extend `completeRun` with `runType` and `parentRunId`

**Files:**
- Modify: `src/lib/runner/run-lifecycle.ts`

### Step 1: Write failing test — `completeRun` accepts `runType` and `parentRunId`

Create or add to an existing test file. Since `run-lifecycle.ts` uses direct Supabase calls, we test through the interface types and verify the update payload structure. The simplest approach: test that `CompleteRunInput` now accepts `runType` and `parentRunId` fields.

Add to a new file `src/lib/runner/__tests__/run-lifecycle.test.ts`:

```typescript
/**
 * Tests for run lifecycle helpers — subagent column extensions.
 * @module lib/runner/__tests__/run-lifecycle
 */
import { describe, expect, it } from "vitest";

import type { CompleteRunInput } from "../run-lifecycle";

describe("CompleteRunInput", () => {
  it("accepts runType and parentRunId fields", () => {
    const input: CompleteRunInput = {
      runId: "run-123",
      status: "completed",
      model: "gemini-2.5-flash",
      tokensIn: 100,
      tokensOut: 200,
      stepCount: 3,
      runType: "subagent",
      parentRunId: "parent-run-456",
    };

    expect(input.runType).toBe("subagent");
    expect(input.parentRunId).toBe("parent-run-456");
  });

  it("does not require runType or parentRunId (defaults apply at DB level)", () => {
    const input: CompleteRunInput = {
      runId: "run-123",
      status: "completed",
      model: "gemini-2.5-flash",
      tokensIn: 100,
      tokensOut: 200,
    };

    expect(input.runType).toBeUndefined();
    expect(input.parentRunId).toBeUndefined();
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/__tests__/run-lifecycle.test.ts
```

Expected: FAIL — `CompleteRunInput` does not have `runType` or `parentRunId` properties.

### Step 3: Implement — extend `CompleteRunInput` and `completeRun`

In `src/lib/runner/run-lifecycle.ts`:

Add `runType` and `parentRunId` to the interface:

```typescript
export interface CompleteRunInput {
  runId: string;
  status: "completed" | "partial" | "failed" | "cancelled";
  model: string;
  tokensIn: number;
  tokensOut: number;
  /** Number of model/tool loop steps executed in this run. */
  stepCount?: number;
  /** Type of run: 'chat', 'cron', 'autopilot', 'subagent'. Defaults to 'chat' at DB level. */
  runType?: string;
  /** For subagent runs, references the parent run's run_id. */
  parentRunId?: string;
}
```

Update `completeRun` to include the new fields in the update payload:

```typescript
export async function completeRun(
  supabase: ChatSupabaseClient,
  { runId, status, model, tokensIn, tokensOut, stepCount, runType, parentRunId }: CompleteRunInput,
): Promise<void> {
  const updatePayload = {
    status,
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    completed_at: new Date().toISOString(),
    ...(runType !== undefined && { run_type: runType }),
    ...(parentRunId !== undefined && { parent_run_id: parentRunId }),
  };

  // ... rest unchanged
```

### Step 4: Run test to verify it passes

```bash
npx vitest run src/lib/runner/__tests__/run-lifecycle.test.ts
```

Expected: PASS.

### Step 5: Run existing tests to verify no regressions

```bash
npx vitest run src/lib/runner/
```

Expected: ALL PASS.

### Step 6: Commit

```bash
git add src/lib/runner/run-lifecycle.ts src/lib/runner/__tests__/run-lifecycle.test.ts
git commit -m "feat(pr29): extend completeRun with runType and parentRunId"
```

---

## Task 3: `createRunnerTools` — add `isSubagent` flag for tool blocking

**Files:**
- Modify: `src/lib/runner/run-agent.ts`

This task adds the `isSubagent` option to `createRunnerTools` that excludes trigger tools, utility UI tools (`ask_user_question`, `rename_chat`), and connection mutation tools from the subagent tool set.

### Step 1: Write failing test — `isSubagent: true` removes trigger, UI, and connection mutation tools

Create `src/lib/runner/__tests__/create-runner-tools.test.ts`:

```typescript
/**
 * Tests for createRunnerTools — subagent tool blocking.
 * @module lib/runner/__tests__/create-runner-tools
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composio/client", () => ({
  getComposio: vi.fn(),
}));

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { createRunnerTools } from "../run-agent";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const THREAD_ID = "660e8400-e29b-41d4-a716-446655440000";

describe("createRunnerTools with isSubagent", () => {
  it("excludes all trigger tools when isSubagent is true", () => {
    const supabase = createMockSupabaseClient();
    const tools = createRunnerTools(supabase as never, CLIENT_ID, THREAD_ID, {
      isSubagent: true,
    });
    const toolNames = Object.keys(tools);

    expect(toolNames).not.toContain("setup_trigger");
    expect(toolNames).not.toContain("search_triggers");
    expect(toolNames).not.toContain("manage_active_triggers");
  });

  it("excludes ask_user_question and rename_chat when isSubagent is true", () => {
    const supabase = createMockSupabaseClient();
    const tools = createRunnerTools(supabase as never, CLIENT_ID, THREAD_ID, {
      isSubagent: true,
    });
    const toolNames = Object.keys(tools);

    expect(toolNames).not.toContain("ask_user_question");
    expect(toolNames).not.toContain("rename_chat");
  });

  it("excludes connection mutation tools when isSubagent is true", () => {
    const supabase = createMockSupabaseClient();
    const tools = createRunnerTools(supabase as never, CLIENT_ID, THREAD_ID, {
      isSubagent: true,
    });
    const toolNames = Object.keys(tools);

    expect(toolNames).not.toContain("create_new_connections");
    expect(toolNames).not.toContain("manage_activated_tools_for_connections");
    expect(toolNames).not.toContain("reauthorize_connection");
    expect(toolNames).not.toContain("delete_connection");
  });

  it("keeps CRM, storage, web, and allowed utility tools when isSubagent is true", () => {
    const supabase = createMockSupabaseClient();
    const tools = createRunnerTools(supabase as never, CLIENT_ID, THREAD_ID, {
      isSubagent: true,
    });
    const toolNames = Object.keys(tools);

    // CRM tools present
    expect(toolNames).toContain("search_contacts");
    expect(toolNames).toContain("create_contact");

    // Storage tools present
    expect(toolNames).toContain("read_file");
    expect(toolNames).toContain("write_file");

    // Web tools present
    expect(toolNames).toContain("web_search");
    expect(toolNames).toContain("web_scrape");

    // Allowed utility tools present
    expect(toolNames).toContain("manage_todo");
    expect(toolNames).toContain("list_todo");
    expect(toolNames).toContain("run_agent_memory_sql");
    expect(toolNames).toContain("send_message");
  });

  it("includes all tools when isSubagent is false or undefined", () => {
    const supabase = createMockSupabaseClient();
    const tools = createRunnerTools(supabase as never, CLIENT_ID, THREAD_ID);
    const toolNames = Object.keys(tools);

    expect(toolNames).toContain("setup_trigger");
    expect(toolNames).toContain("search_triggers");
    expect(toolNames).toContain("manage_active_triggers");
    expect(toolNames).toContain("ask_user_question");
    expect(toolNames).toContain("rename_chat");
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/__tests__/create-runner-tools.test.ts
```

Expected: FAIL — `isSubagent` option does not exist, trigger/UI tools still present.

### Step 3: Implement `isSubagent` flag in `createRunnerTools`

In `src/lib/runner/run-agent.ts`, update the options type and function:

```typescript
export function createRunnerTools(
  supabase: ChatSupabaseClient,
  clientId: string,
  threadId: string,
  options?: {
    allowTriggerMutations?: boolean;
    allowConnectionMutations?: boolean;
    crmMode?: "normal" | "setup";
    crmConfig?: Awaited<ReturnType<typeof loadCrmConfig>>["config"];
    /** When true, excludes trigger, UI-interaction, and connection mutation tools. */
    isSubagent?: boolean;
  },
) {
  const isSubagent = options?.isSubagent ?? false;

  const crmTools = createCrmTools(supabase, clientId, {
    allowWriteTools: true,
    mode: options?.crmMode ?? "normal",
    config: options?.crmConfig,
  });
  const storageTools = createStorageTools(supabase, clientId);
  const webTools = createWebTools();

  // Subagents get a restricted utility tool set — no ask_user_question, no rename_chat.
  const utilityTools = createUtilityTools(supabase, clientId, threadId, {
    isSubagent,
  });

  const tools: Record<string, unknown> = {
    ...crmTools,
    ...storageTools,
    ...webTools,
    ...utilityTools,
  };

  // Subagents cannot use any trigger tools (UI-interaction).
  if (!isSubagent) {
    const triggerTools = createTriggerTools(supabase, clientId, threadId, {
      allowMutations: options?.allowTriggerMutations ?? true,
    });
    Object.assign(tools, triggerTools);
  }

  // Subagents cannot use connection mutation tools (UI-interaction).
  const connectionTools = createConnectionTools(supabase, clientId, {
    allowMutations: isSubagent ? false : (options?.allowConnectionMutations ?? true),
  });
  Object.assign(tools, connectionTools);

  return tools;
}
```

### Step 4: Update `createUtilityTools` to accept `isSubagent` option

In `src/lib/runner/tools/utility/index.ts`:

```typescript
export interface CreateUtilityToolsOptions {
  /** When true, excludes ask_user_question and rename_chat. */
  isSubagent?: boolean;
}

/**
 * Creates all utility tools for a specific client/thread run context.
 */
export function createUtilityTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
  options?: CreateUtilityToolsOptions,
) {
  const isSubagent = options?.isSubagent ?? false;

  const todoTools = createTodoTools(supabase, clientId, threadId);
  const sendMessageTool = createSendMessageTool();
  const sqlTools = createSqlTools(supabase);

  const tools: Record<string, unknown> = {
    ...todoTools,
    ...sendMessageTool,
    ...sqlTools,
  };

  if (!isSubagent) {
    const askUserQuestionTool = createAskUserQuestionTool();
    const renameChatTool = createRenameChatTool(supabase, clientId, threadId);
    Object.assign(tools, askUserQuestionTool, renameChatTool);
  }

  return tools;
}
```

### Step 5: Run test to verify it passes

```bash
npx vitest run src/lib/runner/__tests__/create-runner-tools.test.ts
```

Expected: PASS.

### Step 6: Run existing tool barrel tests to verify no regressions

```bash
npx vitest run src/lib/runner/tools/utility/__tests__/index.test.ts src/lib/runner/tools/triggers/__tests__/index.test.ts src/lib/runner/tools/connections/__tests__/index.test.ts
```

Expected: ALL PASS. If the utility index test checks exact tool counts, update it to account for the new `options` parameter.

### Step 7: Commit

```bash
git add src/lib/runner/run-agent.ts src/lib/runner/tools/utility/index.ts src/lib/runner/__tests__/create-runner-tools.test.ts
git commit -m "feat(pr29): add isSubagent flag to createRunnerTools for tool blocking"
```

---

## Task 4: `run_subagent` tool — core implementation

**Files:**
- Create: `src/lib/runner/tools/subagents/run-subagent.ts`
- Create: `src/lib/runner/tools/subagents/index.ts`
- Create: `src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts`

This is the main task. We build the tool test-first in multiple sub-steps.

### Step 1: Write failing test — happy path: reads file, returns final text

Create `src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts`:

```typescript
/**
 * Tests for run_subagent tool.
 * @module lib/runner/tools/subagents/__tests__/run-subagent
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  stepCountIs: vi.fn((n: number) => `stopWhen:${n}`),
  tool: vi.fn((config: unknown) => config),
}));

vi.mock("@/lib/ai/gateway", () => ({
  gateway: vi.fn((model: string) => `gateway:${model}`),
  TIER_1_MODEL: "gemini-2.5-flash",
}));

vi.mock("@/lib/runner/context", () => ({
  assembleContext: vi.fn(),
}));

vi.mock("@/lib/runner/run-agent", () => ({
  createRunnerTools: vi.fn(() => ({
    search_contacts: {},
    read_file: {},
    web_search: {},
  })),
}));

vi.mock("@/lib/runner/run-lifecycle", () => ({
  completeRun: vi.fn(),
}));

vi.mock("@/lib/runner/toolcall-artifacts", () => ({
  saveToolcallBlock: vi.fn(),
}));

vi.mock("@/lib/storage/agent-files", () => ({
  createAgentFileClient: vi.fn(),
}));

vi.mock("@/lib/composio", () => ({
  loadActivatedConnectionTools: vi.fn(() => ({})),
}));

vi.mock("@/lib/connections/queries", () => ({
  getActiveConnections: vi.fn(() => []),
}));

import { generateText } from "ai";
import { assembleContext } from "@/lib/runner/context";
import { createRunnerTools } from "@/lib/runner/run-agent";
import { completeRun } from "@/lib/runner/run-lifecycle";
import { saveToolcallBlock } from "@/lib/runner/toolcall-artifacts";
import { createAgentFileClient } from "@/lib/storage/agent-files";

import { createSubagentTool } from "../run-subagent";

const mockGenerateText = vi.mocked(generateText);
const mockAssembleContext = vi.mocked(assembleContext);
const mockCreateRunnerTools = vi.mocked(createRunnerTools);
const mockCompleteRun = vi.mocked(completeRun);
const mockSaveToolcallBlock = vi.mocked(saveToolcallBlock);
const mockCreateAgentFileClient = vi.mocked(createAgentFileClient);

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const THREAD_ID = "660e8400-e29b-41d4-a716-446655440000";
const PARENT_RUN_ID = "770e8400-e29b-41d4-a716-446655440000";

const MOCK_SUPABASE = {} as never;

const BASE_ARGS = {
  action_pending: "Processing...",
  action_finished: "Done",
  action_error: "Failed",
  path: "subagents/triggers/morning-briefing.md",
};

function setupHappyPath(overrides?: { fileContent?: string; resultText?: string }) {
  const fileContent = overrides?.fileContent ?? "# Morning Briefing\n\nSummarize today's tasks.";
  const resultText = overrides?.resultText ?? "Here is your morning briefing summary.";

  mockCreateAgentFileClient.mockReturnValue({
    downloadFile: vi.fn().mockResolvedValue(fileContent),
    listDirectory: vi.fn(),
    uploadFile: vi.fn(),
    editFile: vi.fn(),
    deleteFile: vi.fn(),
  });

  mockAssembleContext.mockResolvedValue({
    system: "You are NeoBot...",
    messages: [],
  });

  mockCreateRunnerTools.mockReturnValue({
    search_contacts: {},
    read_file: {},
  } as never);

  mockGenerateText.mockResolvedValue({
    text: resultText,
    usage: { inputTokens: 500, outputTokens: 200 },
    steps: [],
  } as never);

  mockCompleteRun.mockResolvedValue(undefined);
  mockSaveToolcallBlock.mockResolvedValue(undefined);
}

describe("run_subagent tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads instruction file and returns final text as raw string", async () => {
    setupHappyPath();

    const { run_subagent } = createSubagentTool(MOCK_SUPABASE, CLIENT_ID, THREAD_ID, PARENT_RUN_ID);
    const result = await run_subagent.execute(BASE_ARGS, { abortSignal: new AbortController().signal } as never);

    expect(result).toBe("Here is your morning briefing summary.");
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts
```

Expected: FAIL — `createSubagentTool` does not exist.

### Step 3: Implement minimal `createSubagentTool` — happy path only

Create `src/lib/runner/tools/subagents/run-subagent.ts`:

```typescript
/**
 * Subagent tool — spawns an isolated generateText() call using a markdown instruction file.
 *
 * Matches Tasklet's run_subagent pattern:
 * - Full parent system prompt inherited via assembleContext()
 * - Instruction .md + payload as user message
 * - Only final text returned to parent (raw string, no wrapper)
 * - Intermediate tool calls persisted to block storage
 * - Errors thrown (AI SDK surfaces as tool-error to parent LLM)
 *
 * @module lib/runner/tools/subagents/run-subagent
 */
import { generateText, stepCountIs, tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { gateway, TIER_1_MODEL } from "@/lib/ai/gateway";
import { loadActivatedConnectionTools } from "@/lib/composio";
import { getActiveConnections } from "@/lib/connections/queries";
import { assembleContext } from "@/lib/runner/context";
import { createRunnerTools } from "@/lib/runner/run-agent";
import { completeRun } from "@/lib/runner/run-lifecycle";
import { saveToolcallBlock } from "@/lib/runner/toolcall-artifacts";
import { createAgentFileClient } from "@/lib/storage/agent-files";
import type { Database } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;

const MAX_SUBAGENT_STEPS = 9;
const SUBAGENT_TIMEOUT_MS = 120_000;
const SUBAGENT_STEP_TIMEOUT_MS = 30_000;

const inputSchema = z.object({
  action_pending: z
    .string()
    .describe(
      "Custom UI status text shown while running. IMPORTANT: Output these three action_ parameters before all other parameters.",
    ),
  action_finished: z.string().describe("Custom UI status text shown on success."),
  action_error: z.string().describe("Custom UI status text shown on failure."),
  path: z
    .string()
    .min(1)
    .describe(
      "Full path to the subagent markdown file (e.g., 'subagents/triggers/morning-briefing.md')",
    ),
  payload: z
    .string()
    .optional()
    .describe(
      "Optional data to pass to the subagent that will be added after the subagent's instructions in the first user message.",
    ),
});

/**
 * Creates the run_subagent tool for one parent run invocation.
 *
 * @param supabase - Authenticated Supabase client.
 * @param clientId - Tenant identifier.
 * @param threadId - Thread the parent run belongs to.
 * @param parentRunId - The parent run's ID for observability linking.
 */
export function createSubagentTool(
  supabase: ChatSupabaseClient,
  clientId: string,
  threadId: string,
  parentRunId: string,
) {
  const run_subagent = tool({
    description:
      "Runs a subagent to handle work efficiently outside of your main context. " +
      "Returns the final message from the subagent as its result.",
    inputSchema,
    execute: async (args, { abortSignal }) => {
      // 1. Read instruction file from Supabase Storage
      const fileClient = createAgentFileClient(supabase, clientId);
      let fileContent: string;

      try {
        fileContent = await fileClient.downloadFile(args.path);
      } catch {
        throw new Error(`Instruction file not found: ${args.path}`);
      }

      if (fileContent.trim().length === 0) {
        throw new Error(`Instruction file is empty: ${args.path}`);
      }

      // 2. Build system prompt — full parent context via assembleContext
      const { system } = await assembleContext({
        supabase,
        threadId,
        currentMessage: "",
        clientId,
      });

      // 3. Build subagent tools (full set minus blocked tools)
      const subagentTools = createRunnerTools(supabase, clientId, threadId, {
        allowTriggerMutations: false,
        allowConnectionMutations: false,
        isSubagent: true,
      });

      // 4. Load Composio connection tools (minus connection mgmt — already handled by isSubagent)
      let composioTools: Record<string, unknown> = {};
      try {
        const connections = await getActiveConnections(supabase, clientId);
        composioTools = await loadActivatedConnectionTools(clientId, connections);
      } catch (error) {
        console.error("[subagent] Failed to load Composio tools:", error);
      }

      const allTools = { ...subagentTools, ...composioTools };

      // 5. Build user message — instruction .md + optional payload
      const userMessage = fileContent + (args.payload ? "\n\n" + args.payload : "");

      // 6. Collect steps for block storage persistence
      const collectedSteps: Array<{
        toolCalls?: ReadonlyArray<{ toolCallId: string; toolName: string; args: unknown }>;
        toolResults?: ReadonlyArray<{ toolCallId: string; result: unknown }>;
      }> = [];

      try {
        const result = await generateText({
          model: gateway(TIER_1_MODEL),
          system,
          messages: [{ role: "user", content: userMessage }],
          tools: allTools,
          stopWhen: stepCountIs(MAX_SUBAGENT_STEPS),
          abortSignal,
          timeout: {
            totalMs: SUBAGENT_TIMEOUT_MS,
            stepMs: SUBAGENT_STEP_TIMEOUT_MS,
          },
          onStepFinish: (step) => {
            collectedSteps.push(step);
          },
        });

        // 7. Persist subagent tool calls to block storage
        await persistSubagentToolCalls(supabase, clientId, collectedSteps);

        // 8. Log subagent run
        await completeRun(supabase, {
          runId: parentRunId,
          status: "completed",
          model: TIER_1_MODEL,
          tokensIn: result.usage?.inputTokens ?? 0,
          tokensOut: result.usage?.outputTokens ?? 0,
          stepCount: result.steps?.length,
          runType: "subagent",
          parentRunId,
        });

        // 9. Return raw text — no wrapper
        return result.text;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }

        // Log failed run (best-effort)
        try {
          await completeRun(supabase, {
            runId: parentRunId,
            status: "failed",
            model: TIER_1_MODEL,
            tokensIn: 0,
            tokensOut: 0,
            runType: "subagent",
            parentRunId,
          });
        } catch {
          // Don't mask the original error
        }

        throw error;
      }
    },
  });

  return { run_subagent };
}

/**
 * Persists all tool call args + results from subagent steps to block storage.
 */
async function persistSubagentToolCalls(
  supabase: ChatSupabaseClient,
  clientId: string,
  steps: ReadonlyArray<{
    toolCalls?: ReadonlyArray<{ toolCallId: string; toolName: string; args: unknown }>;
    toolResults?: ReadonlyArray<{ toolCallId: string; result: unknown }>;
  }>,
): Promise<void> {
  const uploads: Promise<void>[] = [];

  for (const step of steps) {
    if (!step.toolCalls || !step.toolResults) continue;

    const resultMap = new Map(
      step.toolResults.map((tr) => [tr.toolCallId, tr.result]),
    );

    for (const tc of step.toolCalls) {
      const result = resultMap.get(tc.toolCallId);
      uploads.push(
        saveToolcallBlock(supabase, clientId, tc.toolCallId, tc.args, result),
      );
    }
  }

  await Promise.all(uploads);
}
```

### Step 4: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts
```

Expected: PASS.

### Step 5: Write failing test — payload appended to user message

Add to the test file:

```typescript
  it("appends payload to instruction file content in user message", async () => {
    setupHappyPath();

    const { run_subagent } = createSubagentTool(MOCK_SUPABASE, CLIENT_ID, THREAD_ID, PARENT_RUN_ID);
    await run_subagent.execute(
      { ...BASE_ARGS, payload: '{"title":"Test Episode"}' },
      { abortSignal: new AbortController().signal } as never,
    );

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: "user",
            content: '# Morning Briefing\n\nSummarize today\'s tasks.\n\n{"title":"Test Episode"}',
          },
        ],
      }),
    );
  });

  it("does not append separator when payload is undefined", async () => {
    setupHappyPath();

    const { run_subagent } = createSubagentTool(MOCK_SUPABASE, CLIENT_ID, THREAD_ID, PARENT_RUN_ID);
    await run_subagent.execute(BASE_ARGS, { abortSignal: new AbortController().signal } as never);

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: "user",
            content: "# Morning Briefing\n\nSummarize today's tasks.",
          },
        ],
      }),
    );
  });
```

### Step 6: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts -- -t "payload"
```

Expected: PASS (already implemented in Step 3).

### Step 7: Write failing test — throws when instruction file not found

```typescript
  it("throws when instruction file not found", async () => {
    mockCreateAgentFileClient.mockReturnValue({
      downloadFile: vi.fn().mockRejectedValue(new Error("Object not found")),
      listDirectory: vi.fn(),
      uploadFile: vi.fn(),
      editFile: vi.fn(),
      deleteFile: vi.fn(),
    });

    const { run_subagent } = createSubagentTool(MOCK_SUPABASE, CLIENT_ID, THREAD_ID, PARENT_RUN_ID);

    await expect(
      run_subagent.execute(BASE_ARGS, { abortSignal: new AbortController().signal } as never),
    ).rejects.toThrow("Instruction file not found: subagents/triggers/morning-briefing.md");
  });
```

### Step 8: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts -- -t "throws when instruction file not found"
```

Expected: PASS (already implemented in Step 3).

### Step 9: Write failing test — throws when instruction file is empty

```typescript
  it("throws when instruction file is empty", async () => {
    mockCreateAgentFileClient.mockReturnValue({
      downloadFile: vi.fn().mockResolvedValue("   \n  "),
      listDirectory: vi.fn(),
      uploadFile: vi.fn(),
      editFile: vi.fn(),
      deleteFile: vi.fn(),
    });

    const { run_subagent } = createSubagentTool(MOCK_SUPABASE, CLIENT_ID, THREAD_ID, PARENT_RUN_ID);

    await expect(
      run_subagent.execute(BASE_ARGS, { abortSignal: new AbortController().signal } as never),
    ).rejects.toThrow("Instruction file is empty: subagents/triggers/morning-briefing.md");
  });
```

### Step 10: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts -- -t "throws when instruction file is empty"
```

Expected: PASS (already implemented in Step 3).

### Step 11: Write failing test — calls assembleContext with correct params

```typescript
  it("calls assembleContext with threadId, empty currentMessage, and clientId", async () => {
    setupHappyPath();

    const { run_subagent } = createSubagentTool(MOCK_SUPABASE, CLIENT_ID, THREAD_ID, PARENT_RUN_ID);
    await run_subagent.execute(BASE_ARGS, { abortSignal: new AbortController().signal } as never);

    expect(mockAssembleContext).toHaveBeenCalledWith({
      supabase: MOCK_SUPABASE,
      threadId: THREAD_ID,
      currentMessage: "",
      clientId: CLIENT_ID,
    });
  });
```

### Step 12: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts -- -t "calls assembleContext"
```

Expected: PASS.

### Step 13: Write failing test — calls createRunnerTools with `isSubagent: true`

```typescript
  it("creates runner tools with isSubagent: true", async () => {
    setupHappyPath();

    const { run_subagent } = createSubagentTool(MOCK_SUPABASE, CLIENT_ID, THREAD_ID, PARENT_RUN_ID);
    await run_subagent.execute(BASE_ARGS, { abortSignal: new AbortController().signal } as never);

    expect(mockCreateRunnerTools).toHaveBeenCalledWith(
      MOCK_SUPABASE,
      CLIENT_ID,
      THREAD_ID,
      expect.objectContaining({
        isSubagent: true,
        allowTriggerMutations: false,
        allowConnectionMutations: false,
      }),
    );
  });
```

### Step 14: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts -- -t "creates runner tools"
```

Expected: PASS.

### Step 15: Write failing test — persists tool calls to block storage

```typescript
  it("persists subagent tool calls to block storage", async () => {
    mockCreateAgentFileClient.mockReturnValue({
      downloadFile: vi.fn().mockResolvedValue("# Instructions"),
      listDirectory: vi.fn(),
      uploadFile: vi.fn(),
      editFile: vi.fn(),
      deleteFile: vi.fn(),
    });

    mockAssembleContext.mockResolvedValue({ system: "system", messages: [] });
    mockCreateRunnerTools.mockReturnValue({} as never);
    mockCompleteRun.mockResolvedValue(undefined);
    mockSaveToolcallBlock.mockResolvedValue(undefined);

    // Simulate generateText with steps that have tool calls
    const mockSteps = [
      {
        toolCalls: [{ toolCallId: "tc-1", toolName: "web_search", args: { query: "test" } }],
        toolResults: [{ toolCallId: "tc-1", result: { data: "search results" } }],
      },
      {
        toolCalls: [{ toolCallId: "tc-2", toolName: "read_file", args: { path: "notes.md" } }],
        toolResults: [{ toolCallId: "tc-2", result: { content: "file content" } }],
      },
    ];

    // We need onStepFinish to be called with each step
    mockGenerateText.mockImplementation(async (config: { onStepFinish?: (step: unknown) => void }) => {
      if (config.onStepFinish) {
        for (const step of mockSteps) {
          config.onStepFinish(step);
        }
      }
      return {
        text: "Done",
        usage: { inputTokens: 100, outputTokens: 50 },
        steps: mockSteps,
      } as never;
    });

    const { run_subagent } = createSubagentTool(MOCK_SUPABASE, CLIENT_ID, THREAD_ID, PARENT_RUN_ID);
    await run_subagent.execute(BASE_ARGS, { abortSignal: new AbortController().signal } as never);

    expect(mockSaveToolcallBlock).toHaveBeenCalledTimes(2);
    expect(mockSaveToolcallBlock).toHaveBeenCalledWith(
      MOCK_SUPABASE, CLIENT_ID, "tc-1", { query: "test" }, { data: "search results" },
    );
    expect(mockSaveToolcallBlock).toHaveBeenCalledWith(
      MOCK_SUPABASE, CLIENT_ID, "tc-2", { path: "notes.md" }, { content: "file content" },
    );
  });
```

### Step 16: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts -- -t "persists subagent tool calls"
```

Expected: PASS.

### Step 17: Write failing test — logs subagent run with correct metadata

```typescript
  it("logs subagent run with run_type subagent and parentRunId", async () => {
    setupHappyPath();

    const { run_subagent } = createSubagentTool(MOCK_SUPABASE, CLIENT_ID, THREAD_ID, PARENT_RUN_ID);
    await run_subagent.execute(BASE_ARGS, { abortSignal: new AbortController().signal } as never);

    expect(mockCompleteRun).toHaveBeenCalledWith(
      MOCK_SUPABASE,
      expect.objectContaining({
        runType: "subagent",
        parentRunId: PARENT_RUN_ID,
        status: "completed",
        tokensIn: 500,
        tokensOut: 200,
      }),
    );
  });
```

### Step 18: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts -- -t "logs subagent run"
```

Expected: PASS.

### Step 19: Write failing test — logs failed run on error

```typescript
  it("logs failed run and rethrows when generateText fails", async () => {
    mockCreateAgentFileClient.mockReturnValue({
      downloadFile: vi.fn().mockResolvedValue("# Instructions"),
      listDirectory: vi.fn(),
      uploadFile: vi.fn(),
      editFile: vi.fn(),
      deleteFile: vi.fn(),
    });

    mockAssembleContext.mockResolvedValue({ system: "system", messages: [] });
    mockCreateRunnerTools.mockReturnValue({} as never);
    mockCompleteRun.mockResolvedValue(undefined);

    mockGenerateText.mockRejectedValue(new Error("LLM timeout"));

    const { run_subagent } = createSubagentTool(MOCK_SUPABASE, CLIENT_ID, THREAD_ID, PARENT_RUN_ID);

    await expect(
      run_subagent.execute(BASE_ARGS, { abortSignal: new AbortController().signal } as never),
    ).rejects.toThrow("LLM timeout");

    expect(mockCompleteRun).toHaveBeenCalledWith(
      MOCK_SUPABASE,
      expect.objectContaining({
        status: "failed",
        runType: "subagent",
      }),
    );
  });
```

### Step 20: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts -- -t "logs failed run"
```

Expected: PASS.

### Step 21: Write failing test — propagates AbortError without logging

```typescript
  it("propagates AbortError without logging a failed run", async () => {
    mockCreateAgentFileClient.mockReturnValue({
      downloadFile: vi.fn().mockResolvedValue("# Instructions"),
      listDirectory: vi.fn(),
      uploadFile: vi.fn(),
      editFile: vi.fn(),
      deleteFile: vi.fn(),
    });

    mockAssembleContext.mockResolvedValue({ system: "system", messages: [] });
    mockCreateRunnerTools.mockReturnValue({} as never);

    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    mockGenerateText.mockRejectedValue(abortError);

    const { run_subagent } = createSubagentTool(MOCK_SUPABASE, CLIENT_ID, THREAD_ID, PARENT_RUN_ID);

    await expect(
      run_subagent.execute(BASE_ARGS, { abortSignal: new AbortController().signal } as never),
    ).rejects.toThrow("Aborted");

    // AbortError should not trigger a failed run log
    expect(mockCompleteRun).not.toHaveBeenCalled();
  });
```

### Step 22: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts -- -t "propagates AbortError"
```

Expected: PASS.

### Step 23: Write failing test — tool description matches Tasklet schema

```typescript
  it("has the correct Tasklet-matching description", () => {
    const { run_subagent } = createSubagentTool(MOCK_SUPABASE, CLIENT_ID, THREAD_ID, PARENT_RUN_ID);

    expect(run_subagent.description).toBe(
      "Runs a subagent to handle work efficiently outside of your main context. " +
      "Returns the final message from the subagent as its result.",
    );
  });
```

### Step 24: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts -- -t "correct Tasklet-matching description"
```

Expected: PASS.

### Step 25: Run all subagent tests

```bash
npx vitest run src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts
```

Expected: ALL PASS.

### Step 26: Create barrel export

Create `src/lib/runner/tools/subagents/index.ts`:

```typescript
/**
 * Subagent tool factory barrel for runner registration.
 * @module lib/runner/tools/subagents
 */
export { createSubagentTool } from "./run-subagent";
```

### Step 27: Commit

```bash
git add src/lib/runner/tools/subagents/
git commit -m "feat(pr29): implement run_subagent tool with TDD"
```

---

## Task 5: Wire `run_subagent` into the runner tool registry

**Files:**
- Modify: `src/lib/runner/tools/index.ts` — export `createSubagentTool`
- Modify: `src/lib/runner/run-agent.ts` — add `run_subagent` to tool set for non-subagent runs

### Step 1: Write failing test — `run_subagent` present in normal tool set

Add to `src/lib/runner/__tests__/create-runner-tools.test.ts`:

```typescript
  it("includes run_subagent in normal (non-subagent) tool set", () => {
    const supabase = createMockSupabaseClient();
    const tools = createRunnerTools(supabase as never, CLIENT_ID, THREAD_ID);
    const toolNames = Object.keys(tools);

    expect(toolNames).toContain("run_subagent");
  });

  it("excludes run_subagent from subagent tool set (no nesting)", () => {
    const supabase = createMockSupabaseClient();
    const tools = createRunnerTools(supabase as never, CLIENT_ID, THREAD_ID, {
      isSubagent: true,
    });
    const toolNames = Object.keys(tools);

    expect(toolNames).not.toContain("run_subagent");
  });
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/__tests__/create-runner-tools.test.ts -- -t "run_subagent"
```

Expected: FAIL — `run_subagent` not in tool set.

### Step 3: Add export to barrel

In `src/lib/runner/tools/index.ts`, add:

```typescript
export { createSubagentTool } from "./subagents";
```

### Step 4: Wire `run_subagent` into `createRunnerTools`

In `src/lib/runner/run-agent.ts`:

Add import:

```typescript
import {
  createConnectionTools,
  createCrmTools,
  createStorageTools,
  createSubagentTool,
  createTriggerTools,
  createUtilityTools,
  createWebTools,
} from "@/lib/runner/tools";
```

Inside `createRunnerTools`, after the connection tools section, add:

```typescript
  // Subagent tool — only available to parent runs (no nesting per RUNNER-06).
  // Requires a parentRunId at runtime; omitted from the factory since it's
  // only known during actual execution. The runner wires it in runAgent().
  // For the factory, we skip it here — it's added at call site in runAgent().

  return tools as RunnerTools;
```

Actually, the cleaner approach: Since `run_subagent` needs `parentRunId` which is only available at `runAgent()` call time, we wire it directly in `runAgent()` rather than in `createRunnerTools`. Let's revise the test:

**Revised approach:** `createRunnerTools` does NOT include `run_subagent` — it's added by `runAgent()` after run creation. The test should verify it's NOT in `createRunnerTools` but IS in the full tool set built by `runAgent`. However, since we can't easily test `runAgent` (it's an integration point), we'll make the wiring explicit.

**Simpler approach:** Add an optional `parentRunId` to `createRunnerTools` options. When provided and `isSubagent` is false, include `run_subagent`.

Update `createRunnerTools` in `run-agent.ts`:

```typescript
export function createRunnerTools(
  supabase: ChatSupabaseClient,
  clientId: string,
  threadId: string,
  options?: {
    allowTriggerMutations?: boolean;
    allowConnectionMutations?: boolean;
    crmMode?: "normal" | "setup";
    crmConfig?: Awaited<ReturnType<typeof loadCrmConfig>>["config"];
    isSubagent?: boolean;
    /** When provided, adds run_subagent to the tool set (parent runs only). */
    parentRunId?: string;
  },
) {
  // ... existing code ...

  // Subagent tool — only for parent runs (no nesting).
  if (!isSubagent && options?.parentRunId) {
    const subagentTool = createSubagentTool(supabase, clientId, threadId, options.parentRunId);
    Object.assign(tools, subagentTool);
  }

  return tools;
}
```

Update the `runAgent()` function to pass `parentRunId`:

```typescript
    const runnerTools = createRunnerTools(supabase, clientId, threadId, {
      allowTriggerMutations: payload.triggerType === "chat",
      crmMode,
      crmConfig,
      parentRunId: lockResult.runId,
    });
```

Update the test accordingly — pass `parentRunId` to get `run_subagent`:

```typescript
  it("includes run_subagent when parentRunId is provided and isSubagent is false", () => {
    const supabase = createMockSupabaseClient();
    const tools = createRunnerTools(supabase as never, CLIENT_ID, THREAD_ID, {
      parentRunId: "run-123",
    });
    const toolNames = Object.keys(tools);

    expect(toolNames).toContain("run_subagent");
  });

  it("excludes run_subagent from subagent tool set (no nesting)", () => {
    const supabase = createMockSupabaseClient();
    const tools = createRunnerTools(supabase as never, CLIENT_ID, THREAD_ID, {
      isSubagent: true,
      parentRunId: "run-123",
    });
    const toolNames = Object.keys(tools);

    expect(toolNames).not.toContain("run_subagent");
  });

  it("excludes run_subagent when no parentRunId provided", () => {
    const supabase = createMockSupabaseClient();
    const tools = createRunnerTools(supabase as never, CLIENT_ID, THREAD_ID);
    const toolNames = Object.keys(tools);

    expect(toolNames).not.toContain("run_subagent");
  });
```

### Step 5: Run test to verify it passes

```bash
npx vitest run src/lib/runner/__tests__/create-runner-tools.test.ts
```

Expected: ALL PASS.

### Step 6: Run full runner tests to verify no regressions

```bash
npx vitest run src/lib/runner/
```

Expected: ALL PASS.

### Step 7: Commit

```bash
git add src/lib/runner/run-agent.ts src/lib/runner/tools/index.ts src/lib/runner/__tests__/create-runner-tools.test.ts
git commit -m "feat(pr29): wire run_subagent into runner tool registry"
```

---

## Task 6: System prompt — add `<subagents>` section and update `<triggers>`

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`

### Step 1: Write failing tests

Add to `src/lib/ai/__tests__/system-prompt.test.ts`:

```typescript
  describe("subagents section", () => {
    it("includes <subagents> section", () => {
      expect(SYSTEM_PROMPT).toContain("<subagents>");
      expect(SYSTEM_PROMPT).toContain("</subagents>");
    });

    it("instructs agent to use run_subagent for context isolation", () => {
      expect(SYSTEM_PROMPT).toContain("run_subagent");
      expect(SYSTEM_PROMPT).toContain("outside of your main context");
    });

    it("instructs agent that subagents are invisible to user", () => {
      expect(SYSTEM_PROMPT).toContain("Do not mention them to the user");
    });

    it("instructs agent to check for existing subagent files before creating new ones", () => {
      expect(SYSTEM_PROMPT).toContain("check for existing subagent files");
    });

    it("instructs agent to write instruction file before creating trigger", () => {
      expect(SYSTEM_PROMPT).toContain("write the subagent instruction file first");
    });

    it("lists appropriate use cases", () => {
      expect(SYSTEM_PROMPT).toContain("Trigger-fired workflows");
      expect(SYSTEM_PROMPT).toContain("Research tasks");
      expect(SYSTEM_PROMPT).toContain("Batch data processing");
    });

    it("warns against using subagents for simple operations", () => {
      expect(SYSTEM_PROMPT).toContain("Do not use subagents for simple single-tool operations");
    });
  });

  describe("triggers section update for subagents", () => {
    it("instructs agent to use run_subagent for trigger instruction paths", () => {
      expect(SYSTEM_PROMPT).toContain("use run_subagent to execute it");
    });

    it("instructs agent not to read instruction files inline", () => {
      expect(SYSTEM_PROMPT).toContain("Do not read instruction files and execute them inline");
    });
  });
```

### Step 2: Run tests to verify they fail

```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts
```

Expected: FAIL — `<subagents>` section not found, trigger instruction text doesn't match.

### Step 3: Implement — add `<subagents>` section

In `src/lib/ai/system-prompt.ts`, add the following section after the `</triggers>` closing tag (around line 107):

```
<subagents>
You can spawn subagents to handle work outside your main context using run_subagent.
Running subagents reduces costs and keeps your context focused.

- Subagents run in isolation. They cannot see your conversation history or ask the user questions.
- Only the subagent's final response is returned to you. Intermediate tool calls are discarded from your context but persisted in block storage.
- Subagents are an implementation detail. Do not mention them to the user.
- ALWAYS check for existing subagent files before creating a new one to avoid duplicates.
- Before creating a trigger, write the subagent instruction file first using write_file.
  Store instruction files under subagents/ (e.g., subagents/triggers/morning-briefing.md).
- Instruction files must be completely self-contained — include input contract,
  step-by-step procedure, output format, and error handling.
- When users give feedback about automated behavior, update the relevant subagent
  instruction file accordingly.
- Use the filesystem and SQL database to share state between subagent runs and to
  track progress for recurring tasks to avoid repeating work.
- If a subagent fails, check the error. You may retry with adjusted payload,
  fix the instruction file, or report the issue to the user.

Use subagents for:
- Trigger-fired workflows (briefings, monitors, follow-up sweeps)
- Research tasks (person lookup, market analysis, document extraction)
- Batch data processing (lead cleaning, bulk CRM updates)

Do not use subagents for simple single-tool operations. Call the tool directly instead.
</subagents>
```

### Step 4: Implement — update `<triggers>` section

Replace the existing trigger instruction line about `instruction_path`:

Old (line ~103):
```
- When a trigger event includes an instruction_path, read that file before acting if you need the trigger workflow or acceptance criteria.
```

New:
```
- When a trigger event includes an instruction_path, use run_subagent to execute it.
  Pass the trigger payload as the subagent payload. The subagent runs in isolation
  and returns results to you.
- Do not read instruction files and execute them inline. Always delegate via run_subagent.
```

### Step 5: Run tests to verify they pass

```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts
```

Expected: ALL PASS.

### Step 6: Commit

```bash
git add src/lib/ai/system-prompt.ts src/lib/ai/__tests__/system-prompt.test.ts
git commit -m "feat(pr29): add subagents section and update triggers in system prompt"
```

---

## Task 7: Run full test suite and verify

### Step 1: Run all tests

```bash
npx vitest run
```

Expected: ALL PASS.

### Step 2: Verify test coverage

Confirm these behaviors are tested:

- [ ] Happy path: reads instruction file, returns final text as raw string
- [ ] Payload appended to instruction content in user message
- [ ] No separator when payload is undefined
- [ ] Throws when instruction file not found
- [ ] Throws when instruction file is empty
- [ ] `assembleContext` called with correct params (empty currentMessage, clientId, threadId)
- [ ] `createRunnerTools` called with `isSubagent: true`
- [ ] Subagent tool calls persisted to block storage via `saveToolcallBlock`
- [ ] Subagent run logged with `runType: 'subagent'` and `parentRunId`
- [ ] Failed run logged on error
- [ ] AbortError propagated without logging failed run
- [ ] Tool description matches Tasklet schema
- [ ] `isSubagent: true` removes trigger tools from tool set
- [ ] `isSubagent: true` removes `ask_user_question` and `rename_chat`
- [ ] `isSubagent: true` removes connection mutation tools
- [ ] `isSubagent: true` keeps CRM, storage, web, and allowed utility tools
- [ ] `run_subagent` present in parent tool set (when `parentRunId` provided)
- [ ] `run_subagent` absent from subagent tool set (no nesting)
- [ ] System prompt contains `<subagents>` section with correct instructions
- [ ] System prompt triggers section updated to mandate `run_subagent` for instruction paths

### Step 3: Final commit

```bash
git add -A
git commit -m "feat(pr29): subagents — run_subagent tool with full Tasklet alignment

Implements PR 29 (Subagents) per design doc docs/designs/pr29-subagents.md.

- New tool: run_subagent spawns isolated generateText() with markdown instructions
- Full parent system prompt inherited via assembleContext()
- Instruction .md + payload as user message (Tasklet pattern)
- Tool blocking: isSubagent flag removes triggers, UI tools, connection mutations
- Block storage: subagent tool calls persisted via saveToolcallBlock
- Observability: run_type + parent_run_id columns on runs table
- System prompt: <subagents> section + trigger instruction delegation
- No nesting (depth=1), no parallel execution (sequential await)

Decisions: RUNNER-06, RUNNER-07"
```

---

## Verification Checklist

- [ ] Migration applied: `run_type` + `parent_run_id` columns on `runs` table
- [ ] `CompleteRunInput` accepts `runType` and `parentRunId`
- [ ] `createRunnerTools` accepts `isSubagent` flag
- [ ] `isSubagent: true` removes: all trigger tools, `ask_user_question`, `rename_chat`, connection mutation tools
- [ ] `isSubagent: true` keeps: CRM tools, storage tools, web tools, `manage_todo`, `list_todo`, `run_agent_memory_sql`, `send_message`, connection read tools
- [ ] `run_subagent` tool reads instruction file from Supabase Storage
- [ ] `run_subagent` throws on file not found or empty file
- [ ] `run_subagent` builds system prompt via `assembleContext()` (full parent context minus history)
- [ ] `run_subagent` sends instruction .md + payload as user message
- [ ] `run_subagent` calls `generateText` with `stopWhen: stepCountIs(9)`, timeouts, and abort signal
- [ ] `run_subagent` returns `result.text` directly (raw string, no wrapper)
- [ ] `run_subagent` persists subagent tool calls to block storage
- [ ] `run_subagent` logs run with `run_type: 'subagent'` and `parent_run_id`
- [ ] `run_subagent` logs failed run on error, rethrows
- [ ] `run_subagent` propagates `AbortError` without logging
- [ ] `run_subagent` NOT in subagent tool set (no nesting, depth=1)
- [ ] `run_subagent` IS in parent tool set (when `parentRunId` provided)
- [ ] Composio tools loaded for subagent (minus connection management)
- [ ] System prompt `<subagents>` section present with all instructions
- [ ] System prompt `<triggers>` updated: mandate `run_subagent` for instruction paths
- [ ] System prompt: "Do not read instruction files and execute them inline"
- [ ] All existing tests still pass
- [ ] `npx vitest run` — full suite green
