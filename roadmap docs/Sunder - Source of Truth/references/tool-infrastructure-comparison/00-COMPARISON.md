# Tool Infrastructure Comparison: Dorabot vs OpenClaw vs Nanobot

## Quick Reference

| Dimension | Dorabot | OpenClaw | Nanobot |
|-----------|---------|----------|---------|
| **Language** | TypeScript (Node.js) | TypeScript (Node.js) | Python |
| **LLM SDK** | `@anthropic-ai/claude-agent-sdk` | `@mariozechner/pi-agent-core` + `pi-coding-agent` | LiteLLM (20+ providers) |
| **Tool Protocol** | MCP (Model Context Protocol) | Custom adapter → pi-agent-core | OpenAI function-calling format |
| **Schema Validation** | Zod | JSON Schema (manual) + TypeBox | JSON Schema (hand-rolled validator) |
| **Tool Count** | 12 custom tools | 20+ tools (core + openclaw + plugins) | 11 built-in tools |
| **LOC (tool system)** | ~800 | ~3,000+ | ~500 |
| **Architecture** | SDK-managed loop + MCP server | Plugin system + policy pipeline | Hand-rolled agent loop |

---

## 1. Tool Definition Schema

### Dorabot — `tool()` from Claude Agent SDK + Zod

```typescript
// Uses the SDK's tool() helper with Zod schemas
export const messageTool = tool(
  'message',           // name
  'Send messages...',  // description
  {                    // Zod schema (auto-generates JSON Schema)
    action: z.enum(['send', 'edit', 'delete']),
    channel: z.string().describe('Channel name'),
    target: z.string().optional().describe('Recipient'),
  },
  async (args) => {    // implementation
    return { content: [{ type: 'text', text: '...' }] };
  }
);
```

**Characteristics:**
- Tool name, description, schema, and implementation are co-located in a single `tool()` call
- Zod handles both validation and JSON Schema generation
- `.describe()` on each field provides inline docs to the LLM
- Return type: `{ content: ContentBlock[], isError?: boolean }`

### OpenClaw — `AgentTool` interface from pi-agent-core

```typescript
// Implements the AgentTool interface
const tool: AgentTool<MyParams, unknown> = {
  name: 'exec',
  label: 'Execute Command',
  description: 'Run a shell command...',
  parameters: {        // raw JSON Schema object
    type: 'object',
    properties: {
      command: { type: 'string', description: '...' },
    },
    required: ['command'],
  },
  execute: async (toolCallId, params, signal, onUpdate) => {
    return { content: [{ type: 'text', text: '...' }] };
  },
};
```

**Characteristics:**
- Raw JSON Schema for parameters (no Zod, no auto-generation)
- Has `label` field (display name distinct from tool name)
- Execute signature includes `toolCallId`, `signal` (abort), and `onUpdate` callback
- Return type: `AgentToolResult<unknown>` with `content` and optional `details`
- Separate `ToolInputError` class for input validation
- Helper functions: `readStringParam()`, `jsonResult()`, `textResult()`, `imageResultFromFile()`

### Nanobot — Abstract `Tool` class (Python ABC)

```python
class Tool(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def description(self) -> str: ...

    @property
    @abstractmethod
    def parameters(self) -> dict: ...  # JSON Schema dict

    @abstractmethod
    async def execute(self, **kwargs) -> str: ...

    def to_schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    def validate_params(self, params: dict) -> None:
        # Hand-rolled JSON Schema validation (type checking, required, enum, min/max)
```

**Characteristics:**
- Classical OOP — each tool is a class inheriting from `Tool`
- Hand-rolled JSON Schema validation (no external library)
- `to_schema()` outputs OpenAI function-calling format
- Execute always returns a string (not structured content blocks)
- No abort signal, no update callback, no tool call ID

### Verdict

| Aspect | Dorabot | OpenClaw | Nanobot |
|--------|---------|----------|---------|
| Schema authoring DX | Best (Zod + describe) | Manual JSON Schema | Manual dict |
| Type safety | Full (Zod infers TS types) | Partial (generic interface) | None (Python dicts) |
| Return type richness | Multi-modal (text, image) | Multi-modal (text, image, details) | String only |
| Execution signature | `(args)` | `(toolCallId, params, signal, onUpdate)` | `(**kwargs)` |
| Complexity | Low | High | Low |

---

## 2. Tool Registration

### Dorabot — Flat Array → MCP Server

```typescript
// src/tools/index.ts
const customTools = [
  messageTool,
  screenshotTool,
  browserTool,
  ...calendarTools,
  ...goalsTools,
  ...tasksTools,
  ...researchTools,
  ...memoryTools,
];

export function createAgentMcpServer() {
  return createSdkMcpServer({
    name: 'dorabot-tools',
    version: '1.0.0',
    tools: customTools,
  });
}
```

Then merged with external MCP servers:
```typescript
const allMcpServers = { 'dorabot-tools': mcpServer };
if (config.mcpServers) {
  for (const [name, entry] of Object.entries(config.mcpServers)) {
    allMcpServers[name] = entry;
  }
}
```

**Pattern:** Static import → flat array → in-process MCP server → merged with config-defined external servers.

### OpenClaw — Plugin System + Factory Functions + Policy Pipeline

```typescript
// Core tools come from pi-coding-agent (exec, read, write, edit, etc.)
const base = codingTools.flatMap((tool) => { /* filter/customize */ });

// OpenClaw tools created via factory functions
const openclawTools = createOpenClawTools({
  sandboxBrowserBridgeUrl, agentSessionKey, config, ...
});

// Plugin tools discovered and loaded at runtime
const pluginTools = resolvePluginTools({
  context, existingToolNames, toolAllowlist,
});

// Merge all, then apply policy pipeline
let tools = [...base, ...openclawTools, ...pluginTools];
tools = applyOwnerOnlyToolPolicy(tools, senderIsOwner);
tools = applyToolPolicyPipeline({ tools, steps: [
  profilePolicy, globalPolicy, providerPolicy,
  agentPolicy, groupPolicy, sandboxPolicy, subagentPolicy,
]});
tools = tools.map(t => normalizeToolParameters(t, { modelProvider }));
tools = tools.map(t => wrapToolWithBeforeToolCallHook(t, { loopDetection }));
tools = tools.map(t => wrapToolWithAbortSignal(t, abortSignal));
```

**Pattern:** 3-source registration (core + openclaw + plugins) → owner auth → 7-layer policy pipeline → schema normalization → hook wrapping → abort wrapping.

### Nanobot — Registry Dict + Default Registration

```python
class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool):
        self._tools[tool.name] = tool

    def get_definitions(self) -> list[dict]:
        return [tool.to_schema() for tool in self._tools.values()]

# In AgentLoop.__init__:
def _register_default_tools(self):
    self.tools.register(ReadFileTool())
    self.tools.register(WriteFileTool())
    self.tools.register(EditFileTool())
    self.tools.register(ListDirTool())
    self.tools.register(ExecTool(self.config))
    self.tools.register(WebSearchTool(self.config))
    self.tools.register(WebFetchTool())
    self.tools.register(MessageTool())
    self.tools.register(SpawnTool())
    self.tools.register(CronTool())
    # MCP tools added dynamically later
```

**Pattern:** Dict-based registry → explicit registration in constructor → MCP tools added lazily at runtime.

### Verdict

| Aspect | Dorabot | OpenClaw | Nanobot |
|--------|---------|----------|---------|
| Discovery | Static imports | Plugin discovery (jiti) | Explicit registration |
| External tools | MCP servers (config) | MCP + plugins + npm packages | MCP servers (config) |
| Filtering | None (pass all) | 7-layer policy pipeline | None |
| Runtime add/remove | No | Yes (plugin lifecycle) | Yes (register/unregister) |
| Complexity | Simple | Very complex | Simple |

---

## 3. Tool Execution / Agent Loop

### Dorabot — SDK-Managed Loop

Dorabot delegates the entire tool loop to the Claude Agent SDK:

```typescript
const q = query({
  prompt: messageGenerator(),
  options: {
    model, systemPrompt,
    tools: { type: 'preset', preset: 'claude_code' },
    mcpServers: allMcpServers,  // tools served via MCP
    hooks, permissionMode, sandbox,
  },
});

for await (const msg of q) {
  // Just observe — SDK handles tool dispatch internally
  if (b.type === 'tool_use') {
    toolsUsed.push(b.name);
  }
}
```

**The SDK handles:** tool selection → parameter extraction → validation → dispatch via MCP → result injection → next LLM call. Dorabot just observes.

### OpenClaw — pi-coding-agent Managed Loop + Heavy Wrapping

OpenClaw uses `pi-coding-agent` for the core loop but wraps every tool with middleware:

```
Tool → wrapToolWithBeforeToolCallHook → wrapToolWithAbortSignal → toToolDefinitions
                    ↓
        pi-coding-agent runs the agentic loop
                    ↓
        For each tool call:
          1. beforeToolCallHook (loop detection, param adjustment, plugin hooks)
          2. tool.execute(toolCallId, params, signal, onUpdate)
          3. afterToolCallHook (auditing, side effects)
          4. Error handling → jsonResult({ status: "error", ... })
```

### Nanobot — Hand-Rolled While Loop

```python
async def _run_agent_loop(self):
    while True:
        response = await self.provider.chat(
            messages=self.context.build_messages(self.current_message),
            tools=self.tools.get_definitions(),
            tool_choice="auto",
        )

        if not response.tool_calls:
            break  # LLM is done, no more tool calls

        # Add assistant message with tool calls to history
        self.context.add_assistant_message(response.content, response.tool_calls)

        # Execute each tool call sequentially
        for tc in response.tool_calls:
            params = json.loads(tc.function.arguments)
            self.tools.get(tc.function.name).validate_params(params)
            result = await self.tools.execute(tc.function.name, **params)
            self.context.add_tool_result(tc.id, tc.function.name, result)

        # Inject reflection prompt
        self.context.add_user_message("Reflect on the results and decide next steps.")
```

**Key difference:** Nanobot injects a reflection prompt after every tool execution round, forcing the LLM to reason about results before making more tool calls.

### Verdict

| Aspect | Dorabot | OpenClaw | Nanobot |
|--------|---------|----------|---------|
| Loop ownership | SDK (black box) | Library (pi-coding-agent) | Hand-rolled |
| Middleware | Hooks (PreToolUse/PostToolUse) | Before/after hooks + wrapping layers | None |
| Loop detection | None built-in | Yes (3 detectors, configurable thresholds) | None |
| Parallel tool calls | SDK handles | Library handles | Sequential only |
| Reflection prompts | No | No | Yes (after every round) |
| Abort support | Via SDK | Per-tool AbortSignal wrapping | None |

---

## 4. Tool Result Handling

### Dorabot
```typescript
// Success
return { content: [{ type: 'text', text: 'Message sent. ID: abc123' }] };
// Error
return { content: [{ type: 'text', text: 'Error: target required' }], isError: true };
// Multi-modal
return { content: [
  { type: 'text', text: '/path/to/screenshot.png' },
  { type: 'image', data: base64, mimeType: 'image/png' },
]};
```

### OpenClaw
```typescript
// Helpers
jsonResult({ status: 'ok', data: {...} })  // → { content: [{ type: 'text', text: JSON.stringify(...) }] }
textResult('Done')                          // → { content: [{ type: 'text', text: 'Done' }] }
imageResultFromFile('/path/to/image.png')   // → { content: [{ type: 'image', source: { type: 'base64', ... } }] }

// Error (standardized)
jsonResult({ status: 'error', tool: 'exec', error: 'Command failed' })

// Rich result with details (for after_tool_call hooks)
return { content: [...], details: { exitCode: 0, stdout: '...' } };
```

### Nanobot
```python
# Always returns a string
return "File written successfully"
return f"Error: {str(e)}"
return json.dumps({"results": [...]})  # JSON as string
```

### Verdict

| Aspect | Dorabot | OpenClaw | Nanobot |
|--------|---------|----------|---------|
| Return format | Content blocks (MCP) | Content blocks (Anthropic) | Plain string |
| Error signaling | `isError: true` flag | `{ status: 'error' }` in JSON | Error text in string |
| Multi-modal | Yes (image blocks) | Yes (image blocks) | No |
| Structured metadata | No (just content) | Yes (`details` field) | No |

---

## 5. Error Handling

### Dorabot — Try/Catch + isError Flag

```typescript
try {
  // tool logic
} catch (err: any) {
  return {
    content: [{ type: 'text', text: `Error: ${err.message}` }],
    isError: true,
  };
}
```

Plus external validation via:
- **Tool policy tiers** (`auto-allow`, `notify`, `require-approval`)
- **Bash hooks** (regex deny patterns for dangerous commands)
- **Path allowlisting** (always-denied paths like `~/.ssh`, `~/.aws`)

### OpenClaw — Multi-Layer Error Handling

1. **Input validation**: `ToolInputError` class + `readStringParam()` helpers
2. **Hook errors**: Caught and logged, never crash tool execution
3. **Tool execution errors**: Caught → `describeToolExecutionError()` → `jsonResult({ status: 'error' })`
4. **Loop detection**: 3 detectors (generic repeat, known poll, ping-pong) with warning/critical thresholds
5. **Abort handling**: `AbortError` re-thrown (not caught)
6. **After-hook errors**: Always caught, logged as debug

```typescript
// Loop detection config
{
  enabled: true,
  historySize: 30,
  warningThreshold: 10,
  criticalThreshold: 20,
  globalCircuitBreakerThreshold: 30,
  detectors: { genericRepeat: true, knownPollNoProgress: true, pingPong: true },
}
```

### Nanobot — Guards + Try/Catch + json_repair

1. **Shell command guards**: Deny patterns (rm -rf, dd, shutdown, fork bomb) + workspace restriction
2. **Parameter validation**: Hand-rolled JSON Schema validator
3. **Global catch**: `ToolRegistry.execute()` wraps all execution in try/catch
4. **LLM output repair**: `json_repair` library to fix malformed tool call JSON from LLMs

```python
# Shell deny patterns
DENY_PATTERNS = [
    r'rm\s+-rf\s+/', r'dd\s+if=', r'shutdown', r'reboot',
    r':\(\)\{.*\}', r'mkfs\.', r'chmod\s+-R\s+777\s+/',
]
```

### Verdict

| Aspect | Dorabot | OpenClaw | Nanobot |
|--------|---------|----------|---------|
| Input validation | Zod (automatic) | ToolInputError class | Hand-rolled JSON Schema |
| Loop detection | None | 3 detectors + thresholds | None |
| Shell guards | Hook-based regex | Allowlist + deny + ask mode | Deny patterns + workspace |
| Error recovery | isError flag | Structured JSON error | String error |
| LLM output repair | SDK handles | Not needed (SDK handles) | json_repair library |

---

## 6. Unique Patterns Worth Noting

### Dorabot

1. **Channel Handler Registry** — Tools delegate to registered channel handlers (`Map<string, ChannelHandler>`), so the `message` tool works across WhatsApp/Telegram/Discord/Slack without modification
2. **Sub-Action Enum Pattern** — Browser tool has 37 sub-actions via `z.enum([...])`, keeping tool count low while maintaining rich functionality
3. **SDK-Managed Everything** — Dorabot trusts the Claude SDK for the loop, tool dispatch, MCP communication. Minimal custom infrastructure
4. **Skills as System Prompt Injection** — Skills are not tools; they're markdown files injected into the system prompt text

### OpenClaw

1. **7-Layer Policy Pipeline** — Profile → Global → Provider → Agent → Group → Sandbox → Subagent. Each layer can only restrict, never expand
2. **Provider-Aware Schema Normalization** — Automatically adapts JSON Schema for Gemini (removes unsupported keywords), OpenAI (forces `type: object`), Anthropic (full compliance)
3. **Tool Loop Detection** — 3 specialized detectors (generic repeat, known poll patterns, ping-pong alternation) with configurable warning/critical thresholds
4. **Plugin System** — Full lifecycle: register tool → register hook → register HTTP handler → register channel → register CLI command
5. **Tool Call ID Sanitization** — Handles provider quirks (Mistral requires exactly 9 alphanumeric chars)
6. **Owner-Only Policy** — Some tools restricted to owner-initiated sessions vs. third-party callers
7. **Before/After Hook Middleware** — Wrapping pattern that preserves original tool identity while adding cross-cutting concerns

### Nanobot

1. **Reflection Prompt Injection** — Adds "Reflect on the results and decide next steps." after every tool round, forcing deliberate reasoning
2. **Stateful Tools via `set_context()`** — Tools like `MessageTool`, `SpawnTool`, `CronTool` receive runtime context (channel info, agent ref) after construction
3. **Subagent Tool Isolation** — Spawned subagents get reduced tool sets (no message/spawn/cron/MCP) to prevent recursion bombs
4. **Progressive Skill Loading** — Always-loaded skills (full content in prompt) vs. available skills (summary only, read on demand)
5. **Multi-Provider via LiteLLM** — Single tool schema format works across 20+ LLM providers without normalization
6. **json_repair** — Gracefully handles malformed JSON in LLM tool call responses

---

## 7. Architecture Diagrams

### Dorabot (SDK-Delegated)

```
User → Agent → Claude SDK query()
                    ↓
        ┌───────────────────────┐
        │  SDK Internal Loop    │
        │  ├─ LLM call          │
        │  ├─ Tool dispatch     │←─── MCP Server (dorabot-tools)
        │  │   via MCP protocol │←─── External MCP Servers
        │  ├─ Result injection  │
        │  └─ Next LLM call     │
        └───────────────────────┘
                    ↓
        Yields messages to caller (observe only)
```

### OpenClaw (Wrapped Library)

```
User → Agent → pi-coding-agent loop
                    ↓
        ┌──────────────────────────────────────┐
        │  For each tool call:                 │
        │  1. beforeToolCallHook               │
        │     ├─ Loop detection                │
        │     ├─ Plugin hooks                  │
        │     └─ Param adjustment              │
        │  2. tool.execute(id, params, signal)  │
        │  3. afterToolCallHook                │
        │     ├─ Auditing                      │
        │     └─ Side effects                  │
        │  4. Error → jsonResult({ error })    │
        └──────────────────────────────────────┘
                    ↓
        Tools come from: core + openclaw + plugins
        Filtered by: 7-layer policy pipeline
        Normalized for: provider-specific schema quirks
```

### Nanobot (Hand-Rolled)

```
User → AgentLoop._run_agent_loop()
                    ↓
        ┌──────────────────────────────┐
        │  while True:                 │
        │    response = provider.chat( │
        │      messages, tools,        │
        │      tool_choice="auto"      │
        │    )                         │
        │    if no tool_calls: break   │
        │    for tc in tool_calls:     │
        │      validate_params(tc)     │
        │      result = execute(tc)    │
        │      add_tool_result(tc)     │
        │    inject reflection prompt  │
        └──────────────────────────────┘
                    ↓
        Tools from: ToolRegistry (dict)
        Schemas as: OpenAI function-calling format
        Via: LiteLLM (provider-agnostic)
```

---

## 8. Implications for Sunder Architecture

### What to adopt from each

**From Dorabot:**
- MCP server pattern for custom tools is clean and standard
- Channel handler registry pattern for multi-channel support
- Sub-action enum pattern to keep tool count manageable
- SDK-managed loop reduces custom code significantly

**From OpenClaw:**
- Tool policy pipeline concept (but simpler — maybe 3 layers not 7)
- Loop detection is genuinely useful for production agents
- Provider-aware schema normalization if supporting multiple LLMs
- Plugin system (but only if extensibility is a real requirement)

**From Nanobot:**
- Reflection prompt injection after tool rounds — cheap way to improve reasoning
- Subagent tool isolation to prevent runaway recursion
- `set_context()` pattern for injecting runtime state into tools
- json_repair for resilience against malformed LLM output
- Simple is underrated — 500 LOC for the entire tool system

### Complexity vs. Control Tradeoff

```
Simplicity ◄──────────────────────────────► Control

  Dorabot          Nanobot            OpenClaw
  (~800 LOC)       (~500 LOC)         (~3000+ LOC)
  SDK handles      Hand-rolled        Heavy middleware
  everything       but minimal        full policy engine
```

**Dorabot** = "trust the SDK, add your tools"
**Nanobot** = "build the minimum viable loop yourself"
**OpenClaw** = "enterprise-grade with every edge case covered"
