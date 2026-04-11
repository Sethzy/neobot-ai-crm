/**
 * Top-level registry of managed-agent custom tools.
 *
 * @module lib/managed-agents/tools
 */
import { MANAGED_AGENT_TOOL_DECLARATIONS } from "./declarations";

function toManagedAgentToolRegistry<
  const TTools extends readonly { name: string }[],
>(
  tools: TTools,
): { [TTool in TTools[number] as TTool["name"]]: TTool } {
  return Object.fromEntries(
    tools.map((tool) => [tool.name, tool]),
  ) as { [TTool in TTools[number] as TTool["name"]]: TTool };
}

export const MANAGED_AGENT_TOOLS = toManagedAgentToolRegistry(
  MANAGED_AGENT_TOOL_DECLARATIONS,
);

export type ManagedAgentToolName = keyof typeof MANAGED_AGENT_TOOLS;

export {
  MANAGED_AGENT_TOOL_DECLARATIONS,
  MANAGED_AGENT_TOOL_NAMES,
} from "./declarations";
export type { ManagedAgentTool, ToolContext, ToolResult } from "./types";
