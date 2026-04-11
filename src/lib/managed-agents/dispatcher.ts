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

export async function dispatchCustomTool(
  event: CustomToolUseEvent,
  context: DispatchContext,
): Promise<CustomToolResultContent> {
  const tool = (MANAGED_AGENT_TOOLS as Record<string, (typeof MANAGED_AGENT_TOOLS)[keyof typeof MANAGED_AGENT_TOOLS]>)[event.name];

  if (!tool) {
    return asContent(
      { success: false, error: `Unknown tool: ${event.name}` },
      event.id,
      true,
    );
  }

  if (tool.chatOnly && !context.isChatContext) {
    return asContent(
      { success: false, error: "Tool not available in trigger runs." },
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
