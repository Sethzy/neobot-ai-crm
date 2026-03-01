# OpenClaw Tool Infrastructure - Comprehensive Analysis

## Executive Summary

OpenClaw uses a sophisticated, modular tool infrastructure built on top of the **@mariozechner/pi-agent-core** library. The system provides:

- **Plugin-based tool registration** with optional tools, optional plugins, and allowlist/denylists
- **Multi-layer policy enforcement** (global, agent-specific, group-level, provider-specific)
- **Pre-execution hooks** for tool loop detection, parameter validation, and blocking
- **Post-execution hooks** for auditing and side effects
- **Provider-aware schema normalization** (Anthropic, OpenAI, Google Gemini)
- **Comprehensive error handling** with loop detection and backoff
- **Sandbox-aware execution** with file system bridges

---

## 1. Tool Definition Schema

### Core Type Definition

**File:** `/Users/sethlim/Documents/openclaw/src/agents/tools/common.ts`

```typescript
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";

// oxlint-disable-next-line typescript/no-explicit-any
export type AnyAgentTool = AgentTool<any, unknown>;

export type StringParamOptions = {
  required?: boolean;
  trim?: boolean;
  label?: string;
  allowEmpty?: boolean;
};

export type ActionGate<T extends Record<string, boolean | undefined>> = (
  key: keyof T,
  defaultValue?: boolean,
) => boolean;

export class ToolInputError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}
```

### Tool Definition Adapter (LLM Integration)

**File:** `/Users/sethlim/Documents/openclaw/src/agents/pi-tool-definition-adapter.ts`

```typescript
import type {
  AgentTool,
  AgentToolResult,
  AgentToolUpdateCallback,
} from "@mariozechner/pi-agent-core";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

type AnyAgentTool = AgentTool;

type ToolExecuteArgsCurrent = [
  string,
  unknown,
  AbortSignal | undefined,
  AgentToolUpdateCallback<unknown> | undefined,
  unknown,
];
type ToolExecuteArgsLegacy = [
  string,
  unknown,
  AgentToolUpdateCallback<unknown> | undefined,
  unknown,
  AbortSignal | undefined,
];
type ToolExecuteArgs = ToolDefinition["execute"] extends (...args: infer P) => unknown
  ? P
  : ToolExecuteArgsCurrent;

export function toToolDefinitions(tools: AnyAgentTool[]): ToolDefinition[] {
  return tools.map((tool) => {
    const name = tool.name || "tool";
    const normalizedName = normalizeToolName(name);
    const beforeHookWrapped = isToolWrappedWithBeforeToolCallHook(tool);
    return {
      name,
      label: tool.label ?? name,
      description: tool.description ?? "",
      parameters: tool.parameters,
      execute: async (...args: ToolExecuteArgs): Promise<AgentToolResult<unknown>> => {
        // Execution logic (see Tool Execution section)
      },
    } satisfies ToolDefinition;
  });
}
```

---

## 2. Tool Registration

### Plugin-Based Tool Registration System

OpenClaw uses a **dynamic plugin system** for tool registration. Tools can come from:
1. **Core tools** (built-in exec, read, write, edit, process, etc.)
2. **OpenClaw tools** (message, session, browser, canvas, etc.)
3. **Plugin tools** (discovered and loaded at runtime)

**File:** `/Users/sethlim/Documents/openclaw/src/plugins/types.ts`

```typescript
export type OpenClawPluginToolFactory = (
  ctx: OpenClawPluginToolContext,
) => AnyAgentTool | AnyAgentTool[] | null | undefined;

export type OpenClawPluginToolOptions = {
  name?: string;
  names?: string[];
  optional?: boolean;
};

export type OpenClawPluginApi = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  source: string;
  config: OpenClawConfig;
  pluginConfig?: Record<string, unknown>;
  runtime: PluginRuntime;
  logger: PluginLogger;
  registerTool: (
    tool: AnyAgentTool | OpenClawPluginToolFactory,
    opts?: OpenClawPluginToolOptions,
  ) => void;
  registerHook: (
    events: string | string[],
    handler: InternalHookHandler,
    opts?: OpenClawPluginHookOptions,
  ) => void;
  registerHttpHandler: (handler: OpenClawPluginHttpHandler) => void;
  registerHttpRoute: (params: { path: string; handler: OpenClawPluginHttpRouteHandler }) => void;
  registerChannel: (registration: OpenClawPluginChannelRegistration | ChannelPlugin) => void;
  registerGatewayMethod: (method: string, handler: GatewayRequestHandler) => void;
  registerCli: (registrar: OpenClawPluginCliRegistrar, opts?: { commands?: string[] }) => void;
  registerService: (service: OpenClawPluginService) => void;
  registerProvider: (provider: ProviderPlugin) => void;
  registerCommand: (command: OpenClawPluginCommandDefinition) => void;
  resolvePath: (input: string) => string;
  on: <K extends PluginHookName>(
    hookName: K,
    handler: PluginHookHandlerMap[K],
    opts?: { priority?: number },
  ) => void;
};

export type OpenClawPluginDefinition = {
  id?: string;
  name?: string;
  description?: string;
  version?: string;
  kind?: PluginKind;
  configSchema?: OpenClawPluginConfigSchema;
  register?: (api: OpenClawPluginApi) => void | Promise<void>;
  activate?: (api: OpenClawPluginApi) => void | Promise<void>;
};

export type OpenClawPluginModule =
  | OpenClawPluginDefinition
  | ((api: OpenClawPluginApi) => void | Promise<void>);
```

### Tool Registration in Plugin Loader

**File:** `/Users/sethlim/Documents/openclaw/src/plugins/tools.ts`

```typescript
import { normalizeToolName } from "../agents/tool-policy.js";
import type { AnyAgentTool } from "../agents/tools/common.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { applyTestPluginDefaults, normalizePluginsConfig } from "./config-state.js";
import { loadOpenClawPlugins } from "./loader.js";
import type { OpenClawPluginToolContext } from "./types.js";

const log = createSubsystemLogger("plugins");

type PluginToolMeta = {
  pluginId: string;
  optional: boolean;
};

const pluginToolMeta = new WeakMap<AnyAgentTool, PluginToolMeta>();

export function getPluginToolMeta(tool: AnyAgentTool): PluginToolMeta | undefined {
  return pluginToolMeta.get(tool);
}

function normalizeAllowlist(list?: string[]) {
  return new Set((list ?? []).map(normalizeToolName).filter(Boolean));
}

function isOptionalToolAllowed(params: {
  toolName: string;
  pluginId: string;
  allowlist: Set<string>;
}): boolean {
  if (params.allowlist.size === 0) {
    return false;
  }
  const toolName = normalizeToolName(params.toolName);
  if (params.allowlist.has(toolName)) {
    return true;
  }
  const pluginKey = normalizeToolName(params.pluginId);
  if (params.allowlist.has(pluginKey)) {
    return true;
  }
  return params.allowlist.has("group:plugins");
}

export function resolvePluginTools(params: {
  context: OpenClawPluginToolContext;
  existingToolNames?: Set<string>;
  toolAllowlist?: string[];
}): AnyAgentTool[] {
  // Fast path: when plugins are effectively disabled, avoid discovery/jiti entirely.
  const effectiveConfig = applyTestPluginDefaults(params.context.config ?? {}, process.env);
  const normalized = normalizePluginsConfig(effectiveConfig.plugins);
  if (!normalized.enabled) {
    return [];
  }

  const registry = loadOpenClawPlugins({
    config: effectiveConfig,
    workspaceDir: params.context.workspaceDir,
    logger: {
      info: (msg) => log.info(msg),
      warn: (msg) => log.warn(msg),
      error: (msg) => log.error(msg),
      debug: (msg) => log.debug(msg),
    },
  });

  const tools: AnyAgentTool[] = [];
  const existing = params.existingToolNames ?? new Set<string>();
  const existingNormalized = new Set(Array.from(existing, (tool) => normalizeToolName(tool)));
  const allowlist = normalizeAllowlist(params.toolAllowlist);
  const blockedPlugins = new Set<string>();

  for (const entry of registry.tools) {
    if (blockedPlugins.has(entry.pluginId)) {
      continue;
    }
    const pluginIdKey = normalizeToolName(entry.pluginId);
    if (existingNormalized.has(pluginIdKey)) {
      const message = `plugin id conflicts with core tool name (${entry.pluginId})`;
      log.error(message);
      registry.diagnostics.push({
        level: "error",
        pluginId: entry.pluginId,
        source: entry.source,
        message,
      });
      blockedPlugins.add(entry.pluginId);
      continue;
    }
    let resolved: AnyAgentTool | AnyAgentTool[] | null | undefined = null;
    try {
      resolved = entry.factory(params.context);
    } catch (err) {
      log.error(`plugin tool failed (${entry.pluginId}): ${String(err)}`);
      continue;
    }
    if (!resolved) {
      continue;
    }
    const listRaw = Array.isArray(resolved) ? resolved : [resolved];
    const list = entry.optional
      ? listRaw.filter((tool) =>
          isOptionalToolAllowed({
            toolName: tool.name,
            pluginId: entry.pluginId,
            allowlist,
          }),
        )
      : listRaw;
    if (list.length === 0) {
      continue;
    }
    const nameSet = new Set<string>();
    for (const tool of list) {
      if (nameSet.has(tool.name) || existing.has(tool.name)) {
        const message = `plugin tool name conflict (${entry.pluginId}): ${tool.name}`;
        log.error(message);
        registry.diagnostics.push({
          level: "error",
          pluginId: entry.pluginId,
          source: entry.source,
          message,
        });
        continue;
      }
      nameSet.add(tool.name);
      existing.add(tool.name);
      pluginToolMeta.set(tool, {
        pluginId: entry.pluginId,
        optional: entry.optional,
      });
      tools.push(tool);
    }
  }

  return tools;
}
```

### Core and OpenClaw Tool Registration

**File:** `/Users/sethlim/Documents/openclaw/src/agents/openclaw-tools.ts`

```typescript
import type { OpenClawConfig } from "../config/config.js";
import { resolvePluginTools } from "../plugins/tools.js";
import type { GatewayMessageChannel } from "../utils/message-channel.js";
import { resolveSessionAgentId } from "./agent-scope.js";
import type { SandboxFsBridge } from "./sandbox/fs-bridge.js";
import { createAgentsListTool } from "./tools/agents-list-tool.js";
import { createBrowserTool } from "./tools/browser-tool.js";
import { createCanvasTool } from "./tools/canvas-tool.js";
import type { AnyAgentTool } from "./tools/common.js";
// ... more imports ...

export function createOpenClawTools(options?: {
  sandboxBrowserBridgeUrl?: string;
  allowHostBrowserControl?: boolean;
  agentSessionKey?: string;
  agentChannel?: GatewayMessageChannel;
  agentAccountId?: string;
  agentTo?: string;
  agentThreadId?: string | number;
  agentGroupId?: string | null;
  agentGroupChannel?: string | null;
  agentGroupSpace?: string | null;
  agentDir?: string;
  sandboxRoot?: string;
  sandboxFsBridge?: SandboxFsBridge;
  workspaceDir?: string;
  sandboxed?: boolean;
  config?: OpenClawConfig;
  pluginToolAllowlist?: string[];
  currentChannelId?: string;
  currentThreadTs?: string;
  replyToMode?: "off" | "first" | "all";
  hasRepliedRef?: { value: boolean };
  modelHasVision?: boolean;
  requesterAgentIdOverride?: string;
  requireExplicitMessageTarget?: boolean;
  disableMessageTool?: boolean;
}): AnyAgentTool[] {
  const workspaceDir = resolveWorkspaceRoot(options?.workspaceDir);
  // ... tool creation ...
  const tools: AnyAgentTool[] = [
    createBrowserTool({
      sandboxBridgeUrl: options?.sandboxBrowserBridgeUrl,
      allowHostControl: options?.allowHostBrowserControl,
    }),
    createCanvasTool({ config: options?.config }),
    createNodesTool({
      agentSessionKey: options?.agentSessionKey,
      config: options?.config,
    }),
    createCronTool({
      agentSessionKey: options?.agentSessionKey,
    }),
    ...(messageTool ? [messageTool] : []),
    createTtsTool({
      agentChannel: options?.agentChannel,
      config: options?.config,
    }),
    createGatewayTool({
      agentSessionKey: options?.agentSessionKey,
      config: options?.config,
    }),
    createAgentsListTool({
      agentSessionKey: options?.agentSessionKey,
      requesterAgentIdOverride: options?.requesterAgentIdOverride,
    }),
    createSessionsListTool({
      agentSessionKey: options?.agentSessionKey,
      sandboxed: options?.sandboxed,
    }),
    createSessionsHistoryTool({
      agentSessionKey: options?.agentSessionKey,
      sandboxed: options?.sandboxed,
    }),
    createSessionsSendTool({
      agentSessionKey: options?.agentSessionKey,
      agentChannel: options?.agentChannel,
      sandboxed: options?.sandboxed,
    }),
    createSessionsSpawnTool({
      agentSessionKey: options?.agentSessionKey,
      agentChannel: options?.agentChannel,
      agentAccountId: options?.agentAccountId,
      agentTo: options?.agentTo,
      agentThreadId: options?.agentThreadId,
      agentGroupId: options?.agentGroupId,
      agentGroupChannel: options?.agentGroupChannel,
      agentGroupSpace: options?.agentGroupSpace,
      sandboxed: options?.sandboxed,
      requesterAgentIdOverride: options?.requesterAgentIdOverride,
    }),
    createSubagentsTool({
      agentSessionKey: options?.agentSessionKey,
    }),
    createSessionStatusTool({
      agentSessionKey: options?.agentSessionKey,
      config: options?.config,
    }),
    ...(webSearchTool ? [webSearchTool] : []),
    ...(webFetchTool ? [webFetchTool] : []),
    ...(imageTool ? [imageTool] : []),
  ];

  const pluginTools = resolvePluginTools({
    context: {
      config: options?.config,
      workspaceDir,
      agentDir: options?.agentDir,
      agentId: resolveSessionAgentId({
        sessionKey: options?.agentSessionKey,
        config: options?.config,
      }),
      sessionKey: options?.agentSessionKey,
      messageChannel: options?.agentChannel,
      agentAccountId: options?.agentAccountId,
      sandboxed: options?.sandboxed,
    },
    existingToolNames: new Set(tools.map((tool) => tool.name)),
    toolAllowlist: options?.pluginToolAllowlist,
  });

  return [...tools, ...pluginTools];
}
```

### Main Tool Creation Function

**File:** `/Users/sethlim/Documents/openclaw/src/agents/pi-tools.ts` (lines 164-505)

```typescript
export function createOpenClawCodingTools(options?: {
  exec?: ExecToolDefaults & ProcessToolDefaults;
  messageProvider?: string;
  agentAccountId?: string;
  messageTo?: string;
  messageThreadId?: string | number;
  sandbox?: SandboxContext | null;
  sessionKey?: string;
  agentDir?: string;
  workspaceDir?: string;
  config?: OpenClawConfig;
  abortSignal?: AbortSignal;
  modelProvider?: string;
  modelId?: string;
  modelContextWindowTokens?: number;
  modelAuthMode?: ModelAuthMode;
  currentChannelId?: string;
  currentThreadTs?: string;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  spawnedBy?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  senderUsername?: string | null;
  senderE164?: string | null;
  replyToMode?: "off" | "first" | "all";
  hasRepliedRef?: { value: boolean };
  modelHasVision?: boolean;
  requireExplicitMessageTarget?: boolean;
  disableMessageTool?: boolean;
  senderIsOwner?: boolean;
}): AnyAgentTool[] {
  // Tool policy resolution
  const {
    agentId,
    globalPolicy,
    globalProviderPolicy,
    agentPolicy,
    agentProviderPolicy,
    profile,
    providerProfile,
    profileAlsoAllow,
    providerProfileAlsoAllow,
  } = resolveEffectiveToolPolicy({
    config: options?.config,
    sessionKey: options?.sessionKey,
    modelProvider: options?.modelProvider,
    modelId: options?.modelId,
  });

  // Group policy resolution
  const groupPolicy = resolveGroupToolPolicy({
    config: options?.config,
    sessionKey: options?.sessionKey,
    spawnedBy: options?.spawnedBy,
    messageProvider: options?.messageProvider,
    groupId: options?.groupId,
    groupChannel: options?.groupChannel,
    groupSpace: options?.groupSpace,
    accountId: options?.agentAccountId,
    senderId: options?.senderId,
    senderName: options?.senderName,
    senderUsername: options?.senderUsername,
    senderE164: options?.senderE164,
  });

  // Build base coding tools from pi-coding-agent
  const base = (codingTools as unknown as AnyAgentTool[]).flatMap((tool) => {
    if (tool.name === readTool.name) {
      // ... custom read tool handling
    }
    if (tool.name === "bash" || tool.name === execToolName) {
      return [];
    }
    if (tool.name === "write") {
      // ... custom write tool handling
    }
    if (tool.name === "edit") {
      // ... custom edit tool handling
    }
    return [tool];
  });

  const tools: AnyAgentTool[] = [
    ...base,
    ...(sandboxRoot ? [...sandboxedTools] : []),
    ...(applyPatchTool ? [applyPatchTool] : []),
    execTool,
    processTool,
    ...listChannelAgentTools({ cfg: options?.config }),
    ...createOpenClawTools({
      // ... options ...
    }),
  ];

  // Apply tool authorization
  const senderIsOwner = options?.senderIsOwner === true;
  const toolsByAuthorization = applyOwnerOnlyToolPolicy(tools, senderIsOwner);

  // Apply tool policies
  const subagentFiltered = applyToolPolicyPipeline({
    tools: toolsByAuthorization,
    toolMeta: (tool) => getPluginToolMeta(tool),
    warn: logWarn,
    steps: [
      ...buildDefaultToolPolicyPipelineSteps({
        profilePolicy: profilePolicyWithAlsoAllow,
        profile,
        providerProfilePolicy: providerProfilePolicyWithAlsoAllow,
        providerProfile,
        globalPolicy,
        globalProviderPolicy,
        agentPolicy,
        agentProviderPolicy,
        groupPolicy,
        agentId,
      }),
      { policy: sandbox?.tools, label: "sandbox tools.allow" },
      { policy: subagentPolicy, label: "subagent tools.allow" },
    ],
  });

  // Normalize tool JSON Schemas
  const normalized = subagentFiltered.map((tool) =>
    normalizeToolParameters(tool, { modelProvider: options?.modelProvider }),
  );

  // Wrap with before-tool-call hooks
  const withHooks = normalized.map((tool) =>
    wrapToolWithBeforeToolCallHook(tool, {
      agentId,
      sessionKey: options?.sessionKey,
      loopDetection: resolveToolLoopDetectionConfig({ cfg: options?.config, agentId }),
    }),
  );

  // Wrap with abort signal
  const withAbort = options?.abortSignal
    ? withHooks.map((tool) => wrapToolWithAbortSignal(tool, options.abortSignal))
    : withHooks;

  return withAbort;
}
```

---

## 3. Tool Execution

### Tool Execution Flow with Hooks

**File:** `/Users/sethlim/Documents/openclaw/src/agents/pi-tool-definition-adapter.ts` (lines 89-189)

```typescript
export function toToolDefinitions(tools: AnyAgentTool[]): ToolDefinition[] {
  return tools.map((tool) => {
    const name = tool.name || "tool";
    const normalizedName = normalizeToolName(name);
    const beforeHookWrapped = isToolWrappedWithBeforeToolCallHook(tool);
    return {
      name,
      label: tool.label ?? name,
      description: tool.description ?? "",
      parameters: tool.parameters,
      execute: async (...args: ToolExecuteArgs): Promise<AgentToolResult<unknown>> => {
        const { toolCallId, params, onUpdate, signal } = splitToolExecuteArgs(args);
        let executeParams = params;
        try {
          // Run before_tool_call hook if not already wrapped
          if (!beforeHookWrapped) {
            const hookOutcome = await runBeforeToolCallHook({
              toolName: name,
              params,
              toolCallId,
            });
            if (hookOutcome.blocked) {
              throw new Error(hookOutcome.reason);
            }
            executeParams = hookOutcome.params;
          }

          // Execute the tool
          const result = await tool.execute(toolCallId, executeParams, signal, onUpdate);
          const afterParams = beforeHookWrapped
            ? (consumeAdjustedParamsForToolCall(toolCallId) ?? executeParams)
            : executeParams;

          // Call after_tool_call hook
          const hookRunner = getGlobalHookRunner();
          if (hookRunner?.hasHooks("after_tool_call")) {
            try {
              await hookRunner.runAfterToolCall(
                {
                  toolName: name,
                  params: isPlainObject(afterParams) ? afterParams : {},
                  result,
                },
                { toolName: name },
              );
            } catch (hookErr) {
              logDebug(
                `after_tool_call hook failed: tool=${normalizedName} error=${String(hookErr)}`,
              );
            }
          }

          return result;
        } catch (err) {
          if (signal?.aborted) {
            throw err;
          }
          const name =
            err && typeof err === "object" && "name" in err
              ? String((err as { name?: unknown }).name)
              : "";
          if (name === "AbortError") {
            throw err;
          }
          if (beforeHookWrapped) {
            consumeAdjustedParamsForToolCall(toolCallId);
          }
          const described = describeToolExecutionError(err);
          if (described.stack && described.stack !== described.message) {
            logDebug(`tools: ${normalizedName} failed stack:\n${described.stack}`);
          }
          logError(`[tools] ${normalizedName} failed: ${described.message}`);

          const errorResult = jsonResult({
            status: "error",
            tool: normalizedName,
            error: described.message,
          });

          // Call after_tool_call hook for errors too
          const hookRunner = getGlobalHookRunner();
          if (hookRunner?.hasHooks("after_tool_call")) {
            try {
              await hookRunner.runAfterToolCall(
                {
                  toolName: normalizedName,
                  params: isPlainObject(params) ? params : {},
                  error: described.message,
                },
                { toolName: normalizedName },
              );
            } catch (hookErr) {
              logDebug(
                `after_tool_call hook failed: tool=${normalizedName} error=${String(hookErr)}`,
              );
            }
          }

          return errorResult;
        }
      },
    } satisfies ToolDefinition;
  });
}
```

### Before Tool Call Hook with Loop Detection

**File:** `/Users/sethlim/Documents/openclaw/src/agents/pi-tools.before-tool-call.ts` (lines 74-233)

```typescript
import type { ToolLoopDetectionConfig } from "../config/types.tools.js";
import type { SessionState } from "../logging/diagnostic-session-state.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import { isPlainObject } from "../utils.js";
import { normalizeToolName } from "./tool-policy.js";
import type { AnyAgentTool } from "./tools/common.js";

export type HookContext = {
  agentId?: string;
  sessionKey?: string;
  loopDetection?: ToolLoopDetectionConfig;
};

type HookOutcome = { blocked: true; reason: string } | { blocked: false; params: unknown };

const log = createSubsystemLogger("agents/tools");
const BEFORE_TOOL_CALL_WRAPPED = Symbol("beforeToolCallWrapped");
const adjustedParamsByToolCallId = new Map<string, unknown>();
const MAX_TRACKED_ADJUSTED_PARAMS = 1024;

export async function runBeforeToolCallHook(args: {
  toolName: string;
  params: unknown;
  toolCallId?: string;
  ctx?: HookContext;
}): Promise<HookOutcome> {
  const toolName = normalizeToolName(args.toolName || "tool");
  const params = args.params;

  if (args.ctx?.sessionKey) {
    const { getDiagnosticSessionState } = await import("../logging/diagnostic-session-state.js");
    const { logToolLoopAction } = await import("../logging/diagnostic.js");
    const { detectToolCallLoop, recordToolCall } = await import("./tool-loop-detection.js");

    const sessionState = getDiagnosticSessionState({
      sessionKey: args.ctx.sessionKey,
      sessionId: args.ctx?.agentId,
    });

    const loopResult = detectToolCallLoop(sessionState, toolName, params, args.ctx.loopDetection);

    if (loopResult.stuck) {
      if (loopResult.level === "critical") {
        log.error(`Blocking ${toolName} due to critical loop: ${loopResult.message}`);
        logToolLoopAction({
          sessionKey: args.ctx.sessionKey,
          sessionId: args.ctx?.agentId,
          toolName,
          level: "critical",
          action: "block",
          detector: loopResult.detector,
          count: loopResult.count,
          message: loopResult.message,
          pairedToolName: loopResult.pairedToolName,
        });
        return {
          blocked: true,
          reason: loopResult.message,
        };
      }
    }

    recordToolCall(sessionState, toolName, params, args.toolCallId, args.ctx.loopDetection);
  }

  const hookRunner = getGlobalHookRunner();
  if (!hookRunner?.hasHooks("before_tool_call")) {
    return { blocked: false, params: args.params };
  }

  try {
    const normalizedParams = isPlainObject(params) ? params : {};
    const hookResult = await hookRunner.runBeforeToolCall(
      {
        toolName,
        params: normalizedParams,
      },
      {
        toolName,
        agentId: args.ctx?.agentId,
        sessionKey: args.ctx?.sessionKey,
      },
    );

    if (hookResult?.block) {
      return {
        blocked: true,
        reason: hookResult.blockReason || "Tool call blocked by plugin hook",
      };
    }

    if (hookResult?.params && isPlainObject(hookResult.params)) {
      if (isPlainObject(params)) {
        return { blocked: false, params: { ...params, ...hookResult.params } };
      }
      return { blocked: false, params: hookResult.params };
    }
  } catch (err) {
    const toolCallId = args.toolCallId ? ` toolCallId=${args.toolCallId}` : "";
    log.warn(`before_tool_call hook failed: tool=${toolName}${toolCallId} error=${String(err)}`);
  }

  return { blocked: false, params };
}

export function wrapToolWithBeforeToolCallHook(
  tool: AnyAgentTool,
  ctx?: HookContext,
): AnyAgentTool {
  const execute = tool.execute;
  if (!execute) {
    return tool;
  }
  const toolName = tool.name || "tool";
  const wrappedTool: AnyAgentTool = {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      const outcome = await runBeforeToolCallHook({
        toolName,
        params,
        toolCallId,
        ctx,
      });
      if (outcome.blocked) {
        throw new Error(outcome.reason);
      }
      if (toolCallId) {
        adjustedParamsByToolCallId.set(toolCallId, outcome.params);
        if (adjustedParamsByToolCallId.size > MAX_TRACKED_ADJUSTED_PARAMS) {
          const oldest = adjustedParamsByToolCallId.keys().next().value;
          if (oldest) {
            adjustedParamsByToolCallId.delete(oldest);
          }
        }
      }
      const normalizedToolName = normalizeToolName(toolName || "tool");
      try {
        const result = await execute(toolCallId, outcome.params, signal, onUpdate);
        await recordLoopOutcome({
          ctx,
          toolName: normalizedToolName,
          toolParams: outcome.params,
          toolCallId,
          result,
        });
        return result;
      } catch (err) {
        await recordLoopOutcome({
          ctx,
          toolName: normalizedToolName,
          toolParams: outcome.params,
          toolCallId,
          error: err,
        });
        throw err;
      }
    },
  };
  Object.defineProperty(wrappedTool, BEFORE_TOOL_CALL_WRAPPED, {
    value: true,
    enumerable: true,
  });
  return wrappedTool;
}

export function isToolWrappedWithBeforeToolCallHook(tool: AnyAgentTool): boolean {
  const taggedTool = tool as unknown as Record<symbol, unknown>;
  return taggedTool[BEFORE_TOOL_CALL_WRAPPED] === true;
}

export function consumeAdjustedParamsForToolCall(toolCallId: string): unknown {
  const params = adjustedParamsByToolCallId.get(toolCallId);
  adjustedParamsByToolCallId.delete(toolCallId);
  return params;
}
```

### Abort Signal Wrapping

**File:** `/Users/sethlim/Documents/openclaw/src/agents/pi-tools.abort.ts`

```typescript
export function wrapToolWithAbortSignal(
  tool: AnyAgentTool,
  signal: AbortSignal,
): AnyAgentTool {
  const execute = tool.execute;
  if (!execute) {
    return tool;
  }
  return {
    ...tool,
    execute: async (toolCallId, params, _signal, onUpdate) => {
      // Use the wrapped signal instead of the one passed in
      return execute(toolCallId, params, signal, onUpdate);
    },
  };
}
```

---

## 4. Tool Result Handling

### Tool Result Extraction and Formatting

**File:** `/Users/sethlim/Documents/openclaw/src/infra/outbound/tool-payload.ts`

```typescript
import type { AgentToolResult } from "@mariozechner/pi-agent-core";

export function extractToolPayload(result: AgentToolResult<unknown>): unknown {
  if (result.details !== undefined) {
    return result.details;
  }
  const textBlock = Array.isArray(result.content)
    ? result.content.find(
        (block) =>
          block &&
          typeof block === "object" &&
          (block as { type?: unknown }).type === "text" &&
          typeof (block as { text?: unknown }).text === "string",
      )
    : undefined;
  const text = (textBlock as { text?: string } | undefined)?.text;
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return result.content ?? result;
}
```

### Result Helper Functions

**File:** `/Users/sethlim/Documents/openclaw/src/agents/tools/common.ts` (lines 100+)

```typescript
export function jsonResult(data: unknown): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}

export function textResult(text: string): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text }],
  };
}

export async function imageResultFromFile(filePath: string): Promise<AgentToolResult<unknown>> {
  const buffer = await fs.readFile(filePath);
  const mimeType = detectMime(filePath);
  return {
    content: [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: mimeType,
          data: buffer.toString("base64"),
        },
      },
    ],
  };
}
```

---

## 5. Tool Categories/Organization

### Tool Policy Configuration Types

**File:** `/Users/sethlim/Documents/openclaw/src/config/types.tools.ts` (lines 139-240)

```typescript
export type ToolProfileId = "minimal" | "coding" | "messaging" | "full";

export type ToolLoopDetectionDetectorConfig = {
  /** Enable warning/blocking for repeated identical calls to the same tool/params. */
  genericRepeat?: boolean;
  /** Enable warning/blocking for known no-progress polling loops. */
  knownPollNoProgress?: boolean;
  /** Enable warning/blocking for no-progress ping-pong alternating patterns. */
  pingPong?: boolean;
};

export type ToolLoopDetectionConfig = {
  /** Enable tool-loop protection (default: false). */
  enabled?: boolean;
  /** Maximum tool call history entries retained for loop detection (default: 30). */
  historySize?: number;
  /** Warning threshold before a warning-only loop classification (default: 10). */
  warningThreshold?: number;
  /** Critical threshold for blocking repetitive loops (default: 20). */
  criticalThreshold?: number;
  /** Global no-progress breaker threshold (default: 30). */
  globalCircuitBreakerThreshold?: number;
  /** Detector toggles. */
  detectors?: ToolLoopDetectionDetectorConfig;
};

export type SessionsToolsVisibility = "self" | "tree" | "agent" | "all";

export type ToolPolicyConfig = {
  allow?: string[];
  /**
   * Additional allowlist entries merged into the effective allowlist.
   *
   * Intended for additive configuration (e.g., "also allow lobster") without forcing
   * users to replace/duplicate an existing allowlist or profile.
   */
  alsoAllow?: string[];
  deny?: string[];
  profile?: ToolProfileId;
};

export type GroupToolPolicyConfig = {
  allow?: string[];
  /** Additional allowlist entries merged into allow. */
  alsoAllow?: string[];
  deny?: string[];
};

export type GroupToolPolicyBySenderConfig = Record<string, GroupToolPolicyConfig>;

export type ExecToolConfig = {
  /** Exec host routing (default: sandbox). */
  host?: "sandbox" | "gateway" | "node";
  /** Exec security mode (default: deny). */
  security?: "deny" | "allowlist" | "full";
  /** Exec ask mode (default: on-miss). */
  ask?: "off" | "on-miss" | "always";
  /** Default node binding for exec.host=node (node id/name). */
  node?: string;
  /** Directories to prepend to PATH when running exec (gateway/sandbox). */
  pathPrepend?: string[];
  /** Safe stdin-only binaries that can run without allowlist entries. */
  safeBins?: string[];
  /** Default time (ms) before an exec command auto-backgrounds. */
  backgroundMs?: number;
  /** Default timeout (seconds) before auto-killing exec commands. */
  timeoutSec?: number;
  /** Emit a running notice (ms) when approval-backed exec runs long (default: 10000, 0 = off). */
  approvalRunningNoticeMs?: number;
  /** How long to keep finished sessions in memory (ms). */
  cleanupMs?: number;
  /** Emit a system event and heartbeat when a backgrounded exec exits. */
  notifyOnExit?: boolean;
  /** apply_patch subtool configuration (experimental). */
  applyPatch?: {
    /** Enable apply_patch for OpenAI models (default: false). */
    enabled?: boolean;
    /** Restrict apply_patch paths to the workspace directory (default: true). */
    workspaceOnly?: boolean;
    /** Optional allowlist of model ids that can use apply_patch. */
    allowModels?: string[];
  };
};

export type FsToolsConfig = {
  /**
   * Restrict filesystem tools (read/write/edit/apply_patch) to the agent workspace directory.
   * Default: false (unrestricted, matches legacy behavior).
   */
  workspaceOnly?: boolean;
};

export type AgentToolsConfig = {
  /** Base tool profile applied before allow/deny lists. */
  profile?: ToolProfileId;
  allow?: string[];
  /** Additional allowlist entries merged into allow and/or profile allowlist. */
  alsoAllow?: string[];
  deny?: string[];
  /** Optional tool policy overrides keyed by provider id or "provider/model". */
  byProvider?: Record<string, ToolPolicyConfig>;
  /** Per-agent elevated exec gate (can only further restrict global tools.elevated). */
  elevated?: {
    /** Enable or disable elevated mode for this agent (default: true). */
    enabled?: boolean;
    /** Approved senders for /elevated (per-provider allowlists). */
    allowFrom?: AgentElevatedAllowFromConfig;
  };
  /** Exec tool defaults for this agent. */
  exec?: ExecToolConfig;
  /** Filesystem tool path guards. */
  fs?: FsToolsConfig;
  /** Runtime loop detection for repetitive/ stuck tool-call patterns. */
  loopDetection?: ToolLoopDetectionConfig;
  sandbox?: {
    tools?: {
      allow?: string[];
      deny?: string[];
    };
  };
};

export type ToolsConfig = {
  /** Base tool profile applied before allow/deny lists. */
  profile?: ToolProfileId;
  allow?: string[];
  /** Additional allowlist entries merged into allow and/or profile allowlist. */
  alsoAllow?: string[];
  deny?: string[];
  /** Optional tool policy overrides keyed by provider id or "provider/model". */
  byProvider?: Record<string, ToolPolicyConfig>;
  web?: {
    search?: {
      /** Enable web search tool (default: true when API key is present). */
      enabled?: boolean;
      /** Search provider ("brave", "perplexity", or "grok"). */
      provider?: "brave" | "perplexity" | "grok";
      // ... more config ...
    };
    fetch?: {
      /** Enable web fetch tool (default: true). */
      enabled?: boolean;
      // ... more config ...
    };
  };
  media?: MediaToolsConfig;
  links?: LinkToolsConfig;
  message?: {
    // ... message config ...
  };
  agentToAgent?: {
    /** Enable agent-to-agent messaging tools. Default: false. */
    enabled?: boolean;
    /** Allowlist of agent ids or patterns (implementation-defined). */
    allow?: string[];
  };
  // ... more config ...
};
```

### Tool Categories in File System

```
/Users/sethlim/Documents/openclaw/src/agents/
├── tools/
│   ├── browser-tool.ts             # Browser automation
│   ├── canvas-tool.ts              # Pencil design canvas
│   ├── nodes-tool.ts               # Node management
│   ├── message-tool.ts             # Multi-channel messaging
│   ├── cron-tool.ts                # Scheduled tasks
│   ├── gateway-tool.ts             # Gateway RPC methods
│   ├── web-search.ts               # Web search
│   ├── web-fetch.ts                # URL fetching
│   ├── image-tool.ts               # Image generation
│   ├── tts-tool.ts                 # Text-to-speech
│   ├── sessions-list-tool.ts       # Session listing
│   ├── sessions-history-tool.ts    # Session history
│   ├── sessions-send-tool.ts       # Sending to sessions
│   ├── sessions-spawn-tool.ts      # Creating subagents
│   ├── agents-list-tool.ts         # Agent listing
│   ├── subagents-tool.ts           # Subagent management
│   ├── session-status-tool.ts      # Session status
│   ├── common.ts                   # Common utilities & types
├── bash-tools.ts                   # Exec/process tools
├── openclaw-tools.ts               # OpenClaw tool factory
├── pi-tools.ts                     # Main tool creation entry point
├── pi-tools.policy.ts              # Tool policy resolution
├── pi-tools.schema.ts              # Schema normalization
├── pi-tools.before-tool-call.ts    # Hook wrapping
├── pi-tool-definition-adapter.ts   # LLM integration
```

---

## 6. System Prompt / Tool Injection

### Tool Schema Normalization for Providers

OpenClaw automatically normalizes tool schemas based on the LLM provider to ensure compatibility.

**File:** `/Users/sethlim/Documents/openclaw/src/agents/pi-tools.schema.ts` (lines 65-194)

```typescript
export function normalizeToolParameters(
  tool: AnyAgentTool,
  options?: { modelProvider?: string },
): AnyAgentTool {
  const schema =
    tool.parameters && typeof tool.parameters === "object"
      ? (tool.parameters as Record<string, unknown>)
      : undefined;
  if (!schema) {
    return tool;
  }

  // Provider quirks:
  // - Gemini rejects several JSON Schema keywords, so we scrub those.
  // - OpenAI rejects function tool schemas unless the *top-level* is `type: "object"`.
  //   (TypeBox root unions compile to `{ anyOf: [...] }` without `type`).
  // - Anthropic (google-antigravity) expects full JSON Schema draft 2020-12 compliance.

  const isGeminiProvider =
    options?.modelProvider?.toLowerCase().includes("google") ||
    options?.modelProvider?.toLowerCase().includes("gemini");
  const isAnthropicProvider =
    options?.modelProvider?.toLowerCase().includes("anthropic") ||
    options?.modelProvider?.toLowerCase().includes("google-antigravity");

  // If schema already has type + properties (no top-level anyOf to merge),
  // clean it for Gemini compatibility (but only if using Gemini, not Anthropic)
  if ("type" in schema && "properties" in schema && !Array.isArray(schema.anyOf)) {
    return {
      ...tool,
      parameters: isGeminiProvider && !isAnthropicProvider ? cleanSchemaForGemini(schema) : schema,
    };
  }

  // Some tool schemas (esp. unions) may omit `type` at the top-level. If we see
  // object-ish fields, force `type: "object"` so OpenAI accepts the schema.
  if (
    !("type" in schema) &&
    (typeof schema.properties === "object" || Array.isArray(schema.required)) &&
    !Array.isArray(schema.anyOf) &&
    !Array.isArray(schema.oneOf)
  ) {
    const schemaWithType = { ...schema, type: "object" };
    return {
      ...tool,
      parameters:
        isGeminiProvider && !isAnthropicProvider
          ? cleanSchemaForGemini(schemaWithType)
          : schemaWithType,
    };
  }

  const variantKey = Array.isArray(schema.anyOf)
    ? "anyOf"
    : Array.isArray(schema.oneOf)
      ? "oneOf"
      : null;
  if (!variantKey) {
    return tool;
  }
  const variants = schema[variantKey] as unknown[];
  const mergedProperties: Record<string, unknown> = {};
  const requiredCounts = new Map<string, number>();
  let objectVariants = 0;

  for (const entry of variants) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const props = (entry as { properties?: unknown }).properties;
    if (!props || typeof props !== "object") {
      continue;
    }
    objectVariants += 1;
    for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
      if (!(key in mergedProperties)) {
        mergedProperties[key] = value;
        continue;
      }
      mergedProperties[key] = mergePropertySchemas(mergedProperties[key], value);
    }
    const required = Array.isArray((entry as { required?: unknown }).required)
      ? (entry as { required: unknown[] }).required
      : [];
    for (const key of required) {
      if (typeof key !== "string") {
        continue;
      }
      requiredCounts.set(key, (requiredCounts.get(key) ?? 0) + 1);
    }
  }

  const baseRequired = Array.isArray(schema.required)
    ? schema.required.filter((key) => typeof key === "string")
    : undefined;
  const mergedRequired =
    baseRequired && baseRequired.length > 0
      ? baseRequired
      : objectVariants > 0
        ? Array.from(requiredCounts.entries())
            .filter(([, count]) => count === objectVariants)
            .map(([key]) => key)
        : undefined;

  const nextSchema: Record<string, unknown> = { ...schema };
  const flattenedSchema = {
    type: "object",
    ...(typeof nextSchema.title === "string" ? { title: nextSchema.title } : {}),
    ...(typeof nextSchema.description === "string" ? { description: nextSchema.description } : {}),
    properties:
      Object.keys(mergedProperties).length > 0 ? mergedProperties : (schema.properties ?? {}),
    ...(mergedRequired && mergedRequired.length > 0 ? { required: mergedRequired } : {}),
    additionalProperties: "additionalProperties" in schema ? schema.additionalProperties : true,
  };

  return {
    ...tool,
    // Flatten union schemas into a single object schema:
    // - Gemini doesn't allow top-level `type` together with `anyOf`.
    // - OpenAI rejects schemas without top-level `type: "object"`.
    // - Anthropic accepts proper JSON Schema with constraints.
    // Merging properties preserves useful enums like `action` while keeping schemas portable.
    parameters:
      isGeminiProvider && !isAnthropicProvider
        ? cleanSchemaForGemini(flattenedSchema)
        : flattenedSchema,
  };
}
```

### Tool Name Normalization

**File:** `/Users/sethlim/Documents/openclaw/src/agents/tool-policy.ts`

```typescript
export function normalizeToolName(input: string): string {
  // Normalize to lowercase, replace hyphens/underscores with consistent format
  return input.trim().toLowerCase().replace(/[-_]/g, "");
}
```

### Tool Name Sanitization for Providers

**File:** `/Users/sethlim/Documents/openclaw/src/agents/tool-call-id.ts` (lines 4-42)

```typescript
export type ToolCallIdMode = "strict" | "strict9";

const STRICT9_LEN = 9;
const TOOL_CALL_TYPES = new Set(["toolCall", "toolUse", "functionCall"]);

export type ToolCallLike = {
  id: string;
  name?: string;
};

/**
 * Sanitize a tool call ID to be compatible with various providers.
 *
 * - "strict" mode: only [a-zA-Z0-9]
 * - "strict9" mode: only [a-zA-Z0-9], length 9 (Mistral tool call requirement)
 */
export function sanitizeToolCallId(id: string, mode: ToolCallIdMode = "strict"): string {
  if (!id || typeof id !== "string") {
    if (mode === "strict9") {
      return "defaultid";
    }
    return "defaulttoolid";
  }

  if (mode === "strict9") {
    const alphanumericOnly = id.replace(/[^a-zA-Z0-9]/g, "");
    if (alphanumericOnly.length >= STRICT9_LEN) {
      return alphanumericOnly.slice(0, STRICT9_LEN);
    }
    if (alphanumericOnly.length > 0) {
      return shortHash(alphanumericOnly, STRICT9_LEN);
    }
    return shortHash("sanitized", STRICT9_LEN);
  }

  // Some providers require strictly alphanumeric tool call IDs.
  const alphanumericOnly = id.replace(/[^a-zA-Z0-9]/g, "");
  return alphanumericOnly.length > 0 ? alphanumericOnly : "sanitizedtoolid";
}
```

---

## 7. Error Handling

### Tool Execution Error Handling

**File:** `/Users/sethlim/Documents/openclaw/src/agents/pi-tool-definition-adapter.ts` (lines 54-63, 139-185)

```typescript
function describeToolExecutionError(err: unknown): {
  message: string;
  stack?: string;
} {
  if (err instanceof Error) {
    const message = err.message?.trim() ? err.message : String(err);
    return { message, stack: err.stack };
  }
  return { message: String(err) };
}

// In execute function:
catch (err) {
  if (signal?.aborted) {
    throw err;
  }
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name?: unknown }).name)
      : "";
  if (name === "AbortError") {
    throw err;
  }
  if (beforeHookWrapped) {
    consumeAdjustedParamsForToolCall(toolCallId);
  }
  const described = describeToolExecutionError(err);
  if (described.stack && described.stack !== described.message) {
    logDebug(`tools: ${normalizedName} failed stack:\n${described.stack}`);
  }
  logError(`[tools] ${normalizedName} failed: ${described.message}`);

  const errorResult = jsonResult({
    status: "error",
    tool: normalizedName,
    error: described.message,
  });

  // Call after_tool_call hook for errors too
  const hookRunner = getGlobalHookRunner();
  if (hookRunner?.hasHooks("after_tool_call")) {
    try {
      await hookRunner.runAfterToolCall(
        {
          toolName: normalizedName,
          params: isPlainObject(params) ? params : {},
          error: described.message,
        },
        { toolName: normalizedName },
      );
    } catch (hookErr) {
      logDebug(
        `after_tool_call hook failed: tool=${normalizedName} error=${String(hookErr)}`,
      );
    }
  }

  return errorResult;
}
```

### Input Validation Error Class

**File:** `/Users/sethlim/Documents/openclaw/src/agents/tools/common.ts` (lines 22-74)

```typescript
export class ToolInputError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

export function readStringParam(
  params: Record<string, unknown>,
  key: string,
  options: StringParamOptions & { required: true },
): string;
export function readStringParam(
  params: Record<string, unknown>,
  key: string,
  options?: StringParamOptions,
): string | undefined;
export function readStringParam(
  params: Record<string, unknown>,
  key: string,
  options: StringParamOptions = {},
) {
  const { required = false, trim = true, label = key, allowEmpty = false } = options;
  const raw = params[key];
  if (typeof raw !== "string") {
    if (required) {
      throw new ToolInputError(`${label} required`);
    }
    return undefined;
  }
  const value = trim ? raw.trim() : raw;
  if (!value && !allowEmpty) {
    if (required) {
      throw new ToolInputError(`${label} required`);
    }
    return undefined;
  }
  return value;
}
```

### Tool Loop Detection and Blocking

**File:** `/Users/sethlim/Documents/openclaw/src/agents/pi-tools.before-tool-call.ts` (lines 43-72, 93-130)

```typescript
async function recordLoopOutcome(args: {
  ctx?: HookContext;
  toolName: string;
  toolParams: unknown;
  toolCallId?: string;
  result?: unknown;
  error?: unknown;
}): Promise<void> {
  if (!args.ctx?.sessionKey) {
    return;
  }
  try {
    const { getDiagnosticSessionState } = await import("../logging/diagnostic-session-state.js");
    const { recordToolCallOutcome } = await import("./tool-loop-detection.js");
    const sessionState = getDiagnosticSessionState({
      sessionKey: args.ctx.sessionKey,
      sessionId: args.ctx?.agentId,
    });
    recordToolCallOutcome(sessionState, {
      toolName: args.toolName,
      toolParams: args.toolParams,
      toolCallId: args.toolCallId,
      result: args.result,
      error: args.error,
      config: args.ctx.loopDetection,
    });
  } catch (err) {
    log.warn(`tool loop outcome tracking failed: tool=${args.toolName} error=${String(err)}`);
  }
}

// In hook:
const loopResult = detectToolCallLoop(sessionState, toolName, params, args.ctx.loopDetection);

if (loopResult.stuck) {
  if (loopResult.level === "critical") {
    log.error(`Blocking ${toolName} due to critical loop: ${loopResult.message}`);
    logToolLoopAction({
      sessionKey: args.ctx.sessionKey,
      sessionId: args.ctx?.agentId,
      toolName,
      level: "critical",
      action: "block",
      detector: loopResult.detector,
      count: loopResult.count,
      message: loopResult.message,
      pairedToolName: loopResult.pairedToolName,
    });
    return {
      blocked: true,
      reason: loopResult.message,
    };
  } else {
    const warningKey = loopResult.warningKey ?? `${loopResult.detector}:${toolName}`;
    if (shouldEmitLoopWarning(sessionState, warningKey, loopResult.count)) {
      log.warn(`Loop warning for ${toolName}: ${loopResult.message}`);
      logToolLoopAction({
        sessionKey: args.ctx.sessionKey,
        sessionId: args.ctx?.agentId,
        toolName,
        level: "warning",
        action: "warn",
        detector: loopResult.detector,
        count: loopResult.count,
        message: loopResult.message,
        pairedToolName: loopResult.pairedToolName,
      });
    }
  }
}
```

### Hook Error Handling

All hook failures are caught and logged without crashing the tool execution:

```typescript
try {
  const normalizedParams = isPlainObject(params) ? params : {};
  const hookResult = await hookRunner.runBeforeToolCall(
    {
      toolName,
      params: normalizedParams,
    },
    {
      toolName,
      agentId: args.ctx?.agentId,
      sessionKey: args.ctx?.sessionKey,
    },
  );

  if (hookResult?.block) {
    return {
      blocked: true,
      reason: hookResult.blockReason || "Tool call blocked by plugin hook",
    };
  }

  if (hookResult?.params && isPlainObject(hookResult.params)) {
    if (isPlainObject(params)) {
      return { blocked: false, params: { ...params, ...hookResult.params } };
    }
    return { blocked: false, params: hookResult.params };
  }
} catch (err) {
  const toolCallId = args.toolCallId ? ` toolCallId=${args.toolCallId}` : "";
  log.warn(`before_tool_call hook failed: tool=${toolName}${toolCallId} error=${String(err)}`);
}

return { blocked: false, params };
```

---

## 8. Unique Patterns

### A. Multi-Layer Policy Pipeline

OpenClaw uses a sophisticated policy cascade where each layer can further restrict (but not expand) tool availability:

**File:** `/Users/sethlim/Documents/openclaw/src/agents/pi-tools.ts` (lines 463-483)

```typescript
const subagentFiltered = applyToolPolicyPipeline({
  tools: toolsByAuthorization,
  toolMeta: (tool) => getPluginToolMeta(tool),
  warn: logWarn,
  steps: [
    ...buildDefaultToolPolicyPipelineSteps({
      profilePolicy: profilePolicyWithAlsoAllow,
      profile,
      providerProfilePolicy: providerProfilePolicyWithAlsoAllow,
      providerProfile,
      globalPolicy,
      globalProviderPolicy,
      agentPolicy,
      agentProviderPolicy,
      groupPolicy,
      agentId,
    }),
    { policy: sandbox?.tools, label: "sandbox tools.allow" },
    { policy: subagentPolicy, label: "subagent tools.allow" },
  ],
});
```

**Policy Layers (in order of application):**
1. **Tool Profile** (minimal, coding, messaging, full)
2. **Global Policy** (allow/deny lists)
3. **Provider Policy** (provider-specific overrides)
4. **Agent-Specific Policy** (per-agent overrides)
5. **Group Policy** (channel/sender-level restrictions)
6. **Sandbox Policy** (container isolation)
7. **Subagent Policy** (depth-based restrictions)
8. **Owner-Only Policy** (sender authorization)

### B. Parameter Adjustment and Caching

The system caches adjusted parameters by tool call ID, allowing the before-hook wrapper to adjust parameters once and have the adapter reuse them:

```typescript
const adjustedParamsByToolCallId = new Map<string, unknown>();
const MAX_TRACKED_ADJUSTED_PARAMS = 1024;

export function consumeAdjustedParamsForToolCall(toolCallId: string): unknown {
  const params = adjustedParamsByToolCallId.get(toolCallId);
  adjustedParamsByToolCallId.delete(toolCallId);
  return params;
}
```

### C. Dual Wrapping Strategy

Tools can be wrapped at two points:
1. **Wrapping Layer 1:** `wrapToolWithBeforeToolCallHook` - adds loop detection
2. **Wrapping Layer 2:** `wrapToolWithAbortSignal` - adds abort handling

The adapter detects if a tool is already wrapped to avoid double-wrapping:

```typescript
const beforeHookWrapped = isToolWrappedWithBeforeToolCallHook(tool);
if (!beforeHookWrapped) {
  const hookOutcome = await runBeforeToolCallHook({...});
}
```

### D. Provider-Aware Schema Flattening

Union-based tool schemas (common in TypeBox) are intelligently flattened for OpenAI/Gemini compatibility while preserving schema integrity for Anthropic:

```typescript
// Flatten union schemas into a single object schema:
// - Gemini doesn't allow top-level `type` together with `anyOf`.
// - OpenAI rejects schemas without top-level `type: "object"`.
// - Anthropic accepts proper JSON Schema with constraints.
// Merging properties preserves useful enums like `action` while keeping schemas portable.
parameters:
  isGeminiProvider && !isAnthropicProvider
    ? cleanSchemaForGemini(flattenedSchema)
    : flattenedSchema,
```

### E. Plugin Metadata Tagging with WeakMap

Plugin tools are tagged with metadata via a `WeakMap` to avoid modifying the tool object itself:

```typescript
const pluginToolMeta = new WeakMap<AnyAgentTool, PluginToolMeta>();

export function getPluginToolMeta(tool: AnyAgentTool): PluginToolMeta | undefined {
  return pluginToolMeta.get(tool);
}

// In plugin resolution:
pluginToolMeta.set(tool, {
  pluginId: entry.pluginId,
  optional: entry.optional,
});
```

### F. Fast Path for Disabled Plugins

When plugins are disabled, the entire plugin discovery system is skipped:

```typescript
const effectiveConfig = applyTestPluginDefaults(params.context.config ?? {}, process.env);
const normalized = normalizePluginsConfig(effectiveConfig.plugins);
if (!normalized.enabled) {
  return [];  // Fast path: no plugin loading
}
```

### G. Tool Execution Signature Normalization

The system normalizes tool execution signatures to handle both legacy (5-arg) and current (4-arg) formats:

```typescript
type ToolExecuteArgsCurrent = [
  string,
  unknown,
  AbortSignal | undefined,
  AgentToolUpdateCallback<unknown> | undefined,
  unknown,
];
type ToolExecuteArgsLegacy = [
  string,
  unknown,
  AgentToolUpdateCallback<unknown> | undefined,
  unknown,
  AbortSignal | undefined,
];

function isLegacyToolExecuteArgs(args: ToolExecuteArgsAny): args is ToolExecuteArgsLegacy {
  const third = args[2];
  const fifth = args[4];
  if (typeof third === "function") {
    return true;
  }
  return isAbortSignal(fifth);
}
```

### H. Hook Runner Pattern

Global hook runners maintain state across all tool executions in a session:

```typescript
const hookRunner = getGlobalHookRunner();
if (hookRunner?.hasHooks("before_tool_call")) {
  const hookResult = await hookRunner.runBeforeToolCall({...});
}

if (hookRunner?.hasHooks("after_tool_call")) {
  await hookRunner.runAfterToolCall({...});
}
```

---

## Architecture Summary

### Overall Flow

```
LLM requests tool call
        ↓
Tool call arrives at agent runtime
        ↓
toToolDefinitions() converts AnyAgentTool[] to ToolDefinition[]
        ↓
Tool's execute() function is invoked
        ↓
runBeforeToolCallHook() checks loop detection, blocks if needed, adjusts params
        ↓
tool.execute() runs with adjusted params
        ↓
After execution, runAfterToolCall() hook fires
        ↓
Result formatted and returned to LLM
```

### LLM Provider Support

| Provider | Tool Support | Schema Handling | Notes |
|----------|--------------|-----------------|-------|
| **Anthropic** | Full | Full JSON Schema draft 2020-12 | Expects complete schema validation |
| **OpenAI** | Full | Flattened to object with `type: "object"` | Rejects unions at top level |
| **Google Gemini** | Full | Flattened, constraint keywords removed | Rejects `anyOf`/`oneOf` with `type` |
| **OpenAI-Codex** | Limited | OpenAI-compatible | Legacy provider |
| **Mistral** | Full | Strict alphanumeric tool call IDs (9 chars max) | Special ID sanitization required |

---

## Configuration Files

The tool system is configured through `openclaw.config.ts` (or `openclaw.config.json`):

```typescript
export const config: OpenClawConfig = {
  tools: {
    // Global tool policy
    profile: "coding",
    allow: ["read", "write", "exec"],
    deny: ["bash"],
    alsoAllow: ["web_search"],
    
    // Provider-specific overrides
    byProvider: {
      "anthropic": { profile: "full" },
      "openai/gpt-5": { deny: ["exec"] },
    },
    
    // Exec tool defaults
    exec: {
      host: "sandbox",
      security: "allowlist",
      timeoutSec: 30,
      applyPatch: { enabled: true, workspaceOnly: true },
    },
    
    // Filesystem restrictions
    fs: {
      workspaceOnly: true,
    },
    
    // Loop detection
    loopDetection: {
      enabled: true,
      criticalThreshold: 20,
      detectors: {
        genericRepeat: true,
        pingPong: true,
      },
    },
    
    // Web tools
    web: {
      search: { enabled: true, provider: "brave" },
      fetch: { enabled: true, maxChars: 10000 },
    },
  },
  
  agents: {
    list: [
      {
        id: "main",
        workspace: "~/openclaw",
        tools: {
          profile: "messaging",
          deny: ["exec"],
          elevated: {
            enabled: true,
            allowFrom: { whatsapp: ["+15555550123"] },
          },
        },
      },
    ],
  },
};
```

---

## Conclusion

OpenClaw's tool infrastructure is highly sophisticated, featuring:

1. **Plugin-based extensibility** with safe failure modes
2. **Multi-layer policy enforcement** with cascading restrictions
3. **Provider-aware schema normalization** for Anthropic, OpenAI, Google, and Mistral
4. **Comprehensive hook system** for pre/post-execution customization
5. **Tool loop detection** to prevent stuck patterns
6. **Sandbox-aware execution** with filesystem bridges
7. **Clean separation of concerns** between tool definition, registration, execution, and result handling

The system prioritizes **security by default** (restrictive policies), **composability** (plugin system), and **compatibility** (provider-specific handling) while maintaining a simple mental model for developers.