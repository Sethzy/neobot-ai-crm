/**
 * One-time bootstrap: creates the Sunder Managed Agent in Anthropic's API.
 *
 * Run once per environment (dev / staging / prod). Prints the returned
 * `agent.id` and `agent.version` - operator stores them as
 * `ANTHROPIC_AGENT_ID` and `ANTHROPIC_AGENT_VERSION` environment variables.
 *
 * IMPORTANT: the v1 agent this script creates is a NON-FUNCTIONAL
 * PLACEHOLDER. It has no Sunder custom tools and a placeholder system
 * prompt. Do not route production traffic at it. H3 (Chat Adapter PR)
 * will call `client.beta.agents.update()` to publish v2 with the real
 * system prompt + custom tools; production sessions must pin to v2 or
 * later.
 *
 * Per managed-agents versioning guidance: store BOTH the id and the
 * version. Sessions pin via
 * `{ type: "agent", id, version: Number(ANTHROPIC_AGENT_VERSION) }`.
 *
 * Usage:
 *   pnpm tsx scripts/managed-agents/create-agent.ts
 *
 * @module scripts/managed-agents/create-agent
 */
import Anthropic from "@anthropic-ai/sdk";

// H1 placeholder prompt. Deliberately short and decoupled from the
// legacy in-tree SYSTEM_PROMPT so this script never silently drifts
// with future prompt edits. H3 replaces this via agents.update().
const PLACEHOLDER_SYSTEM = `H1 bootstrap placeholder for the Sunder Managed Agent.

This agent version exists only to exercise the managed-agents beta API
and to produce an agent.id + agent.version the chat adapter can later
bump. It has no Sunder custom tools and is not intended to handle real
user traffic.

H3 (Chat Adapter PR) will rewrite this system prompt, attach Sunder's
custom tools via client.beta.agents.update(), and publish v2. All
production sessions must pin to v2 or later.`;

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
    system: PLACEHOLDER_SYSTEM,
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
