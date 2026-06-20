# NeoBot Predefined Agent Skills

This directory holds the predefined Anthropic Managed Agents custom skill bundles, one subdirectory per skill. Each bundle has a `SKILL.md` at its root and may include reference files.

These are shared across all users. Users can duplicate any of these from the dashboard to get a personal editable copy in their own storage. Duplicates live in Supabase at `{clientId}/skills/<slug>/SKILL.md` and override the predefined version for that user.

## Authoring

1. Edit `managed-agents/skills/<slug>/SKILL.md`. Frontmatter `name` must equal the directory name. Keep the body under 500 lines and the description under 1024 characters.
2. For longer supporting material, add reference files under the bundle directory.
3. Run `pnpm vitest run scripts/managed-agents/__tests__/read-skill-bundle.test.ts` to verify the bundle parses.
4. Run `pnpm tsx scripts/managed-agents/upload-custom-skills.ts` to publish the latest bundle set to Anthropic. The script is idempotent: it creates missing skills and bumps versions for existing ones.
5. Run `pnpm tsx scripts/managed-agents/create-agent.ts` to publish a new managed-agent version that includes the updated custom skill registry.

## Relationship to User Duplicates

Editing a predefined bundle in this directory does not change users who have already duplicated it. Their copies keep the version they forked from. The dashboard compares that fork version against the registry and shows an update banner when upstream changed.

## References

- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- https://platform.claude.com/docs/en/managed-agents/skills
