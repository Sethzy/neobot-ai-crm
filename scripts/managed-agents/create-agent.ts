/**
 * Repo-owned bootstrap for the Sunder Managed Agent in Anthropic.
 *
 * If `ANTHROPIC_AGENT_ID` is unset, this script creates the agent. If it is
 * set, the script retrieves the latest version and publishes an update using
 * the canonical tool declarations from `src/lib/managed-agents/tools`.
 *
 * Run once per model per environment (dev / staging / prod), then store
 * the agent ID and version in the corresponding environment variables.
 * Sessions pin to the exact version.
 *
 * Usage:
 *   pnpm tsx scripts/managed-agents/create-agent.ts                       # default: claude-sonnet-4-6
 *   pnpm tsx scripts/managed-agents/create-agent.ts --model claude-haiku-4-5
 *   pnpm tsx scripts/managed-agents/create-agent.ts --model claude-opus-4-6
 *
 * @module scripts/managed-agents/create-agent
 */
import path from "node:path";

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
import { toPublishedManagedAgentToolName } from "@/lib/managed-agents/tool-name-aliases";

import { loadManagedAgentSkills } from "./load-managed-agent-skills";

const ALLOWED_MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-6"] as const;
type AllowedModel = (typeof ALLOWED_MODELS)[number];

/** Maps Anthropic model ID → env-var suffix for the agent ID/version pair. */
const MODEL_ENV_SUFFIX: Record<AllowedModel, string> = {
  "claude-sonnet-4-6": "SONNET",
  "claude-haiku-4-5": "HAIKU",
  "claude-opus-4-6": "OPUS",
};

/** Maps Anthropic model ID → human-readable short name for the agent name. */
const MODEL_SHORT_NAME: Record<AllowedModel, string> = {
  "claude-sonnet-4-6": "sonnet",
  "claude-haiku-4-5": "haiku",
  "claude-opus-4-6": "opus",
};

function parseModelArg(): AllowedModel {
  const idx = process.argv.indexOf("--model");
  if (idx === -1 || !process.argv[idx + 1]) {
    return "claude-sonnet-4-6";
  }
  const raw = process.argv[idx + 1];
  if (!ALLOWED_MODELS.includes(raw as AllowedModel)) {
    throw new Error(
      `Invalid --model "${raw}". Allowed: ${ALLOWED_MODELS.join(", ")}`,
    );
  }
  return raw as AllowedModel;
}

const SELECTED_MODEL = parseModelArg();

const MANAGED_AGENT_NAME = `sunder-chat-agent-${MODEL_SHORT_NAME[SELECTED_MODEL]}`;
const MANAGED_AGENT_DESCRIPTION =
  "Sunder autopilot for advisory-sales practitioners. Uses repo-owned custom tools for CRM, files, messaging, triggers, browser automation, and connections.";
const MANAGED_AGENT_MODEL = SELECTED_MODEL;

const SKILL_REGISTRY_PATH = path.join(
  process.cwd(),
  "scripts",
  "managed-agents",
  "skill-registry.json",
);
const MANAGED_AGENT_SKILLS: BetaManagedAgentsSkillParams[] =
  loadManagedAgentSkills(SKILL_REGISTRY_PATH);
const PUBLISHED_MANAGED_AGENT_TOOL_NAMES = MANAGED_AGENT_TOOL_NAMES.map(
  toPublishedManagedAgentToolName,
);

const MANAGED_AGENT_SYSTEM = `\
You are Sunder, an autopilot for solo practitioners in advisory sales.

## Role

Your job is to do the work: update the CRM, handle follow-up, prepare briefings, manage files, send messages, and keep the user's operating context current. Prefer concrete tool use over describing what could be done.

## Tools

You have two sets of tools available:

- **Sunder custom tools** — CRM, storage, connections, triggers, browser work, meetings, market data, and messaging. Use these for all domain-specific operations.
- **Built-in tools** — bash, read, write, edit, glob, grep, web_fetch, web_search. Use these for general file operations, code execution, and web lookups.

For web search and scraping, prefer Sunder's \`sunder_web_search\` and \`web_scrape\` tools for structured results. Use built-in \`web_search\` and \`web_fetch\` as fallbacks or for quick lookups.

Available Sunder custom tools: ${PUBLISHED_MANAGED_AGENT_TOOL_NAMES.join(", ")}.

## Filesystem

You operate across two filesystems with different lifetimes:

- **Session filesystem** (\`/mnt/session/uploads/*\`, \`/mnt/session/outputs/*\`): Ephemeral — tied to this session. Use built-in tools (read, write, edit, bash, glob, grep) to work with these paths. This is your scratchpad for analysis, transformation, and artifact generation.
- **Durable workspace** (\`/agent/*\`): Persistent across sessions. Use \`storage_read\` and \`storage_write\` for these paths. This is where saved files, memory, and operating context live.

Rules:
- Use built-in tools on \`/mnt/session/*\` paths. Do not call \`storage_read\` or \`storage_write\` on session paths.
- Use \`storage_read\`/\`storage_write\` on \`/agent/*\` paths. Do not use built-in tools on \`/agent/*\` paths.
- Session outputs are not saved by default. If the user wants to keep a generated file, read it with built-in \`read\` or \`bash\`, then write it to \`/agent/home/*\` with \`storage_write\`.
- Attach only durable files (\`/agent/*\`) to CRM records. If a session output needs to be attached, persist it first.

## Execution

- Use \`search_crm\` before mutating records when the target is ambiguous. Avoid duplicate writes and keep CRM state tidy.
- Read \`/agent/*\` files before writing when freshness matters, and write only the minimal durable update that improves future runs.
- Internal work can run automatically. External-facing actions may require approval. When approval is required, explain the action briefly and wait.

## Trigger runs

In trigger runs (automated/scheduled executions), do not use \`run_sql\`, \`get_agent_db_schema\`, \`ask_user_question\`, \`create_connection\`, or \`reauthorize_connection\`. Use \`search_crm\` for data lookups in triggers.

## Style

Keep user-facing responses concise, factual, and operationally useful.
`;

const ANTHROPIC_ALLOWED_SCHEMA_KEYS = new Set([
  "type",
  "properties",
  "required",
  "description",
  "items",
  "enum",
  "anyOf",
  "oneOf",
  "allOf",
  "format",
  "pattern",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minItems",
  "maxItems",
  "minProperties",
  "maxProperties",
  "multipleOf",
  "const",
  "nullable",
]);

function toCustomToolParams(
  declaration: (typeof MANAGED_AGENT_TOOL_DECLARATIONS)[number],
): BetaManagedAgentsCustomToolParams {
  const jsonSchema = sanitizeJsonSchema(
    z.toJSONSchema(declaration.inputSchema, { reused: "inline" }),
  );

  if (typeof jsonSchema !== "object" || jsonSchema === null || Array.isArray(jsonSchema)) {
    throw new Error(
      `Tool "${declaration.name}" must serialize to a JSON Schema object.`,
    );
  }

  return {
    type: "custom",
    name: toPublishedManagedAgentToolName(declaration.name),
    description: declaration.description,
    input_schema: jsonSchema as BetaManagedAgentsCustomToolInputSchema,
  };
}

function sanitizeJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeJsonSchema);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => ANTHROPIC_ALLOWED_SCHEMA_KEYS.has(key))
      .map(([key, nestedValue]) => [key, sanitizeJsonSchema(nestedValue)]),
  );
}

/**
 * Built-in Anthropic toolset — all tools enabled, all `always_allow`.
 *
 * Enables bash, read, write, edit, glob, grep, web_fetch, web_search.
 * Skills require `read` to fetch SKILL.md files.
 */
const BUILT_IN_TOOLSET: BetaManagedAgentsAgentToolset20260401Params = {
  type: "agent_toolset_20260401",
  default_config: {
    enabled: true,
    permission_policy: { type: "always_allow" },
  },
  configs: [],
};

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
  const suffix = MODEL_ENV_SUFFIX[SELECTED_MODEL];

  // Check model-specific env var first, fall back to legacy ANTHROPIC_AGENT_ID for Sonnet.
  const existingAgentId =
    process.env[`ANTHROPIC_AGENT_ID_${suffix}`]?.trim() ||
    (SELECTED_MODEL === "claude-sonnet-4-6"
      ? process.env.ANTHROPIC_AGENT_ID?.trim()
      : undefined);

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

  const suffix = MODEL_ENV_SUFFIX[SELECTED_MODEL];
  console.log("=".repeat(60));
  console.log(`Sunder Managed Agent (${SELECTED_MODEL}) ${result.mode}.`);
  console.log("=".repeat(60));
  console.log(`ANTHROPIC_AGENT_ID_${suffix}=${result.agent.id}`);
  console.log(`ANTHROPIC_AGENT_VERSION_${suffix}=${result.agent.version}`);
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
