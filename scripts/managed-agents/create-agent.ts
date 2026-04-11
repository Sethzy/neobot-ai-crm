/**
 * Repo-owned bootstrap for the Sunder Managed Agent in Anthropic.
 *
 * If `ANTHROPIC_AGENT_ID` is unset, this script creates the agent. If it is
 * set, the script retrieves the latest version and publishes an update using
 * the canonical tool declarations from `src/lib/managed-agents/tools`.
 *
 * Run once per environment (dev / staging / prod), then store BOTH
 * `ANTHROPIC_AGENT_ID` and `ANTHROPIC_AGENT_VERSION` in environment
 * variables. Sessions pin to the exact version.
 *
 * Usage:
 *   pnpm tsx scripts/managed-agents/create-agent.ts
 *
 * @module scripts/managed-agents/create-agent
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentCreateParams,
  BetaManagedAgentsAgent,
  BetaManagedAgentsAgentToolset20260401Params,
  BetaManagedAgentsCustomToolInputSchema,
  BetaManagedAgentsCustomToolParams,
  BetaManagedAgentsSkillParams,
} from "@anthropic-ai/sdk/resources/beta/agents/agents";
import * as z from "zod";

import {
  MANAGED_AGENT_TOOL_DECLARATIONS,
  MANAGED_AGENT_TOOL_NAMES,
} from "@/lib/managed-agents/tools";

const MANAGED_AGENT_NAME = "sunder-chat-agent";
const MANAGED_AGENT_DESCRIPTION =
  "Sunder autopilot for advisory-sales practitioners. Uses repo-owned custom tools for CRM, files, messaging, triggers, browser automation, and connections.";
const MANAGED_AGENT_MODEL = "claude-sonnet-4-6";

const BUILT_IN_TOOLSET: BetaManagedAgentsAgentToolset20260401Params = {
  type: "agent_toolset_20260401",
  default_config: {
    permission_policy: { type: "always_allow" },
  },
  configs: [
    { name: "bash", permission_policy: { type: "always_ask" } },
    { name: "web_fetch", enabled: false },
    { name: "web_search", enabled: false },
  ],
};

const MANAGED_AGENT_SKILLS: BetaManagedAgentsSkillParams[] = [
  { type: "anthropic", skill_id: "xlsx" },
  { type: "anthropic", skill_id: "docx" },
  { type: "anthropic", skill_id: "pptx" },
  { type: "anthropic", skill_id: "pdf" },
];

const MANAGED_AGENT_SYSTEM = [
  "You are Sunder, an autopilot for solo practitioners in advisory sales.",
  "Your job is to do the work: update the CRM, handle follow-up, prepare briefings, manage files, send messages, and keep the user's operating context current.",
  "Prefer concrete tool use over describing what could be done. Use the Sunder custom tools for CRM, storage, connections, triggers, browser work, meetings, market data, and messaging.",
  "Internal work can run automatically. External-facing actions may require approval. When approval is required, explain the action briefly and wait.",
  "Use `search_crm` before mutating records when the target is ambiguous. Avoid duplicate writes and keep CRM state tidy.",
  "Use `/agent/*` files as durable operating context. Read before writing when freshness matters, and write only the minimal durable update that improves future runs.",
  "In trigger runs, do not use `run_sql`, `get_agent_db_schema`, `ask_user_question`, `create_connection`, or `reauthorize_connection`. Use `search_crm` for data lookups in triggers.",
  "The built-in `web_fetch` and `web_search` tools are disabled on purpose. Use Sunder's `web_search`, `web_scrape`, and browser tools instead.",
  "Keep user-facing responses concise, factual, and operationally useful.",
  `Available Sunder custom tools: ${MANAGED_AGENT_TOOL_NAMES.join(", ")}.`,
].join("\n\n");

function toCustomToolParams(
  declaration: (typeof MANAGED_AGENT_TOOL_DECLARATIONS)[number],
): BetaManagedAgentsCustomToolParams {
  const jsonSchema = z.toJSONSchema(declaration.inputSchema, { reused: "ref" });

  if (jsonSchema.type !== "object") {
    throw new Error(
      `Tool "${declaration.name}" must use an object Zod schema, got ${String(jsonSchema.type)}.`,
    );
  }

  return {
    type: "custom",
    name: declaration.name,
    description: declaration.description,
    input_schema: jsonSchema as BetaManagedAgentsCustomToolInputSchema,
  };
}

function buildAgentPayload(): AgentCreateParams {
  const customTools = MANAGED_AGENT_TOOL_DECLARATIONS.map(toCustomToolParams);

  return {
    name: MANAGED_AGENT_NAME,
    description: MANAGED_AGENT_DESCRIPTION,
    model: MANAGED_AGENT_MODEL,
    system: MANAGED_AGENT_SYSTEM,
    tools: [BUILT_IN_TOOLSET, ...customTools],
    skills: MANAGED_AGENT_SKILLS,
  };
}

async function createOrUpdateAgent(
  client: Anthropic,
): Promise<{ mode: "created" | "updated"; agent: BetaManagedAgentsAgent }> {
  const payload = buildAgentPayload();
  const existingAgentId = process.env.ANTHROPIC_AGENT_ID?.trim();

  if (!existingAgentId) {
    const agent = await client.beta.agents.create(payload);
    return { mode: "created", agent };
  }

  const existingAgent = await client.beta.agents.retrieve(existingAgentId);
  const agent = await client.beta.agents.update(existingAgentId, {
    version: existingAgent.version,
    name: payload.name,
    description: payload.description,
    model: payload.model,
    system: payload.system,
    tools: payload.tools,
    skills: payload.skills,
  });

  return { mode: "updated", agent };
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Source .env.local or export it before running.",
    );
  }

  const client = new Anthropic({ apiKey });
  const result = await createOrUpdateAgent(client);

  console.log("=".repeat(60));
  console.log(`Sunder Managed Agent ${result.mode}.`);
  console.log("=".repeat(60));
  console.log(`ANTHROPIC_AGENT_ID=${result.agent.id}`);
  console.log(`ANTHROPIC_AGENT_VERSION=${result.agent.version}`);
  console.log(`CUSTOM_TOOL_COUNT=${MANAGED_AGENT_TOOL_DECLARATIONS.length}`);
  console.log(`CUSTOM_TOOL_NAMES=${MANAGED_AGENT_TOOL_NAMES.join(",")}`);
  console.log("");
  console.log("Store BOTH values in .env.local and the matching deployment environment.");
  console.log("Sessions must pin to this exact version; do not use latest in production.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
