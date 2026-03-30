# Vercel Sandbox Reference Repos — Complete Analysis

**Date:** 2026-03-28
**Purpose:** Definitive reference for migrating Sunder from Sprites (Fly.io) to Vercel Sandbox + bash-tool. Three official Vercel repos analyzed against Sunder's design.
**Local clones:**
- `/Users/sethlim/Documents/bash-tool`
- `/Users/sethlim/Documents/call-summary-agent-with-sandbox`
- `/Users/sethlim/Documents/oss-data-analyst`

---

## 1. Repo Overview

| | bash-tool | call-summary-agent | oss-data-analyst |
|---|---|---|---|
| **What it is** | npm package — bash/readFile/writeFile tools for AI agents | Reference app — Gong call summarizer with sandbox | Reference app — data analyst with semantic layer in sandbox |
| **Role for Sunder** | Implementation dependency | Primary architecture reference | Secondary reference (sandbox + bash-tool wiring) |
| **Sandbox** | Wraps Vercel Sandbox or just-bash | Creates Vercel Sandbox, passes to bash-tool | Creates Vercel Sandbox, passes to bash-tool |
| **Tools exposed to agent** | bash, readFile, writeFile | **bash only** | bash + ExecuteSQL + FinalizeReport |
| **File pre-loading** | `files` param on `createBashTool` | `generateFilesForSandbox()` → `files` param | `uploadDirectory` param (YAML semantic layer) |
| **Agent CLI inside?** | No | No | No |
| **Skills?** | `experimental_createSkillTool` | No | No (semantic YAML files serve similar purpose) |

---

## 2. bash-tool — The Implementation Dependency

### Package: `bash-tool` v1.3.15

**Install:** `npm install bash-tool @vercel/sandbox`

### Core API

```typescript
import { createBashTool } from "bash-tool";
import { Sandbox } from "@vercel/sandbox";

const sandbox = await Sandbox.create({ /* ... */ });

const { tools, bash, sandbox: wrappedSandbox } = await createBashTool({
  sandbox,                    // Vercel Sandbox instance
  files: {                    // Record<string, string> — pre-loaded into sandbox
    "input/data.csv": csvContent,
    "skills/analyst/SKILL.md": skillContent,
  },
  maxOutputLength: 100_000,   // stdout/stderr truncation (default: 30,000)
  maxFiles: 1000,             // file upload limit (default: 1,000)
  extraInstructions: "...",   // appended to bash tool description
  onBeforeBashCall: ({ command }) => { /* logging */ },
  onAfterBashCall: ({ result }) => { /* logging */ },
});
```

### Returns: `BashToolkit`

```typescript
interface BashToolkit {
  bash: Tool;                           // the bash tool directly
  tools: { bash, readFile, writeFile }; // all three tools
  sandbox: Sandbox;                     // the wrapped sandbox instance
}
```

### Sandbox Interface (what bash-tool expects)

```typescript
interface Sandbox {
  executeCommand(command: string): Promise<CommandResult>;
  readFile(path: string): Promise<string>;
  writeFiles(files: Array<{ path: string; content: string | Buffer }>): Promise<void>;
}
```

bash-tool auto-detects Vercel Sandbox (duck-types `sandboxId` + `runCommand`) and wraps it to match this interface. The wrapper (`src/sandbox/vercel.ts`) translates:
- `executeCommand(cmd)` → `sandbox.runCommand("bash", ["-c", cmd])`
- `readFile(path)` → `sandbox.readFile({ path })` → stream to string
- `writeFiles(files)` → `sandbox.writeFiles(files)` (converts strings to Buffers)

### File Loading (`src/files/loader.ts`)

Two modes:
- **`files` param:** `Record<string, string>` — inline content, written in batches of 20
- **`uploadDirectory`:** `{ source: string, include?: string }` — uploads from local disk via fast-glob

Files are written relative to `destination` (default `/workspace`, or `/vercel/sandbox/workspace` for Vercel Sandbox).

### bash Tool Description Generation (`src/tools/bash.ts` + `src/tools-prompt.ts`)

The bash tool's LLM description is dynamically generated:
1. Working directory notice
2. First 8 pre-loaded filenames listed
3. Available CLI tools discovered by running `ls /usr/bin /usr/local/bin /bin` in sandbox
4. Format-specific hints (e.g., "For JSON: jq, grep, sed")
5. Common operations cheatsheet (ls, find, grep, cat)
6. Extra instructions (if provided)

### Output Truncation (`src/tools/bash.ts`)

```typescript
const DEFAULT_MAX_OUTPUT_LENGTH = 30_000; // 30KB

function truncateOutput(output: string, maxLength: number, streamName: string): string {
  if (output.length <= maxLength) return output;
  const half = Math.floor(maxLength / 2);
  return `${output.slice(0, half)}\n[${streamName} truncated: ${removed} characters removed]\n${output.slice(-half)}`;
}
```

Keeps first half and last half, inserts truncation notice in the middle. Applied to both stdout and stderr independently.

### Skills System (`src/skill-tool.ts` + `src/tools/skill.ts` + `src/skills/`)

```typescript
import { experimental_createSkillTool } from "bash-tool";

const { skill, skills, files, instructions } = await experimental_createSkillTool({
  skillsDirectory: "./skills",  // local filesystem path
  destination: "skills",        // path prefix in sandbox (default: "skills")
});

const { tools } = await createBashTool({
  sandbox,
  files,                            // skill files → sandbox
  extraInstructions: instructions,  // skill directory descriptions → tool prompt
});

// Agent gets: skill tool + bash tool
```

**Progressive disclosure:**
1. Tool description lists skill names + one-line descriptions (always in context)
2. Agent calls `skill({ skillName: "csv" })` → gets full SKILL.md body + companion file list
3. Agent calls `bash({ command: "bash ./skills/csv/scripts/analyze.sh data.csv" })` → executes

**Skill directory structure (from examples/skills-tool):**
```
skills/
├── csv/
│   ├── SKILL.md          # frontmatter (name, description) + instructions
│   └── scripts/
│       ├── analyze.sh    # CSV analysis (rows, cols, headers, sample)
│       ├── filter.sh     # Filter rows by column value
│       ├── select.sh     # Select columns by number
│       └── sort.sh       # Sort by column
└── text/
    ├── SKILL.md
    └── scripts/
        ├── stats.sh      # Line/word/char counts
        ├── search.sh     # Grep-based pattern search
        ├── extract.sh    # Line/section extraction
        └── wordfreq.sh   # Word frequency counting
```

**SKILL.md format:**
```yaml
---
name: csv
description: Analyze and transform CSV data using bash tools
---

# CSV Processing Skill
Process CSV files using standard bash tools (awk, cut, sort, grep).

## Available Scripts
### analyze.sh
bash /skills/csv/scripts/analyze.sh data.csv
...
```

### Key Files to Reference

| File | What to copy/reference |
|---|---|
| `src/tool.ts` | `createBashTool()` orchestration — sandbox wrapping, file upload, tool creation |
| `src/tools/bash.ts` | bash tool definition — description generation, truncation, hooks |
| `src/sandbox/vercel.ts` | Vercel Sandbox adapter — how to wrap `@vercel/sandbox` into the `Sandbox` interface |
| `src/types.ts` | All interfaces — `Sandbox`, `CommandResult`, `CreateBashToolOptions`, `BashToolkit` |
| `src/files/loader.ts` | File loading — `streamFiles()`, `getFilePaths()`, batching |
| `src/skill-tool.ts` | Skill orchestration (reference only — we don't use this directly) |
| `src/skills/parser.ts` | SKILL.md parsing — `parseFrontmatter()`, `extractBody()`, `discoverSkills()` |
| `examples/skills-tool/index.ts` | Full skills + bash-tool wiring example |

---

## 3. call-summary-agent — The Architecture Reference

### What it demonstrates

The exact pattern Sunder needs: agent runs outside sandbox, one `bash` tool, data pre-loaded via `files` param, no `readFile`/`writeFile` exposed.

### Complete Data Flow

```
POST /api/gong-webhook
  → start(workflowGongSummary, [webhookData])
    → stepGetGongTranscript()          // fetch + convert to markdown
    → stepRunAgent()                   // THE MAIN STEP
      → createGongSummaryAgent()       // ToolLoopAgent
        → prepareCall():
          1. Sandbox.create({ timeout: ms('10m') })
          2. generateFilesForSandbox()  → Record<string, string>
          3. createAgentTools(sandbox, files, log)
             → createBashTool({ sandbox, files, onBeforeBashCall, onAfterBashCall })
             → returns { tools } (bash only)
          4. return { instructions, tools }
        → agent.generate({ prompt: TASK_PROMPT })
          → LLM calls bash in loop until done
          → returns result.text
    → stepEmitResult(summary)
```

### How `createBashTool` Is Called (`lib/tools.ts`)

This is **THE key file** — 40 lines total:

```typescript
import { createBashTool } from "bash-tool";
import type { Sandbox } from "@vercel/sandbox";

export async function createAgentTools(
  sandbox: Sandbox,
  files: Record<string, string>,
  log: LogFn,
) {
  const fileNames = Object.keys(files);
  for (const fileName of fileNames) {
    log("info", "sandbox", `Uploading: ${fileName}`);
  }

  const { tools } = await createBashTool({
    sandbox,
    files,
    onBeforeBashCall: ({ command }) => {
      log("info", "bash", `$ ${command}`);
      return undefined;    // no command modification
    },
    onAfterBashCall: ({ result }) => {
      const lines = result.stdout.split("\n");
      const preview = lines.slice(0, 8).join("\n");
      log("info", "bash", preview + (lines.length > 8 ? `\n... (${lines.length} lines)` : ""));
      if (result.stderr) log("warn", "bash", result.stderr.slice(0, 500));
      if (result.exitCode !== 0) log("warn", "bash", `Exit code: ${result.exitCode}`);
      return undefined;    // no result modification
    },
  });

  return tools;
}
```

**Key patterns:**
- Only `tools` destructured from `createBashTool` — not `bash`, not `sandbox`
- `readFile`/`writeFile` are NOT exposed to the agent — only `bash`
- Hooks return `undefined` (logging only, no modification)
- File upload logging happens before `createBashTool` call (for the log stream)

### How Files Are Pre-loaded (`lib/sandbox-context.ts`)

```typescript
export function generateFilesForSandbox({ webhookData }): Record<string, string> {
  const files: Record<string, string> = {};

  // Main transcript
  files[`gong-calls/${callId}-${slug}.md`] = transcriptMarkdown;

  // Metadata
  files["gong-calls/metadata.json"] = JSON.stringify(metadata);

  // In demo mode: additional context files
  if (isDemoMode()) {
    files["gong-calls/previous/demo-call-000-discovery-call.md"] = ...;
    files["salesforce/account.md"] = ...;
    files["research/company-research.md"] = ...;
    files["playbooks/sales-playbook.md"] = ...;
    // etc.
  }

  return files;
}
```

**Pattern:** Pure function. Takes context, returns `Record<string, string>`. No side effects. Paths are relative (bash-tool prepends the destination directory).

### File Tree for System Prompt (`lib/sandbox-context.ts`)

```typescript
export function generateFileTree(files: Record<string, string>): string {
  // Builds ASCII tree from file paths
  // Example output:
  // gong-calls/
  //   123-discovery-call.md
  //   metadata.json
  //   previous/
  //     demo-call-000-discovery-call.md
  // salesforce/
  //   account.md
}
```

Included in the system prompt so the agent knows what files are available without calling `ls`.

### Agent Configuration (`lib/agent.ts`)

```typescript
const agent = new ToolLoopAgent({
  model: config.model,                    // "anthropic/claude-haiku-4-5"
  callOptionsSchema: z.object({...}),     // typed options
  onStepFinish: ({ step }) => { ... },    // progress logging
  prepareCall: async ({ options }) => {
    const sandbox = await Sandbox.create({ timeout: ms(config.sandbox.timeout) });
    const files = generateFilesForSandbox({ webhookData: options.webhookData });
    const fileTree = generateFileTree(files);
    const instructions = buildInstructions(options, fileTree);
    const tools = await createAgentTools(sandbox, files, options.log);
    return { ...settings, instructions, tools };
  },
});
```

**Key pattern:** `prepareCall` runs once before the LLM loop. Sandbox creation + file upload happens here, not per-tool-call. The LLM loop runs until `finishReason === 'stop'` (no explicit maxSteps).

### Key Files to Reference

| File | What to copy/reference |
|---|---|
| `lib/tools.ts` | **Copy pattern verbatim.** How to call `createBashTool` with sandbox + files + hooks. |
| `lib/sandbox-context.ts` | **Copy pattern.** How to build the `files` Record from context data. Adapt for Supabase Storage. |
| `lib/agent.ts` | **Reference.** ToolLoopAgent with `prepareCall`. Sunder uses `streamText` with `maxSteps` instead, but the sandbox-in-prepare pattern is the same. |
| `lib/config.ts` | **Reference.** Config shape for sandbox timeout, model, demo mode. |
| `workflows/gong-summary/steps.ts` | **Reference only.** Durable workflow steps. Sunder doesn't use Vercel Workflows. |

---

## 4. oss-data-analyst — Secondary Reference

### What it demonstrates

Sandbox used as a **schema explorer** — semantic YAML files uploaded, agent browses them with bash, builds SQL queries, executes against a local SQLite database.

### How Sandbox Is Created (`src/lib/tools/sandbox.ts`)

```typescript
import { Sandbox } from "@vercel/sandbox";

export async function createSandbox() {
  const sandbox = await Sandbox.create({
    resources: { vcpus: 4 },
    timeout: ms("45m"),
  });
  return {
    sandbox,
    stop: () => sandbox.stop(),
  };
}
```

**Key pattern:** Returns `{ sandbox, stop }` — caller handles lifecycle. `stop()` called in `onFinish` callback of `streamText()`.

### How bash-tool Is Wired (`src/lib/tools/shell.ts`)

```typescript
import { createBashTool } from "bash-tool";

export async function createSemanticBashTools(sandbox: Sandbox) {
  const { tools } = await createBashTool({
    sandbox,
    destination: "./semantic",
    uploadDirectory: {
      source: "./src/semantic",
      include: "**/*.yml",
    },
  });
  return { tools };
}
```

**Key pattern:** Uses `uploadDirectory` instead of `files` — uploads YAML files from local disk. Sunder will use `files` (from Supabase Storage) instead.

### Agent Wiring (`src/lib/agent.ts`)

```typescript
export async function runAgent({ messages, model }) {
  const { sandbox, stop } = await createSandbox();
  const { tools: shellTools } = await createSemanticBashTools(sandbox);

  const result = streamText({
    model: resolveModel(model),
    system: SYSTEM_PROMPT,
    messages: convertToModelMessages(messages),
    tools: {
      bash: shellTools.bash,          // from bash-tool
      ExecuteSQL: executeSQLTool,     // custom tool
      FinalizeReport: finalizeReport, // custom structured output tool
    },
    stopWhen: or(toolCallIs("FinalizeReport"), stepCountIs(100)),
    onFinish: () => stop(),           // cleanup
  });

  return result;
}
```

**Key patterns for Sunder:**
1. `shellTools.bash` — destructure just the bash tool, not readFile/writeFile
2. Mix bash-tool's bash with custom tools (`ExecuteSQL`, `FinalizeReport`)
3. `stopWhen` for structured termination
4. `onFinish` for sandbox cleanup (Sunder should use `finally` block instead for reliability)

### Key Files to Reference

| File | What to copy/reference |
|---|---|
| `src/lib/tools/sandbox.ts` | **Copy pattern.** Minimal sandbox creation with `{ sandbox, stop }` return shape. |
| `src/lib/tools/shell.ts` | **Reference.** `createBashTool` with `uploadDirectory`. Sunder uses `files` instead. |
| `src/lib/agent.ts` | **Copy pattern.** How to wire bash tool into `streamText()` alongside custom tools. Mix of bash-tool + custom tools in the same `tools` object. Cleanup in `onFinish`. |

---

## 5. Pattern Comparison: Where Sunder Drifts

### Drift 1: File source — Local filesystem vs Supabase Storage

| Reference repos | Sunder |
|---|---|
| `generateFilesForSandbox()` reads from local disk / mock data | Downloads from Supabase Storage |
| `uploadDirectory: { source: "./src/semantic" }` | Not applicable — files aren't on Vercel Function disk |
| Skills on local filesystem (`createSkillTool({ skillsDirectory })`) | Skills in Supabase Storage (`discover-skills.ts`) |

**Reason for drift:** Sunder is multi-tenant SaaS. Per-client files live in Supabase Storage, not on the server filesystem. The reference repos are single-tenant demos with data baked in.

**What to do:** Build a `buildSandboxFiles()` function (equivalent to `generateFilesForSandbox()`) that downloads from Supabase Storage instead of reading from disk. Output the same `Record<string, string>` shape. The rest of the pipeline (passing to `createBashTool`) is identical.

### Drift 2: Skill loading — `createSkillTool` vs Sunder's existing system

| Reference repos | Sunder |
|---|---|
| `experimental_createSkillTool({ skillsDirectory })` | `discover-skills.ts` + `read_file` tool |
| Separate `skill` tool for progressive disclosure | System prompt catalog + `read_file` on demand |
| Skills output as `files` Record for `createBashTool` | Build `files` Record manually from Supabase downloads |

**Reason for drift:** `createSkillTool` reads from the local filesystem. Sunder's skills are in Supabase Storage. Sunder's progressive disclosure already works through the system prompt skill catalog + `read_file` tool. Adding a separate `skill` tool is redundant.

**What to do:** No drift in behavior — just different plumbing for the same pattern. Build skill files into the `files` Record manually (~10 lines). Keep existing `discover-skills.ts` for progressive disclosure.

### Drift 3: Agent loop — ToolLoopAgent vs streamText

| call-summary-agent | oss-data-analyst | Sunder |
|---|---|---|
| `ToolLoopAgent` with `prepareCall` | `streamText()` with tools | `streamText()` with `maxSteps` |
| Sandbox created in `prepareCall` | Sandbox created before `streamText` | Sandbox created lazily on first bash call |

**Reason for drift:** Sunder's runner already uses `streamText()` with `maxSteps`. Switching to `ToolLoopAgent` would mean rewriting the runner. The lazy sandbox creation is actually better — no sandbox created if the agent never calls `bash`.

**What to do:** Follow oss-data-analyst's pattern — create sandbox before `streamText`, wire bash tool into the `tools` object, cleanup in `finally` block. The lazy creation optimization can be added later if needed.

### Drift 4: Sandbox cleanup — onFinish vs finally

| oss-data-analyst | Sunder |
|---|---|
| `onFinish: () => stop()` | `finally` block after `streamText` |

**Reason for drift:** `onFinish` doesn't run if the stream errors or the function crashes. A `finally` block is more reliable.

**What to do:** Use `finally` block. This is strictly better.

### Drift 5: Additional tools alongside bash

| call-summary-agent | oss-data-analyst | Sunder |
|---|---|---|
| bash only | bash + ExecuteSQL + FinalizeReport | bash + all existing tools (CRM, storage, web, etc.) |

**No drift needed.** The oss-data-analyst shows how to mix bash-tool's `bash` with custom tools in the same `tools` object. Sunder does the same — the bash tool sits alongside 30+ existing tools.

### Drift 6: `context.json` — conversation data into sandbox

| Reference repos | Sunder |
|---|---|
| All context pre-loaded as files (transcripts, metadata) | Structured tool results serialized to `context.json` |

**Reason for drift:** Reference repos have static input data (a transcript, YAML files). Sunder's input data comes from dynamic tool calls (CRM searches, market data queries) that happen during the same agent run, before the sandbox is created. This data needs to be serialized and passed in.

**What to do:** Add `"input/context.json": JSON.stringify(gatheredData)` to the `files` Record. This is a Sunder-specific addition. The pattern is the same (data goes into `files` Record), just the source differs.

### Summary: Zero drift on architecture, minimal drift on plumbing

| Layer | Drift? | What |
|---|---|---|
| **bash-tool as dependency** | None | Use `createBashTool` exactly as reference repos do |
| **Sandbox creation** | None | `Sandbox.create()` from `@vercel/sandbox` |
| **File pre-loading** | Plumbing only | Download from Supabase instead of local disk, same `files` Record output |
| **Tool wiring** | None | Pass `bash` tool into `streamText({ tools })` alongside custom tools |
| **Hooks** | None | `onBeforeBashCall`/`onAfterBashCall` for Langfuse logging |
| **Cleanup** | Better | `finally` block instead of `onFinish` |
| **Skill system** | Plumbing only | Existing Sunder discovery + manual `files` Record instead of `createSkillTool` |
| **`context.json`** | Sunder addition | Serialize dynamic tool results for sandbox scripts |

---

## 6. Implementation Checklist — Files to Touch

### New files to create

| File | Based on | What it does |
|---|---|---|
| `src/lib/sandbox/vercel-sandbox-client.ts` | `oss-data-analyst/src/lib/tools/sandbox.ts` | Create Vercel Sandbox from golden snapshot, return `{ sandbox, stop }` |
| `src/lib/sandbox/sandbox-files.ts` | `call-summary-agent/lib/sandbox-context.ts` | Build `files` Record from Supabase Storage (skills, attachments, context.json) |
| `src/lib/sandbox/create-bash-tools.ts` | `call-summary-agent/lib/tools.ts` | Wrap `createBashTool` with Langfuse logging hooks |

### Files to modify

| File | Change | Reference |
|---|---|---|
| `src/lib/runner/tool-registry.ts` | Register `bash` tool from bash-tool instead of `execute_in_sandbox` | `oss-data-analyst/src/lib/agent.ts` (tool wiring) |
| `src/lib/runner/run-agent.ts` | Create sandbox before `streamText`, cleanup in `finally` | `oss-data-analyst/src/lib/agent.ts` |
| `src/lib/ai/system-prompt.ts` | Replace `SANDBOX_PROMPT` with new `<sandbox>` block | Design doc v2 Section 9 |
| `src/lib/sandbox/env.ts` | Replace `SPRITES_TOKEN` with `VERCEL_TOKEN` + `SANDBOX_GOLDEN_SNAPSHOT_ID` | — |
| `src/lib/sandbox/types.ts` | Strip to minimal types | `bash-tool/src/types.ts` |
| `src/lib/sandbox/sandbox-paths.ts` | Update base path to `/workspace` | — |
| `package.json` | Add `bash-tool` + `@vercel/sandbox`, remove `@fly/sprites` | — |

### Files to delete

All Sprites-specific files (see design doc v2 Section 10).

### Files to test against

| Reference file | Test pattern |
|---|---|
| `bash-tool/src/tools/bash.ts` | Verify truncation behavior matches (middle-cut at maxOutputLength) |
| `bash-tool/src/sandbox/vercel.ts` | Verify Vercel Sandbox wrapper works (executeCommand → runCommand translation) |
| `call-summary-agent/lib/tools.ts` | Verify hooks fire correctly (onBefore/onAfter) |

---

## 7. Code to Copy Verbatim

### From call-summary-agent: Tool creation pattern

**Source:** `call-summary-agent/lib/tools.ts`
**Target:** `src/lib/sandbox/create-bash-tools.ts`

Copy the `createAgentTools` function structure. Adapt:
- Import paths
- Log function signature (use Langfuse instead of StreamLogEntry)
- File upload logging

### From oss-data-analyst: Sandbox creation pattern

**Source:** `oss-data-analyst/src/lib/tools/sandbox.ts`
**Target:** `src/lib/sandbox/vercel-sandbox-client.ts`

Copy the `createSandbox()` → `{ sandbox, stop }` pattern. Adapt:
- Add `source: { type: "snapshot", snapshotId: GOLDEN_SNAPSHOT_ID }` for golden snapshot
- Adjust `timeout` and `vcpus` to Sunder's needs

### From oss-data-analyst: Tool wiring pattern

**Source:** `oss-data-analyst/src/lib/agent.ts` (the `tools: { bash: shellTools.bash, ...customTools }` pattern)
**Target:** `src/lib/runner/tool-registry.ts`

Copy the pattern of destructuring `shellTools.bash` and mixing with custom tools in the same tools object.

---

## 8. What NOT to Copy

| What | Why |
|---|---|
| `ToolLoopAgent` from call-summary-agent | Sunder uses `streamText` with `maxSteps` — different agent loop |
| `"use workflow"` / `"use step"` directives | Sunder doesn't use Vercel Workflows |
| `experimental_createSkillTool` | Reads from local filesystem — Sunder's skills are in Supabase |
| `readFile` / `writeFile` tools | Sunder already has `read_file` / `write_file` for Supabase Storage |
| SSE streaming pattern from call-summary-agent | Sunder uses AI SDK's built-in streaming |
| `ExecuteSQL` / `FinalizeReport` from oss-data-analyst | Domain-specific tools — Sunder has its own (`search_crm`, `run_sql`, etc.) |
| Gong client / mock data | Domain-specific — not relevant |
| Semantic YAML layer | Domain-specific — Sunder uses skills + CRM instead |
| `just-bash` as default sandbox | Sunder always uses Vercel Sandbox (full VM) |
| AI Elements component library from oss-data-analyst | Nice UI kit but separate concern — evaluate independently |
