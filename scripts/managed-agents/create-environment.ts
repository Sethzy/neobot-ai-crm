/**
 * One-time bootstrap: creates the NeoBot Managed Agents execution environment.
 *
 * Run once per deployment environment. Prints the returned `environment.id` -
 * operator stores it as `ANTHROPIC_ENVIRONMENT_ID`.
 *
 * Usage:
 *   pnpm tsx scripts/managed-agents/create-environment.ts
 *
 * @module scripts/managed-agents/create-environment
 */
import Anthropic from "@anthropic-ai/sdk";

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Source .env.local or export it before running.",
    );
  }

  const client = new Anthropic({ apiKey });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const environments = (client as any).beta?.environments;
  if (!environments || typeof environments.create !== "function") {
    throw new Error(
      "Anthropic SDK does not expose client.beta.environments.create - upgrade @anthropic-ai/sdk to a version with managed agents beta support.",
    );
  }

  const environment = await environments.create({
    name: "sunder-production",
    config: {
      type: "cloud",
      networking: { type: "unrestricted" },
    },
  });

  console.log("=".repeat(60));
  console.log("NeoBot Managed Agents environment created.");
  console.log("=".repeat(60));
  console.log(`ANTHROPIC_ENVIRONMENT_ID=${environment.id}`);
  console.log("");
  console.log("Add to .env.local (and Vercel project env for staging/prod).");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
