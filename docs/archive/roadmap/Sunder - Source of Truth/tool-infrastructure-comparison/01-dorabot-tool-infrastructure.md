# Dorabot Tool Infrastructure - Comprehensive Analysis

## Overview

Dorabot is a personal AI agent built on the **Anthropic Claude Agent SDK** with a Node.js/TypeScript backend. The tool infrastructure is organized around **MCP (Model Context Protocol) servers**, with a built-in custom MCP server plus support for external MCP servers. Tools are defined using Zod schemas with the `@anthropic-ai/claude-agent-sdk` `tool()` function.

---

## 1. Tool Definition Schema

### Tool Definition Interface

**File:** `/Users/sethlim/Documents/dorabot/src/tools/messaging.ts` (example)

Tools are defined using the `tool()` function from `@anthropic-ai/claude-agent-sdk`. The signature is:

```typescript
export const messageTool = tool(
  'message',  // tool name (unique string)
  'description',  // human-readable description
  {
    // Zod schema for input parameters
    action: z.enum(['send', 'edit', 'delete']),
    channel: z.string().describe('Channel name: whatsapp, telegram, discord, slack, signal, console'),
    target: z.string().optional().describe('Recipient ID, chat ID, or channel ID'),
    message: z.string().optional().describe('Message content (for send/edit). Write plain text or markdown. Formatting is converted automatically per channel.'),
    messageId: z.string().optional().describe('Message ID to edit or delete'),
    chatId: z.string().optional().describe('Chat ID (required for edit/delete on some channels)'),
    media: z.string().optional().describe('Path to media file to attach'),
    replyTo: z.string().optional().describe('Message ID to reply to'),
  },
  async (args) => {
    // Implementation
    return {
      content: [{ type: 'text', text: '...' }],
      isError?: boolean,
    };
  }
);
```

### Key Characteristics

1. **Name**: String identifier for the tool (e.g., `'message'`, `'browser'`, `'screenshot'`)
2. **Description**: Human-readable description for the system prompt
3. **Zod Schema**: All parameters validated with Zod types. Each field includes `.describe()` for inline documentation
4. **Implementation**: Async function receiving parsed args, returning tool result object

### Tool Result Format

VERBATIM from `/Users/sethlim/Documents/dorabot/src/tools/screenshot.ts`:

```typescript
return {
  content: [
    { type: 'text' as const, text: outPath },
    { type: 'image' as const, data: base64, mimeType: 'image/png' },
  ],
};
```

AND error case:

```typescript
return {
  content: [{ type: 'text' as const, text: `Screenshot failed: ${err.message}` }],
  isError: true,
};
```

---

## 2. Tool Registration

### The MCP Server Factory

**File:** `/Users/sethlim/Documents/dorabot/src/tools/index.ts`

```typescript
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { messageTool } from './messaging.js';
import { calendarTools } from './calendar.js';
import { screenshotTool } from './screenshot.js';
import { browserTool } from './browser.js';
import { goalsTools } from './goals.js';
import { tasksTools } from './tasks.js';
import { researchTools } from './research.js';
import { memoryTools } from './memory.js';

// all custom tools for this agent
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

**How registration works:**
1. Each tool file exports its tool(s) - some export arrays (e.g., `calendarTools`)
2. All tools are collected into a single `customTools` array
3. `createSdkMcpServer()` is called with the tools list
4. This creates an in-process MCP server that the Claude SDK will communicate with

### Supported Tool Categories

| Category | Tools | File |
|----------|-------|------|
| Messaging | `message` | `src/tools/messaging.ts` |
| Browser | `browser` (37 sub-actions) | `src/tools/browser.ts` |
| Screenshot | `screenshot` | `src/tools/screenshot.ts` |
| Calendar | `schedule`, `list_schedule`, `update_schedule`, `cancel_schedule` | `src/tools/calendar.ts` |
| Goals | `goals_view`, `goals_add`, `goals_update`, `goals_propose` | `src/tools/goals.ts` |
| Tasks | `tasks_view`, `tasks_add`, `tasks_update`, `tasks_done` | `src/tools/tasks.ts` |
| Research | `research_start`, `research_update` | `src/tools/research.ts` |
| Memory | `memory_search` | `src/tools/memory.ts` |

**12 Total Custom Tools**

---

## 3. Tool Execution Flow

### Provider Dispatch: Claude SDK

**File:** `/Users/sethlim/Documents/dorabot/src/providers/claude.ts` (lines 621-802)

The Claude provider uses the `@anthropic-ai/claude-agent-sdk`'s `query()` function:

```typescript
export async *query(opts: ProviderRunOptions): AsyncGenerator<ProviderMessage, ProviderQueryResult, unknown> {
  const q = query({
    prompt: messageGenerator() as any,
    options: {
      model: opts.model,
      systemPrompt: opts.systemPrompt,
      tools: { type: 'preset', preset: 'claude_code' } as any,
      disallowedTools: ['EnterPlanMode', 'ExitPlanMode'],
      agents: opts.agents as any,
      hooks: opts.hooks as any,
      mcpServers: opts.mcpServer as any,          // <-- MCP servers passed here
      resume: opts.resumeId,
      permissionMode: opts.config.permissionMode as any,
      sandbox: opts.sandbox as any,
      cwd: opts.cwd,
      env: opts.env,
      maxTurns: opts.maxTurns,
      canUseTool: opts.canUseTool as any,
      abortController: opts.abortController,
    } as any,
  });
```

### MCP Server Merging

**File:** `/Users/sethlim/Documents/dorabot/src/agent.ts` (lines 177-186)

```typescript
// create MCP server for custom tools
const mcpServer = createAgentMcpServer();

// merge built-in MCP server with user-configured external MCP servers
const allMcpServers: Record<string, unknown> = { 'dorabot-tools': mcpServer };
if (config.mcpServers) {
  for (const [name, entry] of Object.entries(config.mcpServers)) {
    allMcpServers[name] = entry;
  }
}
```

### Message Streaming and Tool Use Tracking

**File:** `/Users/sethlim/Documents/dorabot/src/agent.ts` (lines 238-283)

```typescript
const toolsUsed: string[] = [];
for await (const msg of q) {
  // handle different message types
  if (m.type === 'assistant' && m.message) {
    const assistantMsg = m.message as Record<string, unknown>;
    const content = assistantMsg.content as unknown[];
    if (Array.isArray(content)) {
      for (const block of content) {
        const b = block as Record<string, unknown>;
        if (b.type === 'tool_use') {
          const tn = b.name as string;  // tool name
          if (tn === 'message') usedMessageTool = true;
          if (!toolsUsed.includes(tn)) toolsUsed.push(tn);
          if (onToolUse) onToolUse(tn, b.input);
        }
        if (b.type === 'text') {
          result = b.text as string;
        }
      }
    }
  }

  if (m.type === 'result') {
    result = (m.result as string) || result;
    usage = {
      inputTokens: ((m.usage as Record<string, number>)?.input_tokens) || 0,
      outputTokens: ((m.usage as Record<string, number>)?.output_tokens) || 0,
      totalCostUsd: (m.total_cost_usd as number) || 0,
    };
  }
}
```

---

## 4. Tool Result Handling

### Result Message Structure

**File:** `/Users/sethlim/Documents/dorabot/src/agent.ts` (lines 287-300)

```typescript
const resultMeta: MessageMetadata = {
  channel,
  tools: toolsUsed.length > 0 ? toolsUsed : undefined,
  usage,
  durationMs,
};
const resultMsg: SessionMessage = {
  type: 'result',
  timestamp: new Date().toISOString(),
  content: { result },
  metadata: resultMeta,
};
sessionManager.append(sessionId, resultMsg);

return {
  sessionId,
  result,
  messages,
  usage,
  durationMs,
  usedMessageTool,
};
```

### Tool Result Types (from messaging.ts)

```typescript
case 'send': {
  const target = args.target || args.chatId;
  if (!target || !args.message) {
    return {
      content: [{ type: 'text', text: 'Error: target and message required for send' }],
      isError: true,  // <-- error flag
    };
  }
  const result = await handler.send(target, args.message, {
    media: args.media,
    replyTo: args.replyTo,
  });
  return {
    content: [{ type: 'text', text: `Message sent. ID: ${result.id}` }],
  };
}
```

---

## 5. System Prompt & Tool Injection

### System Prompt Builder

**File:** `/Users/sethlim/Documents/dorabot/src/system-prompt.ts` (lines 20-100+)

```typescript
export function buildSystemPrompt(opts: SystemPromptOptions): string {
  const { config, skills = [], channel, timezone, ownerIdentity, extraContext } = opts;
  const sections: string[] = [];

  // identity
  sections.push(`You are the owner's personal agent...`);

  // tool call style
  sections.push(`## How to Work
Brief narration, plain language. Read files before referencing them.
Run independent tool calls in parallel. Use sub-agents for parallel or isolated workstreams...`);

  // autonomy mode
  const autonomy = config.autonomy || 'supervised';
  if (autonomy === 'autonomous') {
    sections.push(`## Autonomy (autonomous)
<default_to_action>Implement changes rather than suggesting them...</default_to_action>`);
  } else {
    sections.push(`## Autonomy (supervised)
<action_bias>Act freely on internal, reversible operations...</action_bias>`);
  }

  // skills
  if (skills.length > 0) {
    const skillList = skills.map(s => `- ${s.name}: ${s.description} [${s.path}]`).join('\n');
    sections.push(`## Skills
If a skill clearly matches the user's request, read its SKILL.md at the path shown and follow it.
<available_skills>
${skillList}
</available_skills>`);
  }

  // workspace context (SOUL.md, USER.md, MEMORY.md)
  if (opts.workspaceFiles) {
    const wsSection = buildWorkspaceSection(opts.workspaceFiles);
    if (wsSection) sections.push(wsSection);
  }

  return sections.join('\n\n');
}
```

### How Tools Get Injected

1. **Via MCP Server Parameter**: The `mcpServers` object passed to SDK `query()` contains the tool definitions
2. **Tools Are Not Explicitly Listed** in the system prompt — the SDK handles tool availability automatically
3. **Tool Descriptions** come from the `tool()` function's description parameter
4. **Skills Are Injected** into the system prompt textually

---

## 6. Error Handling

### Tool Error Patterns

**File:** `/Users/sethlim/Documents/dorabot/src/tools/messaging.ts` (lines 53-116)

```typescript
async (args) => {
  const handler = getHandler(args.channel);
  try {
    switch (args.action) {
      case 'send': {
        const target = args.target || args.chatId;
        if (!target || !args.message) {
          return {
            content: [{ type: 'text', text: 'Error: target and message required for send' }],
            isError: true,
          };
        }
        // ... handle send ...
      }
      default:
        return {
          content: [{ type: 'text', text: `Unknown action: ${args.action}` }],
          isError: true,
        };
    }
  } catch (err: any) {
    const msg = err?.description || err?.message || String(err);
    console.error(`[message tool] ${args.action} on ${args.channel} failed:`, msg);
    return {
      content: [{ type: 'text', text: `Error: ${msg}` }],
      isError: true,
    };
  }
}
```

### Tool Policy & Approval

**File:** `/Users/sethlim/Documents/dorabot/src/gateway/tool-policy.ts`

```typescript
export function classifyToolCall(
  toolName: string,
  input: Record<string, unknown>,
): Tier {
  const name = cleanToolName(toolName);

  if (name === 'Bash' || name === 'bash') {
    const command = (input.command as string) || '';
    return classifyBashCommand(command);
  }
  if (name === 'Write' || name === 'Edit') return 'require-approval';
  if (name === 'message') return 'require-approval';
  if (name === 'browser') return 'require-approval';
  if (name === 'schedule_reminder' || name === 'schedule_recurring' || name === 'schedule_cron') {
    return 'require-approval';
  }
  return 'auto-allow';
}
```

Tools are classified into 3 tiers:
- **auto-allow** — safe tools (read-only, lookups)
- **notify** — informational tools
- **require-approval** — dangerous tools (write, message, destructive bash)

### Hooks for Tool Validation

**File:** `/Users/sethlim/Documents/dorabot/src/hooks/index.ts` (lines 99-138)

```typescript
const bashValidationHook: HookCallback = async (input) => {
  if (input.hook_event_name !== 'PreToolUse') return { continue: true };
  const toolInput = input.tool_input as { command?: string };
  const command = toolInput.command || '';

  // block dangerous commands
  const dangerous = [
    /rm\s+-rf\s+\//,
    /rm\s+-rf\s+~/,
    /mkfs\./,
    /dd\s+if=/,
    /curl\s+.*\|\s*(ba)?sh/,
  ];

  for (const pattern of dangerous) {
    if (pattern.test(command)) {
      return {
        continue: false,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Blocked dangerous command pattern: ${pattern}`,
        },
      };
    }
  }
  return { continue: true };
};
```

---

## 7. Unique Patterns

### Channel Handler Registry

**File:** `/Users/sethlim/Documents/dorabot/src/tools/messaging.ts` (lines 4-20)

```typescript
export type ChannelHandler = {
  send(target: string, message: string, opts?: { media?: string; replyTo?: string }): Promise<{ id: string; chatId: string }>;
  edit(messageId: string, message: string, chatId?: string): Promise<void>;
  delete(messageId: string, chatId?: string): Promise<void>;
  typing?(chatId: string): Promise<void>;
};

const channelHandlers = new Map<string, ChannelHandler>();

export function registerChannelHandler(channel: string, handler: ChannelHandler): void {
  channelHandlers.set(channel, handler);
}

export function getChannelHandler(channel: string): ChannelHandler | undefined {
  return channelHandlers.get(channel);
}

const consoleHandler: ChannelHandler = {
  async send(target, message) {
    console.log(`[${target}] ${message}`);
    return { id: `console-${Date.now()}`, chatId: target };
  },
};

function getHandler(channel: string): ChannelHandler {
  return channelHandlers.get(channel) || consoleHandler;
}
```

Tools don't hardcode channel logic — they delegate to registered handlers. This allows dynamic channel support (WhatsApp, Telegram, Discord, Slack, Signal, etc.) without modifying the tool.

### Browser Tool with Sub-Actions

**File:** `/Users/sethlim/Documents/dorabot/src/tools/browser.ts` (lines 50-94)

```typescript
const browserActions = [
  'status', 'start', 'stop', 'open', 'navigate', 'navigate_page',
  'snapshot', 'take_snapshot', 'screenshot', 'take_screenshot',
  'click', 'click_at', 'drag', 'type', 'fill', 'fill_form',
  'select', 'press', 'press_key', 'hover', 'upload_file',
  'handle_dialog', 'wait', 'wait_for', 'tabs', 'list_pages',
  'select_page', 'new_page', 'close_tab', 'close_page', 'cookies',
  'evaluate', 'evaluate_script', 'list_console_messages',
  'get_console_message', 'list_network_requests', 'get_network_request',
  'pdf', 'scroll',
] as const;

export const browserTool = tool(
  'browser',
  'Browser automation tool. Supports input, navigation, snapshots, screenshots...',
  {
    action: z.enum(browserActions),
    // ... other parameters ...
  },
  async (args) => {
    // Dispatch to action functions
  }
);
```

A single tool with **37 sub-actions** via enum discriminator. This reduces tool count while maintaining logical grouping.

### Skills Eligibility & Matching

**File:** `/Users/sethlim/Documents/dorabot/src/skills/loader.ts` (lines 42-82)

```typescript
export function checkSkillEligibility(skill: Skill, config: Config): SkillEligibility {
  const reasons: string[] = [];
  const requires = skill.metadata.requires;

  if (config.skills.disabled.includes(skill.name)) {
    return { eligible: false, reasons: ['Explicitly disabled in config'] };
  }
  if (config.skills.enabled.length > 0 && !config.skills.enabled.includes(skill.name)) {
    return { eligible: false, reasons: ['Not in enabled list'] };
  }
  if (!requires) return { eligible: true, reasons: [] };

  if (requires.bins) {
    for (const bin of requires.bins) {
      if (!checkBinaryExists(bin)) reasons.push(`Missing binary: ${bin}`);
    }
  }
  if (requires.env) {
    for (const env of requires.env) {
      if (!checkEnvVar(env)) reasons.push(`Missing env var: ${env}`);
    }
  }
  return { eligible: reasons.length === 0, reasons };
}
```

### Path Allowlisting

**File:** `/Users/sethlim/Documents/dorabot/src/config.ts` (lines 260-296)

```typescript
export const ALWAYS_DENIED = [
  '~/.ssh',
  '~/.gnupg',
  '~/.aws',
  toHomeAlias(WHATSAPP_AUTH_DIR),
  toHomeAlias(GATEWAY_TOKEN_PATH),
  toHomeAlias(GATEWAY_SOCKET_PATH),
  toHomeAlias(LEGACY_CODEX_AUTH_PATH),
  '~/.config/nanoclaw',
];

export function isPathAllowed(
  targetPath: string,
  config: Config,
  channelOverride?: { allowedPaths?: string[]; deniedPaths?: string[] },
): boolean {
  const home = homedir();
  let resolved: string;
  try { resolved = realpathSync(targetPath); }
  catch { resolved = resolve(targetPath); }

  const globalDenied = config.gateway?.deniedPaths || ALWAYS_DENIED;
  const channelDenied = channelOverride?.deniedPaths || [];
  const denied = [...globalDenied, ...channelDenied].map(p => resolve(p.replace(/^~/, home)));
  if (denied.some(d => resolved.startsWith(d))) return false;

  const allowedRaw = channelOverride?.allowedPaths?.length
    ? channelOverride.allowedPaths
    : (config.gateway?.allowedPaths || [home, '/tmp']);
  const allowed = allowedRaw.map(p => resolve(p.replace(/^~/, home)));
  return allowed.some(a => resolved.startsWith(a));
}
```

---

## 8. Architecture Summary

```
┌─────────────────────────────────────────────────┐
│           User Input (CLI / Gateway)            │
└─────────────┬───────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────┐
│  runAgent() / streamAgent()                     │
│  ├─ Load config, skills, workspace files       │
│  ├─ Build system prompt (SOUL.md, USER.md, etc)│
│  └─ Enhanced user prompt (skill content)       │
└─────────────┬───────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────┐
│  Claude SDK query() function                    │
│  ├─ MCP servers (built-in + external)          │
│  ├─ Tools available via MCP protocol           │
│  ├─ Hooks for tool lifecycle                   │
│  └─ Permission mode + sandbox                  │
└─────────────┬───────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────┐
│  MCP Server: dorabot-tools (in-process)         │
│  ├─ message (channel handler registry)          │
│  ├─ browser (37 sub-actions)                    │
│  ├─ screenshot                                  │
│  ├─ schedule, list_schedule, update_schedule   │
│  ├─ goals_view, goals_add, etc.                │
│  ├─ tasks_view, tasks_add, etc.                │
│  ├─ research_start, research_update            │
│  └─ memory_search                              │
└─────────────┬───────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────┐
│  Tool Execution & Result Handling               │
│  ├─ Validation (Zod schemas)                   │
│  ├─ Dispatch to handler                        │
│  ├─ Return {content, isError}                  │
│  └─ Store in SQLite session table              │
└─────────────────────────────────────────────────┘
```

---

## 9. Dependencies

**File:** `/Users/sethlim/Documents/dorabot/package.json`

```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.2.42",
    "@openai/codex-sdk": "^0.98.0",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "better-sqlite3": "^12.6.2",
    "playwright-core": "^1.58.2",
    "zod": "^4.3.6",
    "grammy": "^1.21.0",
    "@whiskeysockets/baileys": "^6.7.0",
    "rrule": "^2.8.1",
    "sharp": "^0.34.5"
  }
}
```

Key dependencies:
- **claude-agent-sdk** — Tool definitions, SDK `query()`, MCP communication
- **zod** — Schema validation for tool inputs
- **better-sqlite3** — Local SQLite database for sessions
- **playwright-core** — Browser automation
- **grammy** — Telegram bot library
- **@whiskeysockets/baileys** — WhatsApp library
