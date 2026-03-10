# PR 29 — Subagents Design Doc

> **Status:** Final — post drift-analysis revision
> **Decisions:** RUNNER-06 (tool inheritance), RUNNER-07 (workflows are markdown)
> **Depends on:** PR 20 (trigger tools), PR 26 (connections)
> **Reference:** `docs/designs/pr29-validation-execution-trace.md`, `docs/designs/pr29-drift-analysis.md`

---

## 1. What We're Building

One new runner tool — `run_subagent` — that spawns an isolated `generateText()` call using a per-client markdown instruction file. The subagent inherits the full parent system prompt (platform instructions, persona, memory, system reminder) and receives the instruction markdown + payload as the first user message. The parent agent delegates work; only the subagent's final text response returns to the parent's inline context. Intermediate tool calls are stripped from the parent context but fully persisted in block storage.

This is the Tasklet `run_subagent` pattern implemented on Vercel AI SDK v6.

## 2. Why

- **Context isolation.** Web scrapes, CRM bulk lookups, and document analysis bloat the parent context. Subagents keep intermediate results out of the parent's token window.
- **Enforced instructions.** Today trigger-fired runs "suggest" the agent read an instruction file. With subagents the instruction file is delivered as a user message to a fresh LLM instance — no optional read.
- **Composability.** Triggers, autopilot pulses, and interactive chat can all delegate to the same subagent definition.

## 3. Tool Schema

Matches Tasklet verbatim:

```json
{
  "name": "run_subagent",
  "description": "Runs a subagent to handle work efficiently outside of your main context. Returns the final message from the subagent as its result.",
  "parameters": {
    "required": ["path", "action_pending", "action_finished", "action_error"],
    "properties": {
      "action_pending": {
        "type": "string",
        "description": "Custom UI status text shown while running. IMPORTANT: Output these three action_ parameters before all other parameters."
      },
      "action_finished": {
        "type": "string",
        "description": "Custom UI status text shown on success."
      },
      "action_error": {
        "type": "string",
        "description": "Custom UI status text shown on failure."
      },
      "path": {
        "type": "string",
        "description": "Full path to the subagent markdown file (e.g., 'subagents/triggers/morning-briefing.md')"
      },
      "payload": {
        "type": "string",
        "description": "Optional data to pass to the subagent that will be added after the subagent's instructions in the first user message."
      }
    }
  }
}
```

### Tool Response Shape

The tool returns the subagent's final text directly as a raw string — no JSON wrapper.

On error (file not found, empty file, LLM failure, timeout), the tool throws. The AI SDK surfaces thrown errors as `tool-error` content parts to the parent LLM, which decides how to handle them (retry, report to user, fix instruction file). Abort signals propagate naturally.

This matches Tasklet, where the parent LLM infers success/failure from the subagent's natural language response rather than keying off a boolean flag.

## 4. Execution Model

### 4.1 Core Loop

```
Parent tool call: run_subagent({ path, payload, ... })
  │
  ├─ 1. Read instruction .md from Supabase Storage (read_file equivalent)
  │     Path is relative to client's storage root: /clients/{clientId}/{path}
  │
  ├─ 2. Build subagent system prompt via assembleContext():
  │     Same full system prompt the parent uses (platform instructions, persona,
  │     memory files, system reminder) — but no thread history or compaction summary.
  │
  ├─ 3. Call generateText():
  │     - model: gateway(TIER_1_MODEL)          (Gemini Flash — same as parent)
  │     - system: full parent system prompt      (from assembleContext)
  │     - messages: [{ role: "user", content: instructionMd + "\n\n" + payload }]
  │     - tools: subagentTools                   (full set minus blocked tools)
  │     - stopWhen: stepCountIs(9)               (same budget as parent)
  │     - abortSignal: inherited from parent tool execution context
  │     - onStepFinish: collect tool calls for block storage persistence
  │
  ├─ 4. On completion:
  │     - Persist subagent tool calls to block storage (individual blocks per tool call)
  │     - Build full execution trace and store as run_subagent result block
  │     - Log subagent run to runs table (tokens, steps, status)
  │     - Return result.text to parent (raw string)
  │
  └─ 5. On error:
        - Log failed run
        - Throw error (AI SDK surfaces to parent LLM as tool-error)
```

### 4.2 Why `generateText` Not `streamText` or `ToolLoopAgent`

- **`generateText`**: Parent waits for subagent completion inside a tool `execute()`. No streaming to the client. Simple await. This matches Tasklet where `run_subagent` blocks until the subagent finishes.
- **Not `ToolLoopAgent`**: We already have our own tool registry construction (`createRunnerTools`). `ToolLoopAgent` is a convenience wrapper we don't need — it would add an abstraction layer between us and the `generateText` call.
- **Not `streamText`**: No UI streaming for subagent work. The parent receives the final text. Intermediate progress is invisible to the user (subagents are an implementation detail per Tasklet).

### 4.3 System Prompt Composition

The subagent inherits the **full parent system prompt** — the same brain as the parent, minus conversation history. This is achieved by reusing `assembleContext()` with no thread history:

```typescript
const { system } = await assembleContext({
  supabase,
  threadId,
  currentMessage: "",  // no current message — instruction goes in user message
  clientId,
});
```

This gives the subagent:

| Layer | Included | What it provides |
|-------|----------|-----------------|
| Platform instructions | Yes | CRM field vocab, operational rules |
| System prompt (persona) | Yes | Tool knowledge, formatting, approvals, output guidance |
| Soul | Yes | Brand voice for drafting emails/messages |
| User profile | Yes | Agent's name, preferences, contact info |
| Working memory | Yes | Accumulated agent knowledge |
| System reminder | Yes | Current time, user name, active connections, todos, triggers |
| Compaction summary | No | Thread-specific history — irrelevant to isolated work |
| Instructions override | No | Parent-specific (e.g., autopilot instruction prompt) |

The instruction `.md` file + optional payload become the **user message**, not the system prompt:

```typescript
messages: [{
  role: "user",
  content: instructionMarkdown + (payload ? "\n\n" + payload : ""),
}]
```

### 4.4 Rationale: Full System Prompt, Not a Preamble

Tasklet gives subagents the full parent system prompt. This is critical because the subagent needs the same tool knowledge, formatting rules, and platform conventions as the parent. Without it, every instruction file would need to re-explain tool usage patterns, output formatting, error handling conventions, and platform behavior. The subagent gets the same brain — only the task (the .md file) is different.

Evidence from Tasklet validation: the subagent knew `'owner'` as a `send_message` recipient (from `<contacting-the-user>`), formatted markdown emails correctly (from `<output-guidance>`), and used `<thinking>` blocks (same reasoning mode) — all inherited from the system prompt, not the 55-line .md file.

## 5. Tool Access Control

### 5.1 Blocked Tools (per RUNNER-06)

Subagents cannot use tools that display UI to the user (subagent execution is invisible):

| Blocked Tool | Category | Reason |
|---|---|---|
| `setup_trigger` | Triggers | UI-interaction: creates automations |
| `search_triggers` | Triggers | UI-interaction: browses trigger catalog |
| `manage_active_triggers` | Triggers | UI-interaction: manages automations |
| `create_new_connections` | Connections | UI-interaction: initiates OAuth |
| `manage_activated_tools_for_connections` | Connections | UI-interaction: tool activation |
| `reauthorize_connection` | Connections | UI-interaction: re-auth flow |
| `delete_connection` | Connections | UI-interaction: removes connection |
| `rename_chat` | Utility | UI-interaction: chat title |
| `ask_user_question` | Utility | Subagents cannot interact with user |
| `run_subagent` | Subagents | No nesting (depth=1) — intentional Sunder constraint |

> **Future:** When `add_contact_method` lands (PR 32a), add it to this list — it displays a UI verification flow.

### 5.2 Allowed Tools

Everything else:

- **CRM:** All read + write tools (search_contacts, create_contact, update_deal, search_tasks, etc.)
- **Storage:** read_file, write_file, list_files
- **Web:** web_search, web_scrape
- **Utility:** manage_todo, list_todo, run_agent_memory_sql, send_message
- **Composio:** All activated connection tools (Gmail, Calendar, etc.)

### 5.3 Implementation Pattern

Follow the existing autopilot pattern — factory options control what's returned:

```typescript
const tools = createRunnerTools(supabase, clientId, threadId, {
  allowTriggerMutations: false,    // existing: removes setup_trigger
  allowConnectionMutations: false, // existing: removes connection mutations
  isSubagent: true,                // NEW: also removes search_triggers,
                                   //   manage_active_triggers,
                                   //   rename_chat, ask_user_question
});
// run_subagent is never added to subagent tool set (structurally excluded)
```

Note: The existing `allowTriggerMutations: false` only removes `setup_trigger`. For subagents we also need to remove `search_triggers` and `manage_active_triggers` entirely (not just mutation-gated). This requires a new `isSubagent` flag.

## 6. Nesting

**No nesting. Depth = 1. Intentional Sunder constraint.**

`run_subagent` is excluded from the subagent tool set. A subagent cannot spawn another subagent. This is enforced structurally — the tool simply isn't in the registry.

Tasklet doesn't explicitly block nesting, but Sunder blocks it to prevent runaway recursion, simplify debugging, and keep token budgets predictable. No real estate CRM use case requires nested subagents.

## 7. Observability

### 7.1 Run Logging

Each subagent execution inserts a row in `runs` (reusing existing table):

```sql
INSERT INTO runs (thread_id, client_id, status, model, tokens_in, tokens_out, step_count, run_type, parent_run_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, 'subagent', $8);
```

New columns on `runs` table:

| Column | Type | Default | Notes |
|---|---|---|---|
| `run_type` | `text` | `'chat'` | One of: `'chat'`, `'cron'`, `'autopilot'`, `'subagent'` |
| `parent_run_id` | `uuid` | `null` | References `runs.run_id` for subagent runs |

This gives us:
- Token cost attribution per subagent
- Step count tracking
- Success/failure status
- Parent-child run relationship for audit trail

### 7.2 Block Storage — Full Persistence

Subagent intermediate tool calls are stripped from the parent's **inline context** but fully **persisted in block storage**. This matches Tasklet's two-layer model:

**Layer 1 — Individual tool call blocks:**
Each tool the subagent calls gets its own independent block via `saveToolcallBlock` (same as parent runs). Full untruncated args and results are stored.

**Layer 2 — Composite execution trace:**
The `run_subagent` tool call's own block result contains the full execution trace: every thinking step, every tool call (with blockIds for recovery), every intermediate agent message. Large values are truncated within this composite trace, but individual blocks hold the full data.

Implementation: Wire `onStepFinish` callback in the `generateText` call to collect all steps, then use existing `saveToolcallBlock` + `buildAssistantPartsFromSteps` infrastructure to persist.

**What the parent sees inline:**
```
<context-removed>N blocks of subagent execution details truncated</context-removed>
<final-result>
[subagent's final text response]
</final-result>
blockId: b_xxxxx
```

The parent can call `read_file` on the block to recover full details if needed.

### 7.3 User Visibility

Subagents are **invisible to the user** per Tasklet:
- The `action_pending` / `action_finished` / `action_error` status strings are rendered as tool call status in the chat UI (same as any other tool call).
- The user sees "Preparing briefing..." while it runs, then "Briefing ready" on completion.
- The user does NOT see intermediate subagent tool calls or reasoning.
- The parent agent decides what to show the user from the subagent's final response.

## 8. Timeout & Resource Limits

| Limit | Value | Rationale |
|---|---|---|
| `stopWhen` | `stepCountIs(9)` | Same budget as parent. Subagent may need CRM + web + file reads. |
| `timeout.totalMs` | `120000` (120s) | Matches Vercel function timeout. Web scraping can be slow. |
| `timeout.stepMs` | `30000` (30s) | Safety net per LLM round-trip. |
| `abortSignal` | Inherited from parent | If parent request is cancelled, subagent stops. |

## 9. Error Handling

### 9.1 Error Sources

| Error | Handling |
|---|---|
| Instruction file not found | Throw `Error("Instruction file not found: {path}")` → AI SDK surfaces as tool-error |
| Instruction file empty | Throw `Error("Instruction file is empty: {path}")` → AI SDK surfaces as tool-error |
| `generateText` throws (LLM error) | Throw propagates → AI SDK surfaces as tool-error |
| Timeout exceeded | Throw propagates → AI SDK surfaces as tool-error |
| Abort signal | Throw `AbortError` (propagates to parent naturally, stops the run) |
| Tool errors inside subagent | Handled by the LLM inside the subagent — errors appear in `result.text` per system prompt convention "report errors in your response" |

### 9.2 Parent Behavior on Error

The parent LLM receives a `tool-error` content part. Per Tasklet, the parent should:
- Retry with adjusted payload (if transient)
- Report the failure to the user (if permanent)
- Improve the instruction file (if the error suggests a bug in instructions)

This is LLM-driven behavior controlled by the parent's system prompt, not hardcoded retry logic.

## 10. System Prompt Changes

### 10.1 Update `<triggers>` Section

Current:
```
- When a trigger event includes an instruction_path, read that file before acting
  if you need the trigger workflow or acceptance criteria.
```

New (intentional Sunder constraint — Tasklet says "MUST STRONGLY CONSIDER" but we make it mandatory for consistency):
```
- When a trigger event includes an instruction_path, use run_subagent to execute it.
  Pass the trigger payload as the subagent payload. The subagent runs in isolation
  and returns results to you.
- Do not read instruction files and execute them inline. Always delegate via run_subagent.
```

### 10.2 Add `<subagents>` Section

New section in `SYSTEM_PROMPT`:

```xml
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

## 11. File Layout

### 11.1 New Files

```
src/lib/runner/tools/subagents/
├── run-subagent.ts              # Tool definition + execute logic
├── index.ts                     # createSubagentTool() factory export
└── __tests__/
    └── run-subagent.test.ts     # Unit tests

supabase/migrations/
└── {timestamp}_add_subagent_run_columns.sql   # run_type + parent_run_id columns
```

### 11.2 Modified Files

```
src/lib/runner/run-agent.ts      # Wire run_subagent into tool registry, pass parentRunId
src/lib/runner/tools/index.ts    # Export createSubagentTool
src/lib/ai/system-prompt.ts      # Add <subagents> section, update <triggers> section
```

### 11.3 Storage Convention

Subagent instruction files live in per-client Supabase Storage:

```
/clients/{clientId}/subagents/
├── triggers/
│   ├── morning-briefing.md
│   ├── listing-price-monitor.md
│   └── follow-up-sweep.md
└── research/
    ├── person-lookup.md
    └── market-analysis.md
```

The agent creates these via `write_file` during setup. The path stored in `agent_triggers.instruction_path` points here.

## 12. Implementation Pseudocode

```typescript
// src/lib/runner/tools/subagents/run-subagent.ts

import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

import { gateway, TIER_1_MODEL } from "@/lib/ai/gateway";
import { assembleContext } from "@/lib/runner/context";
import { createRunnerTools } from "@/lib/runner/run-agent";
import { completeRun } from "@/lib/runner/run-lifecycle";
import { saveToolcallBlock } from "@/lib/runner/toolcall-artifacts";
import { createAgentFileClient } from "@/lib/storage/agent-files";

const MAX_SUBAGENT_STEPS = 9;
const SUBAGENT_TIMEOUT_MS = 120_000;
const SUBAGENT_STEP_TIMEOUT_MS = 30_000;

const inputSchema = z.object({
  action_pending: z.string(),
  action_finished: z.string(),
  action_error: z.string(),
  path: z.string().min(1),
  payload: z.string().optional(),
});

export function createSubagentTool(
  supabase: SupabaseClient,
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
      // 1. Read instruction file
      const fileClient = createAgentFileClient(supabase, clientId);
      const { content, error: readError } = await fileClient.readFile(args.path);

      if (readError || !content) {
        throw new Error(`Instruction file not found: ${args.path}`);
      }

      if (content.trim().length === 0) {
        throw new Error(`Instruction file is empty: ${args.path}`);
      }

      // 2. Build system prompt — full parent system prompt via assembleContext
      //    (platform instructions, persona, memory, system reminder)
      //    No thread history, no compaction summary — clean isolation.
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
      // Composio tools also loaded (same as parent, minus connection mgmt)

      // 4. Execute — instruction .md + payload as user message
      const userMessage = content + (args.payload ? "\n\n" + args.payload : "");

      try {
        const result = await generateText({
          model: gateway(TIER_1_MODEL),
          system,
          messages: [{ role: "user", content: userMessage }],
          tools: subagentTools,
          stopWhen: stepCountIs(MAX_SUBAGENT_STEPS),
          abortSignal,
          timeout: {
            totalMs: SUBAGENT_TIMEOUT_MS,
            stepMs: SUBAGENT_STEP_TIMEOUT_MS,
          },
        });

        // 5. Persist subagent tool calls to block storage
        await persistSubagentBlocks(supabase, clientId, result.steps);

        // 6. Log run
        await logSubagentRun(supabase, {
          threadId,
          clientId,
          parentRunId,
          status: "completed",
          tokensIn: result.usage.inputTokens ?? 0,
          tokensOut: result.usage.outputTokens ?? 0,
          stepCount: result.steps.length,
        });

        // 7. Return raw text — no wrapper
        return result.text;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error; // propagate cancellation
        }

        await logSubagentRun(supabase, {
          threadId,
          clientId,
          parentRunId,
          status: "failed",
          tokensIn: 0,
          tokensOut: 0,
        });

        throw error; // AI SDK surfaces as tool-error to parent LLM
      }
    },
  });

  return { run_subagent };
}
```

## 13. Migration

```sql
-- Add run_type and parent_run_id to runs table
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

## 14. Test Plan

| Test | What it verifies |
|---|---|
| Reads instruction file from storage, returns final text as raw string | Happy path end-to-end |
| Throws when instruction file not found | File read error handling |
| Throws when instruction file is empty | Empty file guard |
| Subagent tools do not include `run_subagent` | No nesting |
| Subagent tools do not include trigger/connection/UI tools | Tool blocking |
| Subagent tools DO include CRM, storage, web, utility tools | Tool inheritance |
| `abortSignal` propagation cancels subagent | Cancellation |
| Timeout triggers thrown error | Resource limits |
| Subagent run logged to `runs` table with `run_type = 'subagent'` | Observability |
| Parent inline context receives only final text, not intermediate tool calls | Context isolation |
| Subagent intermediate tool calls persisted to block storage | Block storage persistence |
| Individual subagent tool call blocks recoverable by blockId | Block recovery |
| Full execution trace stored as `run_subagent` result block | Trace persistence |
| Composio tools available to subagent (minus connection mgmt) | Connection tool inheritance |
| System prompt includes full parent context (persona, memory, reminder) | Prompt composition |

## 15. What This Does NOT Include

- **Parallel subagent execution.** Parent waits sequentially. Parallelism deferred.
- **Subagent nesting.** Depth = 1 only. Intentional Sunder constraint.
- **Model routing.** Same model (Gemini Flash) for subagents. Multi-tier deferred.
- **Subagent-specific UI.** No dedicated subagent activity view. Status shown as tool call status in chat.
- **Instruction file validation.** No schema enforcement on instruction markdown. The LLM interprets whatever is in the file.

## 16. Drift Check: Tasklet Alignment

| Tasklet Behavior | Sunder Implementation | Drift |
|---|---|---|
| Tool schema: path, payload, action_pending/finished/error | Identical | None |
| System prompt = full parent system prompt | Yes — via `assembleContext()` (sans thread history) | None |
| Instruction .md + payload = first user message | Yes | None |
| Full tool access minus UI-interaction tools | Yes, same exclusion list | None |
| Only final message returned to parent inline context | Yes, `result.text` directly | None |
| Intermediate tool calls persisted in block storage | Yes, via `saveToolcallBlock` + execution trace | None |
| Subagents cannot ask user questions | Yes, `ask_user_question` blocked | None |
| Subagents are implementation detail, hidden from user | Yes, per system prompt | None |
| Errors surfaced in final message (subagent handles internally) | Yes, per system prompt convention | None |
| Tool errors propagate as tool-error to parent | Yes, throw → AI SDK surfaces | None |
| Files stored in `subagents/` convention | Yes, system prompt guides this | None |
| Sequential execution (parent waits) | Yes, `generateText` awaited | None |
| Check for existing subagents before creating new ones | Yes, per system prompt | None |
| Update subagent files when user gives feedback | Yes, per system prompt | None |
| Shared state via filesystem and SQL | Yes, per system prompt | None |

### Intentional Sunder Constraints (deliberate divergences)

| Constraint | Tasklet Behavior | Sunder Choice | Rationale |
|---|---|---|---|
| No nesting | Not explicitly blocked | Blocked (depth=1) | Prevents runaway recursion, simpler debugging |
| Mandatory subagent for triggers | "MUST STRONGLY CONSIDER" | Always required | Enforces isolation, consistent pattern |
| `ask_user_question` blocked | N/A (Sunder-specific tool) | Blocked | Subagents can't interact with user |
