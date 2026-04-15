# Unified Skill Infrastructure — Handover

## What this is

Collapse Sunder's three-tier skill system into one unified tier. All skills become `type: "custom"` on Anthropic's Skills API. A `skills` DB table handles metadata/discovery. Users get slash command invocation (`/skill-name`) and install/uninstall from the `/skills` page.

## Why

The agent currently has three disconnected skill tiers with different access patterns. It conflates them — calling `storage_read('/agent/skills/xlsx/SKILL.md')` for a built-in Anthropic skill that doesn't exist in Supabase — deadlocking sessions. Users also can't discover or explicitly invoke skills.

**Trace evidence:** Session `sesn_011CZzmNV5SGcHyHp16P9tLU` (thread `69f941aa-f158-4e02-b985-c6d56ecc2d53`) — agent called `storage_read` for xlsx, both tool calls went pending, session deadlocked.

## Source documents

Read these in order:

1. **Requirements (decisions are here):** `docs/product/ideations/2026-04-13-unified-skill-infrastructure-requirements.md`
2. **Implementation plan (how to build it):** `docs/product/plans/2026-04-13-002-feat-unified-skill-infrastructure-plan.md`

The plan has four phases. Each phase is self-contained and can be committed/shipped independently.

## Key decisions (don't re-litigate these)

- **All skills are `type: "custom"`** on Anthropic. The `BUILTIN_SKILLS` array (xlsx, docx, pptx, pdf) is removed. Document processing skills are forked from `github.com/anthropics/skills` into `managed-agents/skills/`.
- **Skills API, not Files API** for v1. Progressive disclosure and auto-trigger are worth the 20-skill cap. Files API is the v2 escape hatch.
- **DB table for metadata** — `skills` table is the "menu board." Content stays on Anthropic (progressive disclosure) and Supabase storage (user overrides).
- **Install/uninstall is a soft toggle** — all skills registered on one agent. Per-user activation is a DB flag that affects the kickoff text, not the agent definition.

## Critical gotchas

1. **Bundled content in Next.js must be TypeScript string constants.** Do NOT use `readFile()` + `__dirname` — breaks in webpack. The seed script runs as standalone `tsx` (fine for filesystem reads), but anything imported at runtime in the Next.js app must follow the pattern in `src/lib/runner/skills/skill-templates.ts`. See: `docs/product/handovers/2026-03-19-pr51-skill-bundling-fix.md`.

2. **Pin agent versions.** After running `upload-custom-skills.ts` and `create-agent.ts`, the new agent version must be set in env vars (`ANTHROPIC_AGENT_VERSION_SONNET`, etc.). Rollback = bump back to old version.

3. **The 20-skill cap is real.** Currently 15 skills after this change (11 Sunder + 4 document). Room for 5 more. Enforced in `load-managed-agent-skills.ts`.

4. **RLS on `skills` table** — predefined catalog rows have `client_id = NULL` and are readable by all users. Per-user rows are scoped by `get_my_client_id()`. The unique constraint is `(client_id, slug)` plus a partial unique index for predefined rows (`WHERE client_id IS NULL`).

## Files you'll touch

### Phase 1: Pipeline + DB

| File | Change |
|------|--------|
| `managed-agents/skills/xlsx/SKILL.md` | New — fork from `github.com/anthropics/skills` |
| `managed-agents/skills/docx/SKILL.md` | New — fork |
| `managed-agents/skills/pptx/SKILL.md` | New — fork |
| `managed-agents/skills/pdf/SKILL.md` | New — fork |
| `scripts/managed-agents/load-managed-agent-skills.ts` | Remove `BUILTIN_SKILLS` array |
| `scripts/managed-agents/skill-registry.json` | Regenerated — 15 entries |
| `supabase/migrations/YYYYMMDDHHMMSS_create_skills_table.sql` | New migration |
| `scripts/managed-agents/seed-skills-table.ts` | New — deploy-time seed script |

### Phase 2: Kickoff + System Prompt

| File | Change |
|------|--------|
| `scripts/managed-agents/create-agent.ts` | Add `## Skills` section to system prompt |
| `src/lib/managed-agents/session-kickoff.ts` | Add `installedSkillSlugs` to kickoff, update text blocks |
| `src/lib/managed-agents/adapter.ts` | Query installed skills alongside customized skills |
| `src/lib/runner/skills/list-installed-skill-slugs.ts` | New — query `skills` table |

### Phase 3: Slash Command Autocomplete

| File | Change |
|------|--------|
| `src/components/chat/skill-autocomplete.tsx` | New — Command-based autocomplete |
| `src/components/chat/chat-composer.tsx` | Integrate autocomplete, pass skill list |
| `src/hooks/use-installed-skills.ts` | New — TanStack Query hook |
| `src/lib/runner/skills/get-installed-skills.ts` | New — server action / query |

### Phase 4: Install / Uninstall UX

| File | Change |
|------|--------|
| `app/(dashboard)/skills/page.tsx` | Switch to `skills` table queries, Installed/Recommended sections |
| `src/lib/runner/skills/skill-actions.ts` | Add `installSkill()`, `uninstallSkill()` |

## How to verify

1. **Phase 1:** Run `pnpm tsx scripts/managed-agents/upload-custom-skills.ts` — should upload 15 skills. `skill-registry.json` should have 15 entries, all `type: "custom"`. Run seed script — `skills` table should have 15 predefined catalog rows.

2. **Phase 2:** Create a new chat thread. Check server logs for kickoff content — should include "Active skills for this session: [list]". Agent should auto-trigger skills by description and respond to `/skill-name`.

3. **Phase 3:** Type `/` in the chat composer. Autocomplete dropdown should appear with installed skills. Select one — should insert `/skill-name ` into input.

4. **Phase 4:** Open `/skills` page. Should show Installed and Recommended sections. Install a recommended skill. Send a chat message — the newly installed skill should appear in the kickoff's active list.

## What's NOT in scope

- Files API overflow for >20 skills (v2)
- Skill marketplace / community sharing
- Sandbox/code execution integration (PR 52)
- Skill editor UI changes (existing editor stays as-is)
