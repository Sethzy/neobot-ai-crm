/**
 * Executes Anthropic custom tool calls against the MANAGED_AGENT_TOOLS registry.
 *
 * Returns a `user.custom_tool_result` content payload suitable for `events.send`.
 * Enforces the chatOnly guard (tools flagged chat-only are rejected when invoked
 * from a trigger / non-chat context such as a Trigger.dev listener task).
 *
 * @module lib/managed-agents/dispatcher
 */
import { MANAGED_AGENT_TOOLS } from "@/lib/managed-agents/tools";
import { toInternalManagedAgentToolName } from "@/lib/managed-agents/tool-name-aliases";

import type {
  CustomToolResultContent,
  CustomToolUseEvent,
  DispatchContext,
  ToolResult,
} from "./types";

/**
 * Trim arrays that the LLM occasionally over-generates for ask_user_question
 * so the Zod `.max()` constraints (which the LLM sees in the JSON schema)
 * don't hard-reject on first attempt. Keeps the schema limits authoritative
 * for the LLM while being forgiving at runtime.
 */
function coerceAskUserQuestionInput(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;

  const record = input as Record<string, unknown>;
  const questions = record.questions;
  if (!Array.isArray(questions)) return input;

  return {
    ...record,
    questions: questions.slice(0, 3).map((q) => {
      if (q && typeof q === "object" && "options" in q && Array.isArray((q as Record<string, unknown>).options)) {
        return { ...q, options: ((q as Record<string, unknown>).options as unknown[]).slice(0, 4) };
      }
      return q;
    }),
  };
}

function coerceCreateConnectionInput(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;

  const record = input as Record<string, unknown>;
  const integrations = record.integrations;
  if (!Array.isArray(integrations)) return input;

  return {
    ...record,
    integrations: integrations.map((integration) => {
      if (typeof integration === "string") {
        return integration;
      }

      if (!integration || typeof integration !== "object") {
        return integration;
      }

      const integrationRecord = integration as Record<string, unknown>;
      const provider =
        integrationRecord.integrationId ??
        integrationRecord.provider ??
        integrationRecord.name;

      return typeof provider === "string" ? provider : integration;
    }),
  };
}

function asContent(
  result: ToolResult,
  toolUseId: string,
  isError: boolean,
): CustomToolResultContent {
  return {
    custom_tool_use_id: toolUseId,
    content: [{ type: "text", text: JSON.stringify(result) }],
    ...(isError ? { is_error: true } : {}),
  };
}

/**
 * The registry is typed with a discriminated key→value map for each
 * concrete tool. The dispatcher operates dynamically by tool name, so
 * we narrow to a permissive `RegistryEntry` shape that matches every
 * value in the map but lets us call `execute(input, context)` without
 * having to enumerate every variant.
 */
type RegistryEntry = {
  name: string;
  inputSchema: { safeParse(input: unknown): { success: true; data: unknown } | { success: false; error: { message: string } } };
  chatOnly?: boolean;
  execute: (input: unknown, context: DispatchContext) => Promise<unknown>;
};

export async function dispatchCustomTool(
  event: CustomToolUseEvent,
  context: DispatchContext,
): Promise<CustomToolResultContent> {
  const internalToolName = toInternalManagedAgentToolName(event.name);
  const tool = (MANAGED_AGENT_TOOLS as unknown as Record<string, RegistryEntry>)[
    internalToolName
  ];

  if (!tool) {
    return asContent(
      { success: false, error: `Unknown tool: ${event.name}` },
      event.id,
      true,
    );
  }

  if (tool.chatOnly && !context.isChatContext) {
    const triggerError = event.name === "run_sql" || event.name === "get_agent_db_schema"
      ? "Tool not available in trigger runs. Use search_crm instead."
      : "Tool not available in trigger runs.";
    return asContent(
      { success: false, error: triggerError },
      event.id,
      true,
    );
  }

  const input = internalToolName === "ask_user_question"
    ? coerceAskUserQuestionInput(event.input)
    : internalToolName === "create_connection"
      ? coerceCreateConnectionInput(event.input)
    : event.input;
  const parsed = tool.inputSchema.safeParse(input);
  if (!parsed.success) {
    return asContent(
      {
        success: false,
        error: `Invalid input for ${internalToolName}: ${parsed.error.message}`,
      },
      event.id,
      true,
    );
  }

  const result = (await tool.execute(parsed.data, context)) as ToolResult;
  return asContent(result, event.id, result.success === false);
}
