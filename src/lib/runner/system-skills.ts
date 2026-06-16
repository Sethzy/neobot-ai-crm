/**
 * Bundled system-skill content used by the legacy runner storage fallback for
 * `/agent/skills/system/*`.
 *
 * These are not user-customizable playbooks and should not live in the
 * deprecated `runner/skills/skill-templates.ts` module anymore.
 *
 * @module lib/runner/system-skills
 */
import { SUPPORTED_PROVIDER_NAMES_FOR_PROMPT } from "@/lib/managed-agents/tools/supported-providers";

const SYSTEM_SKILLS_PREFIX = "skills/system/";
const SUPPORTED_PROVIDER_BULLETS = SUPPORTED_PROVIDER_NAMES_FOR_PROMPT
  .split(", ")
  .map((provider) => `- ${provider}`)
  .join("\n");

const SYSTEM_SKILL_CONTENT: Record<string, string> = {
  "creating-connections/SKILL.md": `# Creating New Connections

NeoBot supports a small curated set of providers in v1. When the user asks to connect a supported provider, call \`create_connection\` directly. Do not search the catalog first and do not inspect capabilities before starting OAuth.

## Supported providers (v1)

${SUPPORTED_PROVIDER_BULLETS}

Use the provider name directly in your tool call. The tool normalizes common user-facing variants for you.
Preferred call shape: \`{"integrations":["notion"]}\`

If the user asks for anything else, tell them it is not yet supported. Do not try to discover alternatives.

## Flow

1. Call \`create_connection\` with the provider name as a string inside the \`integrations\` array, for example \`{"integrations":["notion"]}\`.
2. An inline connect card appears in chat with a sign-in button.
3. END YOUR TURN. The provider is not usable in the current run.
4. The user signs in.
5. On the user's NEXT message, the provider is available. Use \`list_connections\` only if you need to confirm status before first use.

## How to talk to the user about connections

Keep replies short and plain. Let the card do the talking.

- Do NOT use these words in user-facing text: \`auth card\`, \`OAuth\`, \`authorize\`, \`authentication flow\`, \`integration\`.
- Instead, say \`connect\`, \`sign in\`, \`connection\`, or \`link your account\`.
- After calling \`create_connection\`, one short sentence is enough, e.g. "I've set up a Notion connection — click Connect and sign in, and I'll pick it up on your next message."
- Never paste or paraphrase the tool result \`message\` field verbatim. It is guidance for you, not copy for the user.

## Rules

- Never call \`create_connection\` for an unsupported provider.
- If the provider is already connected and credentials are stale, call \`reauthorize_connection\`. Do not delete and recreate it.
- If the user wants a different account for the same provider, call \`delete_connection\` first, then \`create_connection\`. Reauthorization does not change which account is connected.
- Do not ask the user to grant permissions after connecting. A successful sign-in is sufficient.
- Direct API connections, custom MCP connections, and computer-use connections are not supported in this v1 flow.`,
  "creating-connections/create-direct-api-connection.md": `Direct-API connections are not supported in v1.`,
};

export function isSystemSkillPath(storagePath: string): boolean {
  return storagePath.startsWith(SYSTEM_SKILLS_PREFIX);
}

export function getSystemSkillContent(storagePath: string): string | null {
  if (!isSystemSkillPath(storagePath)) {
    return null;
  }

  const relativePath = storagePath.slice(SYSTEM_SKILLS_PREFIX.length);

  if (relativePath.includes("..")) {
    return null;
  }

  return SYSTEM_SKILL_CONTENT[relativePath] ?? null;
}
