# Pi-Mono Tool Infrastructure — Comprehensive Analysis

> **Repository:** [github.com/badlogic/pi-mono](https://github.com/badlogic/pi-mono)
> **Language:** TypeScript (96.6%), Node.js monorepo
> **Stars:** 19.1k | **Commits:** 3,040 | **License:** MIT
> **Architecture:** 7-package monorepo — unified LLM API → agent core → coding agent CLI → extensions/skills

---

## 0. Package Overview

| Package | Purpose | Key Dependency Chain |
|---------|---------|---------------------|
| `@mariozechner/pi-ai` | Unified multi-provider LLM streaming API | Standalone |
| `@mariozechner/pi-agent-core` | Agent loop, tool calling, state management | Depends on pi-ai |
| `@mariozechner/pi-coding-agent` | Interactive CLI, sessions, extensions, skills | Depends on pi-agent-core |
| `@mariozechner/pi-mom` | Slack bot integration | Depends on pi-coding-agent |
| `@mariozechner/pi-tui` | Terminal UI with differential rendering | Standalone |
| `@mariozechner/pi-web-ui` | Web components for AI chat interfaces | Standalone |
| `@mariozechner/pi-pods` | vLLM GPU pod management | Standalone |

The tool infrastructure spans three layers: **pi-ai** (LLM abstraction), **pi-agent-core** (tool definitions + agent loop), and **pi-coding-agent** (extensions, skills, session management).

---

## 1. Tool Definition Schema

### AgentTool Interface (pi-agent-core)

**File:** `packages/agent/src/agent-loop.ts`

```typescript
import type { Tool, TSchema } from "@mariozechner/pi-ai";

interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> extends Tool {
  name: string;                    // Unique string identifier
  label: string;                   // Human-readable display name (distinct from tool name)
  description: string;             // LLM-facing description
  parameters: TParameters;         // TypeBox schema (auto-generates JSON Schema)
  execute: (
    toolCallId: string,            // Provider-assigned call ID
    params: Static<TParameters>,   // Validated parameters (typed via TypeBox)
    signal: AbortSignal,           // Abort support per tool call
    onUpdate?: AgentToolUpdateCallback<TDetails>,  // Streaming partial results
  ) => Promise<AgentToolResult<TDetails>>;
}
```

### Tool Result Format

```typescript
interface AgentToolResult<T = any> {
  content: (TextContent | ImageContent)[];  // Multi-modal response blocks
  details?: T;                               // Tool-specific metadata (for UI/logging)
}

// Content block types
type TextContent = { type: "text"; text: string };
type ImageContent = { type: "image"; source: { type: "base64"; media_type: string; data: string } };

// Error handling: throw from execute → caught by loop → formatted as ToolResultMessage with isError: true
```

### Tool Result Message (injected into conversation)

```typescript
interface ToolResultMessage {
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: unknown;
  isError?: boolean;
}
```

### Helper Functions

```typescript
// Provided by pi-agent-core for ergonomic tool results
jsonResult({ status: "ok", data: {...} })        // → { content: [{ type: "text", text: JSON.stringify(...) }] }
textResult("Done")                                // → { content: [{ type: "text", text: "Done" }] }
imageResultFromFile("/path/to/image.png")         // → { content: [{ type: "image", source: { type: "base64", ... } }] }

// Input validation helper
readStringParam(params, "command", { required: true, trim: true })  // Throws ToolInputError on failure

// Standardized error class
class ToolInputError extends Error { readonly status = 400; }
```

### Characteristics

- **TypeBox** for schema validation — generates JSON Schema automatically, provides TypeScript type inference
- **`label`** field — display name distinct from tool name (UI can show "Execute Command" while LLM sees `exec`)
- **Execution signature** is the richest of the 3 compared systems: includes `toolCallId`, `AbortSignal`, and `onUpdate` callback for streaming partial results
- **Multi-modal returns** — text and image content blocks, plus arbitrary `details` for hooks/UI
- **Error convention** — throw from `execute`, loop catches and formats with `isError: true`

---

## 2. Tool Registration

### Three-Source Registration (pi-coding-agent)

```typescript
// 1. Core tools come from pi-coding-agent built-ins
const builtInTools = [readTool, writeTool, editTool, bashTool, /* ... */];

// 2. Extension tools registered via pi.registerTool() at runtime
const extensionTools = extensionRunner.getRegisteredTools();

// 3. Custom tools passed programmatically via SDK
const customTools = sessionConfig.customTools || [];

// Merge all tools
let tools = [...builtInTools, ...extensionTools, ...customTools];

// Wrap with extension hooks (before/after tool call)
tools = wrapRegisteredTools(tools, extensionRunner);
tools = wrapToolsWithExtensions(tools, extensionRunner);
```

### Extension Tool Registration

```typescript
// In an extension file (e.g., ~/.pi/agent/extensions/my-ext.ts)
export default function(pi: ExtensionContext) {
  pi.registerTool({
    name: "my_custom_tool",
    label: "My Custom Tool",
    description: "Does something useful",
    parameters: Type.Object({
      input: Type.String({ description: "The input to process" }),
    }),
    execute: async (toolCallId, params, signal, onUpdate) => {
      return textResult(`Processed: ${params.input}`);
    },
  });
}
```

### Built-in Tool Set

| Tool | Purpose |
|------|---------|
| `read` | Read file contents |
| `write` | Write file contents |
| `edit` | Edit file with diff |
| `bash` / `exec` | Execute shell commands |
| `glob` | File pattern matching |
| `grep` | Content search |
| + extension-registered tools | Dynamic at runtime |

### Pattern

**Static built-ins → extension discovery → SDK custom tools → wrap with extension hooks → pass to agent loop.**

---

## 3. Tool Execution / Agent Loop

### Two-Loop Architecture (pi-agent-core)

**File:** `packages/agent/src/agent-loop.ts`

```
agentLoop(agent, prompts, options)
    ↓
  emit agent_start
    ↓
  runLoop():
    ┌─── OUTER LOOP (follow-up messages) ──────────────────┐
    │  while (hasFollowUpMessages || firstRun):             │
    │    ┌─── INNER LOOP (tool calls + steering) ────────┐ │
    │    │  while (true):                                 │ │
    │    │    streamAssistantResponse() → LLM call        │ │
    │    │    if no tool_calls: break                     │ │
    │    │    executeToolCalls():                         │ │
    │    │      for each toolCall:                        │ │
    │    │        validateToolArguments(tool, params)     │ │
    │    │        emit tool_execution_start               │ │
    │    │        tool.execute(id, params, signal, cb)    │ │
    │    │        emit tool_execution_end                 │ │
    │    │        ── CHECK: getSteeringMessages() ──     │ │
    │    │        if steering arrived: skip remaining     │ │
    │    │    add ToolResultMessages to context           │ │
    │    └────────────────────────────────────────────────┘ │
    │    ── CHECK: getFollowUpMessages() ──                 │
    │    if followUp arrived: add to context, continue      │
    └──────────────────────────────────────────────────────┘
    ↓
  emit agent_end
```

### Key Concepts

**Steering messages** — Interrupt the current tool execution round. After the current tool finishes, remaining tools are skipped and the steering message is injected. This enables real-time user intervention mid-run.

**Follow-up messages** — Delivered only when the agent finishes all pending work. Used for queued messages that arrive during an active run.

### Event Protocol

The loop emits a rich event stream consumed by `AgentSession`:

```typescript
type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; stopReason: "stop" | "length" | "toolUse" }
  | { type: "turn_start" }
  | { type: "turn_end" }
  | { type: "message_start" | "message_update" | "message_end"; message: AssistantMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string }
  | { type: "tool_execution_update"; toolCallId: string; update: unknown }
  | { type: "tool_execution_end"; toolCallId: string; result: ToolResultMessage }
  | { type: "error"; error: Error };
```

---

## 4. Extension Hook System

### Hook Registration

```typescript
// Extensions register hooks via pi.on()
export default function(pi: ExtensionContext) {
  // Observation hooks
  pi.on("agent_start", async (event) => { /* ... */ });
  pi.on("agent_end", async (event) => { /* ... */ });
  pi.on("turn_start", async (event) => { /* ... */ });
  pi.on("turn_end", async (event) => { /* ... */ });

  // Tool lifecycle hooks
  pi.on("tool_execution_start", async (event) => { /* ... */ });
  pi.on("tool_execution_update", async (event) => { /* ... */ });
  pi.on("tool_execution_end", async (event) => { /* ... */ });

  // Transforming hooks
  pi.on("tool_call", async (event) => {
    // Can BLOCK tool execution
    return { cancel: true, reason: "Not allowed" };
  });
  pi.on("tool_result", async (event) => {
    // Can MODIFY tool result before it's sent to LLM
    return { ...event.result, content: [textContent("Modified")] };
  });

  // Pre-agent hook (inject message or modify system prompt)
  pi.on("before_agent_start", async (event) => {
    return { systemPromptAppend: "Additional instructions..." };
  });
}
```

### Session Lifecycle Hooks (can veto operations)

```typescript
pi.on("session_before_switch", async (event) => {
  return { cancel: true };  // Prevent session switch
});
pi.on("session_before_compact", async (event) => { /* ... */ });
pi.on("session_before_fork", async (event) => { /* ... */ });
pi.on("session_before_tree", async (event) => { /* ... */ });
```

### Hook Dispatch Order

1. Internal handler dequeues steering/follow-up messages
2. Extension events emitted to `ExtensionRunner`
3. External listeners notified
4. Messages persisted to `SessionManager`
5. Retry and compaction checks trigger on `agent_end`

---

## 5. Unified LLM API (pi-ai)

### Provider Architecture

```typescript
// Four entry points in packages/ai/src/stream.ts
stream(model, context, options)         // Provider-native options
complete(model, context, options)       // Provider-native, non-streaming
streamSimple(model, context, options)   // Provider-agnostic unified options
completeSimple(model, context, options) // Provider-agnostic, non-streaming
```

### Supported Providers

| API Identifier | Provider | Function |
|---------------|----------|----------|
| `openai-completions` | OpenAI, Mistral, xAI, Groq, Cerebras, OpenRouter | `streamOpenAICompletions()` |
| `openai-responses` | OpenAI Responses API | `streamOpenAIResponses()` |
| `anthropic-messages` | Anthropic Claude | `streamAnthropic()` |
| `google-generative-ai` | Google Gemini | `streamGoogle()` |
| `bedrock-converse-stream` | AWS Bedrock | `streamBedrock()` |

### Model Catalog

Auto-generated constant `MODELS` in `packages/ai/src/models.generated.ts`. Every model that supports tool calling is included.

```typescript
interface Model<TApi> {
  id: string;
  name: string;
  provider: string;        // e.g., "anthropic"
  api: TApi;               // Routing key: e.g., "anthropic-messages"
  baseUrl: string;         // API endpoint (supports proxies/gateways)
  reasoning: boolean;      // Extended thinking support
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
}
```

### Unified Reasoning Levels

`streamSimple()` translates a unified `reasoning` parameter to provider-native formats:

| Level | Description |
|-------|-------------|
| `"minimal"` | Minimal reasoning |
| `"low"` | Low reasoning |
| `"medium"` | Medium reasoning |
| `"high"` | High reasoning |
| `"xhigh"` | Maximum reasoning (not all models) |

### Streaming Event Protocol

```typescript
type AssistantMessageEvent =
  | { type: "start" }
  | { type: "text_start" | "text_delta" | "text_end"; text: string }
  | { type: "thinking_start" | "thinking_delta" | "thinking_end"; text: string }
  | { type: "toolcall_start" | "toolcall_delta" | "toolcall_end"; toolCall: ToolCall }
  | { type: "done"; stopReason: "stop" | "length" | "toolUse" }
  | { type: "error"; reason: "error" | "aborted" };
```

### Provider-Specific Handling

- **Message conversion:** Each provider implements `convertMessages()` to transform unified `Context` → wire format
- **Schema normalization:** Adapts tool JSON Schema per provider (Gemini removes unsupported keywords, OpenAI forces `type: object`)
- **Cross-provider handoffs:** Thinking blocks auto-converted to `<thinking>` tagged text when switching providers
- **AbortSignal:** All providers support mid-stream cancellation

---

## 6. Skills System (pi-coding-agent)

### Skill Structure

Skills are directories containing a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: brave-search
description: Search the web using the Brave Search API
disable-model-invocation: false
---

# Brave Search Skill

Instructions for the agent when this skill is loaded...
```

### Progressive Disclosure Pattern

1. **At startup:** Extract name + description from all skills
2. **In system prompt:** Inject `<available_skills>` XML block with names/descriptions only
3. **On demand:** Agent reads full `SKILL.md` via `read` tool when task matches
4. **Via slash command:** User invokes `/skill:brave-search [args]` directly

This keeps the system prompt lean while making the full skill available when needed.

### Skill Discovery (Priority Order)

1. Global: `~/.pi/agent/skills/`, `~/.agents/skills/`
2. Project: `.pi/skills/`, `.agents/skills/` (cwd + ancestors)
3. Package: `skills/` directories or `pi.skills` in `package.json`
4. Settings: `skills` array in `settings.json`
5. CLI: `--skill <path>`

Name collisions: first one wins, collision diagnostic recorded.

### System Prompt Integration

```typescript
function formatSkillsForPrompt(skills: Skill[]): string {
  // Only included when `read` tool is available (agent must be able to read SKILL.md)
  // Skills with disableModelInvocation: true are excluded
  return `<available_skills>\n${skills.map(s => `- ${s.name}: ${s.description}`).join("\n")}\n</available_skills>`;
}
```

---

## 7. Prompt Templates (pi-coding-agent)

### Definition

Prompt templates are `.md` files that expand into user messages via `/templatename [args]`:

```markdown
---
description: Review a pull request
---
Review PR #$1 with focus on $2. Check for:
- Security issues
- Performance regressions
- Code style violations
```

### Argument Substitution

| Placeholder | Meaning |
|-------------|---------|
| `$1`, `$2`, ... | Positional argument (1-indexed) |
| `$@`, `$ARGUMENTS` | All arguments joined by space |
| `${@:N}` | Args from index N onwards |
| `${@:N:L}` | L args starting at index N |

### Discovery Locations

1. `~/.pi/agent/prompts/` → labeled `(user)`
2. `<cwd>/.pi/prompts/` → labeled `(project)`
3. Explicit `promptPaths` option → labeled `(path:<name>)`

---

## 8. Session Management (pi-coding-agent)

### AgentSession

The central orchestrator class wrapping the low-level `Agent`:

```typescript
class AgentSession {
  // Core operations
  prompt(text: string, options?: PromptOptions): void;
  steer(text: string): void;     // Interrupt current run
  followUp(text: string): void;  // Queue for after current run

  // Model control
  setModel(model: Model): void;

  // Session lifecycle
  newSession(): void;
  switchSession(id: string): void;
  fork(): void;
  navigateTree(direction: "up" | "down"): void;

  // Observation
  subscribe(listener: (event: AgentSessionEvent) => void): void;
}
```

### Session Events (extends AgentEvent)

```typescript
type AgentSessionEvent = AgentEvent
  | { type: "auto_compaction_start" }
  | { type: "auto_compaction_end" }
  | { type: "auto_retry_start" }
  | { type: "auto_retry_end" };
```

### Auto-Compaction

When context nears its limit after `agent_end`, auto-compaction triggers — summarizes history to free context space, then retries the last prompt. This acts as a safety valve against context overflow.

---

## 9. SDK & RPC Mode

### SDK (Same-Process)

```typescript
import { createAgentSession } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({
  cwd: "/path/to/project",
  tools: ["read", "write", "edit", "bash"],
  customTools: [myCustomTool],
  resourceLoader: new DefaultResourceLoader({
    skillsOverride: (current) => ({
      skills: [...current.skills, customSkill],
      diagnostics: current.diagnostics,
    }),
  }),
});

session.subscribe((event) => {
  if (event.type === "message_update") {
    console.log(event.message.content);
  }
});

session.prompt("Refactor the auth module");
```

### RPC Mode (Subprocess, JSON-over-stdio)

Commands sent as JSON to stdin:

```json
{ "type": "prompt", "text": "Fix the bug", "streamingBehavior": "steer" }
{ "type": "steer", "text": "Actually, also add tests" }
{ "type": "follow_up", "text": "Now deploy" }
```

Responses and events streamed as JSON lines to stdout:

```json
{ "type": "response", "success": true }
{ "type": "agent_start" }
{ "type": "message_update", "message": { "content": [...] } }
{ "type": "tool_execution_start", "toolName": "bash", "toolCallId": "tc_123" }
{ "type": "agent_end", "stopReason": "stop" }
```

---

## 10. Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│  User (CLI / SDK / RPC / Slack)                                    │
└───────────────────────┬────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────────────────┐
│  AgentSession (pi-coding-agent)                                    │
│  ├─ Session lifecycle (new, switch, fork, tree navigation)         │
│  ├─ Auto-compaction & auto-retry                                   │
│  ├─ Prompt template expansion                                      │
│  ├─ Skill command expansion                                        │
│  ├─ Steering & follow-up message queues                            │
│  └─ Extension event dispatch                                       │
└───────────────────────┬────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────────────────┐
│  ExtensionRunner (pi-coding-agent)                                 │
│  ├─ Discovers extensions from ~/.pi/agent/extensions/              │
│  ├─ Registers tools via pi.registerTool()                          │
│  ├─ Registers hooks via pi.on(eventType, handler)                  │
│  ├─ Wraps tools: wrapRegisteredTools() + wrapToolsWithExtensions() │
│  └─ Dispatches events: tool_call (can block), tool_result (can     │
│     modify), before_agent_start (can inject prompt), session_*     │
│     (can veto)                                                     │
└───────────────────────┬────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────────────────┐
│  agentLoop() (pi-agent-core)                                       │
│  ├─ Outer loop: follow-up message delivery                         │
│  ├─ Inner loop: LLM call → tool dispatch → result injection        │
│  ├─ executeToolCalls():                                            │
│  │   ├─ validateToolArguments() (TypeBox)                          │
│  │   ├─ tool.execute(id, params, signal, onUpdate)                 │
│  │   ├─ emit tool_execution_start / update / end                   │
│  │   └─ CHECK getSteeringMessages() → skip remaining if interrupt  │
│  └─ Emits AgentEvent stream                                        │
└───────────────────────┬────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────────────────┐
│  stream() / streamSimple() (pi-ai)                                 │
│  ├─ Routes by model.api → provider implementation                  │
│  ├─ convertMessages() → provider-specific wire format              │
│  ├─ Provider-aware JSON Schema normalization                       │
│  ├─ Streaming: AssistantMessageEventStream                         │
│  └─ Supports: OpenAI, Anthropic, Google, Bedrock, OpenRouter, etc. │
└────────────────────────────────────────────────────────────────────┘
```

---

## 11. Unique Patterns Worth Noting

1. **Two-Loop Architecture (Steering + Follow-up)** — The outer/inner loop design allows real-time user interruption mid-tool-execution without killing the entire run. Steering messages skip remaining tools; follow-up messages queue for after completion.

2. **Progressive Skill Disclosure** — Only skill names/descriptions in the system prompt. Full `SKILL.md` loaded on-demand via `read` tool. Keeps base context lean while making dozens of skills "available."

3. **TypeBox over Zod** — Uses TypeBox for tool parameter schemas, which provides both JSON Schema generation and TypeScript type inference like Zod, but is designed for JSON Schema compatibility from the ground up.

4. **Extension Hook Power** — `tool_call` hooks can block execution; `tool_result` hooks can modify results before they reach the LLM. `before_agent_start` can inject system prompt content. This is a middleware system with both observation and mutation capabilities.

5. **Three Interaction Modes from One Session** — `AgentSession` is shared across Interactive (TUI), Print (headless), and RPC (JSON-over-stdio) modes. Each mode only differs in its `ExtensionUIContext` implementation.

6. **Auto-Compaction Safety Valve** — When context nears its limit, automatically summarizes history and retries. Prevents context overflow from killing long-running agent sessions.

7. **Unified Reasoning Levels** — `streamSimple()` translates `reasoning: "high"` into provider-specific formats (Anthropic `thinkingBudgetTokens`, Google `thinking.budgetTokens`, OpenAI `reasoningEffort`). Single API surface for extended thinking across all providers.

8. **Model Catalog with Cost Tracking** — Every model in the registry includes per-million-token pricing. `calculateCost(model, usage)` gives real-time dollar cost estimates.

9. **Cross-Provider Thinking Handoff** — When switching models mid-conversation, thinking blocks from one provider are auto-converted to `<thinking>` tagged text for the next provider. Enables seamless model switching.

10. **Prompt Template Argument Substitution** — Bash-style positional args (`$1`, `$@`, `${@:N:L}`) in `.md` templates. Simple but powerful for reusable prompt patterns.

---

## 12. Comparison with Dorabot / OpenClaw / Nanobot

| Dimension | Pi-Mono | Dorabot | OpenClaw | Nanobot |
|-----------|---------|---------|----------|---------|
| **Language** | TypeScript | TypeScript | TypeScript | Python |
| **LLM SDK** | pi-ai (multi-provider) | Claude Agent SDK | pi-agent-core (same!) | LiteLLM |
| **Tool Protocol** | TypeBox + AgentTool | MCP (Zod) | AgentTool (same!) | OpenAI function-calling |
| **Schema Validation** | TypeBox | Zod | JSON Schema / TypeBox | Hand-rolled |
| **Tool Count** | Built-in ~6 + extensions | 12 custom | 20+ | 11 |
| **LOC (tool system)** | ~2,000 (core + coding-agent) | ~800 | ~3,000+ | ~500 |
| **Architecture** | 2-loop + extensions + hooks | SDK-managed | Plugin + policy pipeline | Hand-rolled while loop |
| **Multi-provider** | Yes (5 APIs) | No (Claude only) | Via pi-ai (same!) | Yes (LiteLLM, 20+) |
| **Extension system** | Full (tools + hooks + UI) | No | Plugins | No |
| **Skills** | Progressive disclosure | System prompt injection | N/A | Progressive loading |
| **Session management** | Full (fork, tree, compact) | SQLite sessions | N/A | N/A |
| **Abort support** | Per-tool AbortSignal | Via SDK | Per-tool wrapping | None |
| **Steering/interrupt** | Yes (mid-run) | No | No | No |
| **Auto-compaction** | Yes | No | No | No |

**Note:** OpenClaw is built on top of pi-agent-core and pi-ai. It adds the policy pipeline, plugin system, and loop detection on top of the pi-mono foundation.

---

## 13. Implications for Sunder Architecture

### What to consider adopting

**From pi-ai:**
- Unified streaming event protocol is clean and well-typed — if Sunder ever needs multi-provider support beyond AI Gateway, this is a proven pattern
- Reasoning level abstraction (`"minimal"` → `"xhigh"`) translates naturally to Sunder's 4-tier model routing

**From pi-agent-core:**
- The two-loop architecture (steering + follow-up) maps directly to Sunder's thread queue problem — messages arriving during active runs could use the same pattern
- TypeBox is a solid alternative to Zod for tool schemas if JSON Schema compatibility matters
- `onUpdate` callback for streaming partial tool results — useful for long-running tools (web search, file operations)

**From pi-coding-agent:**
- Progressive skill disclosure is directly relevant to Sunder's knowledge base / skill system
- Extension hook pattern (`tool_call` blocking, `tool_result` modification) could power Sunder's approval system — external-facing tool calls blocked until approved
- Auto-compaction for long-running agent sessions
- Session forking/tree navigation for conversation branching

### Complexity Assessment

```
Simplicity ◄──────────────────────────────────────────────────────► Control

  Nanobot      Dorabot          Pi-Mono                    OpenClaw
  (~500 LOC)   (~800 LOC)       (~2,000 LOC)               (~3,000+ LOC)
  Hand-rolled  Trust SDK        Layered monorepo           Enterprise middleware
  minimal      observe only     extensible core            full policy engine
```

Pi-Mono sits between Dorabot and OpenClaw: more extensible than "trust the SDK" but less middleware-heavy than "7-layer policy pipeline." The key differentiator is the **layered package architecture** — each layer (pi-ai → pi-agent-core → pi-coding-agent) can be used independently.
