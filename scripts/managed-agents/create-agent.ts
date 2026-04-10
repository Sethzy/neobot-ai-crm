/**
 * One-time bootstrap: creates the Sunder Managed Agent in Anthropic's API.
 *
 * Run once per environment (dev / staging / prod). Prints the returned
 * `agent.id` and `agent.version` - operator stores them as
 * `ANTHROPIC_AGENT_ID` and `ANTHROPIC_AGENT_VERSION` environment variables.
 *
 * IMPORTANT (per managed-agents versioning guidance):
 * Store BOTH the id and the version. Sessions must pin to a specific
 * version via `{ type: "agent", id, version: Number(ANTHROPIC_AGENT_VERSION) }`.
 *
 * Usage:
 *   pnpm tsx scripts/managed-agents/create-agent.ts
 *
 * @module scripts/managed-agents/create-agent
 */
import Anthropic from "@anthropic-ai/sdk";

import {
  BROWSER_AUTOMATION_PROMPT,
  MARKET_DATA_PROMPT,
  PROPERTY_LISTING_PROMPT,
  SANDBOX_PROMPT,
  SYSTEM_PROMPT,
} from "../../src/lib/ai/system-prompt";

// TODO(h3): rewrite <filesystem>, <sandbox>, <triggers>, <custom-skills>
// and delete <memory-system> + <subagents> from SYSTEM_PROMPT, then bump
// the agent version with client.beta.agents.update(). H1 ships with the
// legacy prompt verbatim so the legacy runner keeps working.
const MIGRATED_SYSTEM = [
  SYSTEM_PROMPT,
  BROWSER_AUTOMATION_PROMPT,
  MARKET_DATA_PROMPT,
  PROPERTY_LISTING_PROMPT,
  SANDBOX_PROMPT,
  `<trigger-mode-guidance>
Do not use run_sql, get_agent_db_schema, ask_user_question, create_connection,
or reauthorize_connection in trigger runs. They return errors in that context.
Use search_crm for data lookups in trigger runs.
</trigger-mode-guidance>`,
].join("\n\n");

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Source .env.local or export it before running.",
    );
  }

  const client = new Anthropic({ apiKey });

  // `agents.create` is a beta API. The SDK exposes it under `client.beta.agents`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agents = (client as any).beta?.agents;
  if (!agents || typeof agents.create !== "function") {
    throw new Error(
      "Anthropic SDK does not expose client.beta.agents.create - upgrade @anthropic-ai/sdk to a version with managed agents beta support.",
    );
  }

  const agent = await agents.create({
    name: "sunder-chat-agent",
    model: "claude-sonnet-4-6",
    system: MIGRATED_SYSTEM,
    tools: [
      {
        type: "agent_toolset_20260401",
        default_config: {
          permission_policy: { type: "always_allow" },
        },
        configs: [
          { name: "bash", permission_policy: { type: "always_ask" } },
          { name: "web_fetch", enabled: false },
          { name: "web_search", enabled: false },
        ],
      },
    ],
    skills: [
      { type: "anthropic", skill_id: "xlsx" },
      { type: "anthropic", skill_id: "docx" },
      { type: "anthropic", skill_id: "pptx" },
      { type: "anthropic", skill_id: "pdf" },
    ],
  });

  console.log("=".repeat(60));
  console.log("Sunder Managed Agent created.");
  console.log("=".repeat(60));
  console.log(`ANTHROPIC_AGENT_ID=${agent.id}`);
  console.log(`ANTHROPIC_AGENT_VERSION=${agent.version}`);
  console.log("");
  console.log("Add BOTH to .env.local (and Vercel project env for staging/prod).");
  console.log(
    "Sessions must pin to this exact version - do not use 'latest' shorthand in production.",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
