# DeepWiki Analysis: Composio VercelProvider, Sessions, Meta-tools

> Source: DeepWiki AI analysis of `ComposioHQ/composio`
> Fetched: 2026-03-07

---

## 1. VercelProvider Deep Dive

The `@composio/vercel` package integrates Composio tools with the Vercel AI SDK. The `VercelProvider` class extends `BaseAgenticProvider` and transforms Composio tools into the Vercel AI SDK's tool format, including an `execute` function for automatic tool calling.

### Initialization

```typescript
const composio = new Composio({ provider: new VercelProvider() });
```

### wrapTool Method

The `wrapTool` method is central to the VercelProvider's functionality:

1. Extracts `inputParameters` from the Composio tool
2. If strict mode enabled and inputParams is an object, calls `removeNonRequiredProperties` to clean up the schema
3. Converts JSON schema to Zod schema using `jsonSchemaToZodSchema`
4. Constructs a Vercel AI SDK `tool` object with description, inputSchema, and async execute function

The `execute` function parses input parameters and calls the provided `executeTool` function with the tool's slug and parsed input.

### Usage with streamText

```typescript
const result = await streamText({
  system: "You are a helpful personal assistant. Use Composio tools to take action.",
  model: anthropic("claude-sonnet-4-6"),
  messages,
  stopWhen: stepCountIs(10),
  onStepFinish: (step) => {
    for (const toolCall of step.toolCalls) {
      process.stdout.write(`\n[Using tool: ${toolCall.toolName}]`);
    }
  },
  tools,
});
```

---

## 2. Tool Router / Sessions Pattern

### Overview

The Tool Router (now called "Sessions") provides a mechanism to create isolated environments for users, granting scoped access to toolkits and tools, and managing authentication dynamically. Sessions are immutable — if context changes, create a new session.

### `composio.create()` vs `composio.tools.get()`

| Feature | `composio.create()` (Sessions) | `composio.tools.get()` (Direct) |
|---------|-------------------------------|--------------------------------|
| Tool discovery | Dynamic via meta-tools | Explicit by name/toolkit |
| OAuth management | In-chat via COMPOSIO_MANAGE_CONNECTIONS | Manual via connectedAccounts API |
| Meta-tools | 5 meta-tools included | None |
| Control level | High-level abstraction | Fine-grained control |
| Use case | AI agents with dynamic needs | Known tools, explicit flows |

### When to Use Each

**Use Sessions (`composio.create()`) when:**
- Building AI agents that dynamically discover and use tools
- You want Composio to handle authentication flows (in-chat auth)
- You want meta-tools for context management and parallel execution
- You prefer higher abstraction and less manual management

**Use Direct (`composio.tools.get()`) when:**
- You know exactly which tools you need
- You require full control over tool availability and execution timing
- You prefer to manage authentication flows yourself
- You are not using an AI agent or need backend-only tool execution

---

## 3. The 5 Meta-Tools (Session Mode)

When you create a session, your AI agent gains access to five meta-tools:

### 3.1 `COMPOSIO_SEARCH_TOOLS`
- Discovers relevant tools across 1000+ applications at runtime
- Returns tool schemas, connection statuses, execution plans, and related tools
- Used when agent needs to find which tool to use for a task

### 3.2 `COMPOSIO_MANAGE_CONNECTIONS`
- Handles OAuth and API key authentication for toolkits
- If a tool requires auth and user is not connected, generates a Connect Link (redirect URL)
- Enables "in-chat authentication" — agent asks user to click link, then continues

### 3.3 `COMPOSIO_MULTI_EXECUTE_TOOL`
- Executes up to 20 tools in parallel
- Used for executing application-specific tools discovered via SEARCH_TOOLS
- The primary execution mechanism in session mode

### 3.4 `COMPOSIO_REMOTE_WORKBENCH`
- Provides persistent Python sandbox for running Python code
- Used for bulk operations, complex data transformations, or result analysis

### 3.5 `COMPOSIO_REMOTE_BASH_TOOL`
- Executes bash commands for simpler file operations and data processing
- Utilities like `jq`, `awk`, `sed`, `grep` available

These meta-tools share context through a `session_id`, maintaining state across multiple calls.

---

## 4. Complete Flows

### Session-based Flow

```
1. composio = new Composio({ provider: new VercelProvider() })
2. session = await composio.create('user_123', { toolkits: ['gmail'] })
3. tools = await session.tools()
                  ↓
   [5 meta-tools returned: SEARCH, MANAGE_CONNECTIONS, MULTI_EXECUTE, WORKBENCH, BASH]
                  ↓
4. streamText({ model, tools, messages })
                  ↓
   Agent calls COMPOSIO_SEARCH_TOOLS → finds GMAIL_SEND_EMAIL
                  ↓
   Agent calls COMPOSIO_MANAGE_CONNECTIONS → if no connection, returns redirectUrl
                  ↓
   User authenticates → connection active
                  ↓
   Agent calls COMPOSIO_MULTI_EXECUTE_TOOL → executes GMAIL_SEND_EMAIL
```

### Direct Flow

```
1. composio = new Composio({ provider: new VercelProvider() })
2. Check/create connection first:
   a. connectionRequest = await composio.toolkits.authorize('user_123', 'gmail')
   b. redirectUrl → user authenticates
   c. await connectionRequest.waitForConnection()
3. tools = await composio.tools.get('user_123', { toolkits: ['gmail'] })
4. streamText({ model, tools, messages })
                  ↓
   Agent calls GMAIL_SEND_EMAIL directly (tool has execute function built in)
```

---

## 5. Provider Architecture

### Inheritance Hierarchy

```
BaseProvider (abstract)
├── BaseNonAgenticProvider (schema modifiers only)
│   └── OpenAIProvider (default)
│
└── BaseAgenticProvider (schema + execution modifiers)
    └── VercelProvider
    └── AnthropicProvider
    └── LangChainProvider
    └── etc.
```

### Key Distinction: Agentic vs Non-Agentic

- **Agentic providers** (like VercelProvider): Tools include built-in `execute` functions. The AI SDK handles tool calls automatically.
- **Non-agentic providers** (like OpenAIProvider): Tools only include schemas. You must handle execution manually.

### Tool Execution Flow (Agentic Provider)

```
1. Provider.wrapTool() → creates framework-specific tool object
2. Framework (streamText/generateText) calls tool with params
3. Tool's execute() handler → calls executeTool(slug, input)
4. executeTool() → calls Tools.execute() on Composio API
5. Tools.execute():
   a. Applies beforeExecute modifiers
   b. Calls Composio API with params
   c. Applies afterExecute modifiers
   d. Returns result
```

---

## 6. Schema Conversion

### JSON Schema → Zod Conversion

```typescript
import { jsonSchemaToZodSchema, removeNonRequiredProperties } from '@composio/core';

// Convert Composio JSON schema to Zod schema
const zodSchema = jsonSchemaToZodSchema(jsonSchema);

// Strict mode: remove non-required properties
const filteredSchema = removeNonRequiredProperties(jsonSchema);
const zodSchema = jsonSchemaToZodSchema(filteredSchema);
```

This conversion happens at wrap-time (when tools are loaded), not at runtime.

---

## 7. Tool Types

### Tool Object Structure (from Composio API)

```typescript
interface Tool {
  slug: string;                           // e.g., 'GMAIL_SEND_EMAIL'
  name: string;
  description: string;
  toolkit: { slug: string; name: string };
  inputParameters: Record<string, unknown>; // JSON Schema
  outputParameters: Record<string, unknown>;
  availableVersions: string[];
  version: string;
  isNoAuth: boolean;
  isDeprecated: boolean;
}
```

### ToolExecuteParams

```typescript
interface ToolExecuteParams {
  userId: string;
  connectedAccountId?: string;
  version?: string;
  arguments: Record<string, unknown>;
  customAuthParams?: Record<string, string>;
  allowTracing?: boolean;
  dangerouslySkipVersionCheck?: boolean;
}
```

### ToolExecuteResponse

```typescript
interface ToolExecuteResponse {
  successful: boolean;
  data?: unknown;
  error?: string;
  logId: string;
  sessionInfo?: Record<string, unknown>;
}
```

---

## 8. Key Gotchas

1. **Version Control**: `latest` version requires `dangerouslySkipVersionCheck: true`. Pin versions in production.
2. **Strict Mode**: Strips optional fields. Needed for some LLM APIs (OpenAI strict function calling).
3. **Connected Accounts**: Must be created before tools can execute with OAuth.
4. **Schema Conversion**: JSON Schema → Zod happens at wrap-time, not runtime.
5. **Modifiers**: Applied in order: schema → beforeExecute → API call → afterExecute.
6. **Sessions are immutable**: If context changes, create a new session.
7. **Term "Tool Router"**: Now called "Sessions". `composio.toolRouter` is experimental; `composio.create()` is stable.
