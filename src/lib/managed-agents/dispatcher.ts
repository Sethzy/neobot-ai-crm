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

import type {
  CustomToolResultContent,
  CustomToolUseEvent,
  DispatchContext,
  ToolResult,
} from "./types";

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
  const tool = (MANAGED_AGENT_TOOLS as unknown as Record<string, RegistryEntry>)[
    event.name
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

  const parsed = tool.inputSchema.safeParse(event.input);
  if (!parsed.success) {
    return asContent(
      {
        success: false,
        error: `Invalid input for ${event.name}: ${parsed.error.message}`,
      },
      event.id,
      true,
    );
  }

  const result = (await tool.execute(parsed.data, context)) as ToolResult;
  return asContent(result, event.id, result.success === false);
}
