# Triage Guide

How to diagnose LLM QA failures from Langfuse trace data. Read this before Phase 4 (Triage) to calibrate your diagnosis.

## Severity Levels

| Severity | Definition |
|----------|------------|
| **critical** | Agent crashes, no response, data corruption (wrong CRM mutation), or data loss |
| **high** | Agent misses a required tool entirely — core scenario fails |
| **medium** | Agent calls right tools but with wrong arguments, or produces incorrect output |
| **low** | Extra tool calls, suboptimal tool sequence, or slow but correct response |
| **infra** | Rate limit, gateway timeout, auth failure — not an agent bug |
| **cascade** | Failed because a prerequisite sequential scenario failed first |

## Failure Categories

| Category | Signature in analysis JSON | What it means |
|----------|---------------------------|---------------|
| `missing-tool` | `missingTools` array is non-empty, `errors` is empty | Model chose not to call the expected tool |
| `wrong-args` | Tool appears in `foundTools` but produced wrong result | Tool called with incorrect arguments |
| `wrong-tool` | `extraTools` has unexpected tool, `missingTools` has expected | Model used a different tool than expected |
| `tool-error` | Tool observation has `{ success: false }` in output | Tool was called but failed internally |
| `model-error` | `errors` contains model/gateway error text | LLM returned an error |
| `http-error` | `status: "error"`, `httpStatus` >= 400 | Chat API returned non-2xx before streaming |
| `hallucination` | `missingTools` non-empty, no TOOL observations in trace | Model answered directly without using any tool |
| `cascade` | Previous sequential scenario in same surface also failed | Upstream failure caused this |
| `slow` | `latencyMs` > 30000, verdict may be `warn` | Correct but unacceptably slow |
| `extra-tools` | `extraTools` non-empty, `missingTools` empty | Agent called additional tools (usually benign) |

## Diagnosis Decision Tree

For each failure, follow this sequence:

```
1. Check the errors array
   ├── Contains "rate limit" / "429" / "free credits" → INFRA
   ├── Contains "context length" / "token limit"      → MODEL-ERROR
   └── Empty → go to step 2

2. Check if this is a sequential scenario
   └── Previous scenario in same surface also failed → CASCADE
       (link to root cause, do not deep-triage)

3. Fetch trace observations
   Run: langfuse api observations-v2s list --traceId {TRACE_ID} --limit 50 --json

4. Find the GENERATION observations (type=GENERATION)
   ├── statusMessage present → MODEL-ERROR (include the message)
   ├── Zero TOOL observations in entire trace
   │   └── missingTools non-empty → HALLUCINATION
   │       (model answered without calling any tool)
   ├── TOOL observations exist but wrong names
   │   └── WRONG-TOOL
   └── TOOL observations exist with right names → go to step 5

5. Check TOOL observation details
   ├── output contains { success: false } → TOOL-ERROR
   │   (include the error message from output)
   ├── input args look wrong for the scenario → WRONG-ARGS
   │   (describe what's wrong and what was expected)
   └── Everything looks correct
       └── Re-check: maybe the expected tools list is wrong
           (some scenarios have acceptable alternatives)
```

## Reading Langfuse Observations

What each observation type contains in Sunder's Vercel AI SDK + Langfuse setup:

### SPAN: `ai.streamText`
Top-level span wrapping the entire streamText call. Usually has no direct content — it's a container.

### GENERATION: `ai.streamText.doStream`
The actual model generation step. This is where you find:
- **`input`** — the messages array sent to the model (system prompt + conversation)
- **`output`** — the model's response, including any `tool_calls`
- **`model`** — which model was used (e.g., `google/gemini-3-flash`)
- **`statusMessage`** — error text if the generation failed
- **`promptTokens`** / **`completionTokens`** — token usage

### TOOL: `{tool_name}`
A tool execution. The observation name IS the tool name (e.g., `calculate`, `create_contact`).
- **`input`** — the arguments the model passed to the tool
- **`output`** — the tool's return value (typically `{ success: true, ... }` or `{ success: false, error: "..." }`)

### GENERATION: `ai.generateText.doGenerate`
Used for non-streaming calls (compaction, title generation, subagents). Same structure as `doStream`.

### SPAN: `ai.generateText`
Container span for generateText calls.

## Sunder-Specific Patterns

These are common in Sunder's agent and should influence your triage:

**"Search then act" is optional in sequential scenarios.** Many CRM scenarios expect `search_contacts → update_contact`. But if the agent already has the entity ID from a previous turn in the same thread, it may skip the search. This is correct — downgrade to `info`.

**SQL as an alternative to specific tools.** The agent may use `run_sql` instead of `search_contacts` or `search_deals`. If the query is correct and returns the right data, this is an acceptable alternative — mark as `warn` with a note, not `fail`.

**Approval gates pause the run.** When `delete_contact` or other destructive tools fire, an approval card is created and the run stops. The trace will show the tool call was initiated but the final generation may be missing or truncated. This is expected — mark as `pass` if the TOOL observation exists.

**Subagents create child traces.** `run_subagent` spawns a separate execution. The parent trace will have a TOOL observation for `run_subagent` but the actual subagent work is in a different trace under the same session. Check for additional traces with the same sessionId.

**`manage_todo` gets called multiple times.** For "add two todos" prompts, expect 2+ calls to `manage_todo`. Count total calls, not unique tool names.

**`configure_crm` and `describe_crm_schema` may be interchangeable.** The model sometimes reads config before writing it. Extra `describe_crm_schema` calls before `configure_crm` are benign.

**Thread title generation.** The first message in a new thread triggers a separate `ai.generateText` call for auto-titling. This is not part of the agent run — ignore it during triage.
