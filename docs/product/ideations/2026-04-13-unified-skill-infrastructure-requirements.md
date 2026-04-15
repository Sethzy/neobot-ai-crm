---
date: 2026-04-13
topic: unified-skill-infrastructure
---

# Unified Skill Infrastructure

## Problem Frame

Sunder's managed agent has three disconnected skill tiers (Anthropic built-in, predefined custom, user overrides in Supabase), each with a different access pattern. The agent conflates them — e.g. calling `storage_read('/agent/skills/xlsx/SKILL.md')` for a built-in Anthropic skill — deadlocking sessions. Users also have no way to discover or explicitly invoke skills.

## Core Model

One tier. All skills are `type: "custom"` on Anthropic's Skills API. A `skills` DB table is the metadata layer. Per-user install/uninstall is a DB flag. The kickoff tells the agent which skills are active.

```
All skills uploaded to Anthropic as type: "custom" (up to 20)
         |
One agent definition with all skills attached
         |
skills DB table tracks what each user has installed
         |
Kickoff tells agent: "active skills for this session: [list]"
```

## Requirements

### Unified Skill Repository

- R1. All skills — including document processing (xlsx, docx, pptx, pdf) — are registered on the Anthropic agent as `type: "custom"`. The `BUILTIN_SKILLS` array is removed.
- R2. Document processing skills are forked from Anthropic's source-available implementations (github.com/anthropics/skills) into `managed-agents/skills/` alongside existing Sunder workflow skills.
- R3. All skills flow through one pipeline: `managed-agents/skills/{slug}/SKILL.md` -> `upload-custom-skills.ts` -> `skill-registry.json` -> `create-agent.ts`.

### Skills Table

- R4. A `skills` table stores skill metadata: id, client_id (nullable for predefined), slug, name, description, is_predefined, forked_from, is_installed, created_at, updated_at.
- R5. Predefined skills are seeded at deploy time from SKILL.md frontmatter. Each user gets default `is_installed = true` rows for core skills on first use.
- R6. User-created and user-forked skills insert rows. User overrides remain in Supabase storage at `/{clientId}/skills/{slug}/SKILL.md`.

### Slash Command Invocation

- R7. Users type `/` in the chat composer to see an autocomplete dropdown of their installed skills (name + description). Populated from the `skills` table.
- R8. Selecting a skill inserts `/skill-name` into the composer. User appends their message after.
- R9. The agent recognizes `/skill-name` as explicit invocation. Auto-detection by description matching continues as the implicit fallback.

### Session Kickoff

- R10. The agent system prompt includes a skills section listing all registered skills with name + one-line description (for progressive disclosure Level 1 and auto-trigger).
- R11. At kickoff, the adapter queries the user's installed skills and includes: "Active skills for this session: [slugs]."
- R12. For skills with user overrides in Supabase storage, the kickoff adds: "These skills have user customizations: [slugs]. Call `storage_read('/agent/skills/{slug}/SKILL.md')` first."
- R13. The agent uses progressive disclosure (Skills API native) for active skills without overrides. For overridden skills, it calls `storage_read` to get the user's version.

### Install / Uninstall UX

- R14. The `/skills` page shows two sections: **Installed** (user's active skills) and **Recommended** (available skills not yet installed).
- R15. "Install" sets `is_installed = true` in the `skills` table. Next session includes the skill in the kickoff.
- R16. "Uninstall" sets `is_installed = false`. Next session excludes it from the kickoff. The skill remains registered on Anthropic — just not active for this user.

## Success Criteria

- One tier: every skill is `type: "custom"` on Anthropic. No `BUILTIN_SKILLS`, no type distinction.
- Users can browse, install, and uninstall skills from the `/skills` page
- Users can discover and invoke skills via `/` autocomplete in the chat composer
- The agent only uses skills the user has installed (kickoff-controlled)
- Adding a new skill: write SKILL.md, run upload pipeline, deploy (seeds DB). No frontend change.
- The 20-skill-per-session cap is respected (catalog up to 20, users pick their subset)

## Scope Boundaries

- **Not in scope:** Files API overflow for >20 skills (v2 if needed)
- **Not in scope:** Skill marketplace / community sharing
- **Not in scope:** Sandbox/code execution integration (PR 52)
- **Not in scope:** Skill editor UI changes (existing /skills editor stays as-is)

## Key Decisions

- **Fork built-in document skills as custom:** Eliminates the bifurcation that caused the xlsx crash. One access pattern for everything.
- **Skills API for v1, not Files API:** Progressive disclosure and auto-trigger are worth more than unlimited dynamic skills right now. Files API is the v2 escape hatch if we outgrow 20.
- **DB table for metadata ("menu board"):** Single queryable source of truth for what skills exist and who has what installed. Content stays on Anthropic (progressive disclosure) and Supabase storage (user overrides). Validated by Multica (PostgreSQL `skill` table) and Fintool (SQL discovery over filesystem).
- **Install/uninstall is a soft toggle:** All skills are registered on one agent. Per-user activation is a DB flag that affects the kickoff, not the agent definition. No per-user agent versions.

## Dependencies / Assumptions

- Anthropic's source-available document skills can be adapted into `managed-agents/skills/{slug}/SKILL.md` format
- The 20-skill cap is sufficient for the curated catalog
- The existing `upload-custom-skills.ts` pipeline handles additional skills without core changes

## Outstanding Questions

### Deferred to Planning

- [Affects R2][Needs research] What adaptation is needed to port Anthropic's document skills? Do they bundle Python scripts or dependencies?
- [Affects R4][Technical] Migration design for the `skills` table — RLS policy, seed strategy, default install set per user
- [Affects R7][Technical] Autocomplete component in chat composer — ShadCN Command/Combobox or custom popover?
- [Affects R10][Technical] System prompt skills section format — how much metadata per skill?
- [Affects R14][Technical] `/skills` page install/uninstall UX — how to surface the Installed vs Recommended split?

## Next Steps

-> `/plan` for structured implementation planning
