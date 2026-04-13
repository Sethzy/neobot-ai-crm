---
date: 2026-04-13
topic: unified-skill-infrastructure
---

# Unified Skill Infrastructure

## Problem Frame

Sunder's managed agent has three disconnected skill tiers, each with a different access pattern:

1. **Built-in Anthropic skills** (xlsx, docx, pptx, pdf) — registered as `type: "anthropic"`, accessed natively via the session container filesystem
2. **Predefined Sunder skills** (call-prep, daily-briefing, etc.) — uploaded to Anthropic as `type: "custom"`, accessed via Anthropic's progressive disclosure
3. **User-customized skill overrides** — stored in Supabase storage, NOT registered on the Anthropic agent, injected via kickoff text block, accessed via `storage_read()` custom tool

This bifurcation causes real failures: the agent conflates access patterns (e.g. calling `storage_read('/agent/skills/xlsx/SKILL.md')` for a built-in Anthropic skill that doesn't exist in Supabase), deadlocking sessions. Users also have no explicit way to invoke skills — discovery depends entirely on the agent's description-matching heuristic.

## Requirements

### Unified Skill Repository

- R1. All skills (including document processing — xlsx, docx, pptx, pdf) are registered on the Anthropic agent as `type: "custom"`. The `BUILTIN_SKILLS` array (`type: "anthropic"`) is removed.
- R2. Document processing skills are forked from Anthropic's source-available reference implementations (github.com/anthropics/skills) into `managed-agents/skills/` alongside existing Sunder workflow skills.
- R3. All predefined skills flow through the same pipeline: `managed-agents/skills/{slug}/SKILL.md` → `upload-custom-skills.ts` → `skill-registry.json` → `create-agent.ts`.
- R4. The agent system prompt includes a skills section listing all available skills with name + one-line description, so the agent can both auto-trigger skills by relevance AND respond to explicit `/skill-name` invocation.
- R5. User-customized skill overrides remain in Supabase storage at `/{clientId}/skills/{slug}/SKILL.md`. The kickoff text block override mechanism (`storage_read` before using predefined version) continues to work, now applying uniformly to all skills.

### Slash Command Invocation

- R6. Users can type `/` in the chat composer to see an autocomplete dropdown of available skills. Each entry shows skill name + short description.
- R7. Selecting a skill from the autocomplete inserts `/skill-name` into the composer. The user can append their message after the command (e.g. `/call-prep David Lee`).
- R8. The agent recognizes `/skill-name` at the start of a user message as an explicit skill invocation and uses that skill for the request.
- R9. Skill auto-detection (agent chooses a skill based on relevance without a slash command) continues to work alongside explicit invocation. Slash commands are the explicit path; description-matching is the implicit fallback.

### Skill Discovery (DB Table)

- R10. A `skills` table stores skill metadata: id, client_id, slug, name, description, is_predefined, forked_from, created_at, updated_at. This is the "menu board" — the single source of truth for what skills exist, not where skill content lives.
- R11. Predefined skills are seeded into the table at deploy time (from SKILL.md frontmatter in the repo). User-created and user-customized skills insert rows when created/forked.
- R12. The frontend queries the `skills` table to populate the slash command autocomplete. One fast query, no frontmatter parsing or storage directory listing at request time.
- R13. Skill content delivery is unchanged: predefined skill content lives on Anthropic (progressive disclosure), user overrides load via `storage_read` from Supabase storage. The table stores metadata only.

## Success Criteria

- The agent never calls `storage_read` for a skill that only exists on Anthropic's infrastructure (the bifurcation bug is structurally eliminated, not just guarded against)
- Users can discover and invoke any skill via `/` autocomplete in the chat composer
- Adding a new predefined skill requires only: create `managed-agents/skills/{slug}/SKILL.md`, run the upload pipeline, deploy (seeds the skills table) — no frontend code change needed
- The 20-skill-per-session cap is respected (currently 15 skills; leaves room for 5 more)

## Scope Boundaries

- **Not in scope:** Skill editor/customization UI (already exists via the /skills page and PR 51a)
- **Not in scope:** Skill marketplace or sharing between users
- **Not in scope:** Sandbox/code execution integration (separate concern, PR 52)
- **Not in scope:** Multi-select or chaining slash commands
- **Not in scope:** Changes to the skill override/customization workflow itself — the Supabase storage pattern and fork metadata stay as-is

## Key Decisions

- **Fork built-in document skills as custom:** One access pattern for everything. We take on maintenance of document processing skill content, but eliminate the type:anthropic/type:custom confusion that caused the xlsx crash. Anthropic's source-available implementations are the starting point.
- **Full autocomplete, not text convention only:** Discoverability matters. Users shouldn't need to memorize skill names. The autocomplete dropdown is the discovery surface.
- **DB table for skill metadata ("menu board"):** A `skills` table is the single source of truth for what skills exist and their metadata. Content stays where it runs (Anthropic for predefined, Supabase storage for user overrides). Avoids parsing frontmatter or listing directories at request time. Validated by Multica's approach (PostgreSQL `skill` + `skill_file` tables).
- **Keep storage_read override mechanism:** Already works for 11+ skills. Now applies uniformly to all skills. The kickoff instruction no longer confuses the agent because there's no separate built-in tier to conflate with.

## Dependencies / Assumptions

- Anthropic's source-available document skills (github.com/anthropics/skills) can be adapted into the `managed-agents/skills/` format without major rework
- The 20-skill-per-session cap is sufficient for the foreseeable skill set (15 currently, room for 5 more)
- The existing `upload-custom-skills.ts` pipeline handles the additional skills without changes to its core logic

## Outstanding Questions

### Deferred to Planning

- [Affects R2][Needs research] What adaptation is needed to port Anthropic's source-available document skills into Sunder's `managed-agents/skills/{slug}/SKILL.md` format? Do they include Python scripts or dependencies that need the session container?
- [Affects R4][Technical] What should the system prompt skills section look like? How much metadata per skill (name only, name + description, name + description + trigger hints)?
- [Affects R6][Technical] What autocomplete component pattern to use? ShadCN Command/Combobox, or a custom popover? How to handle positioning relative to the composer textarea?
- [Affects R10][Technical] Migration design for the `skills` table — columns, RLS policy (client_id scoping), seed strategy for predefined skills at deploy time
- [Affects R12][Technical] Should the frontend query be a Server Action, an API route, or a React Server Component data fetch? What caching strategy?

## Next Steps

→ `/plan` for structured implementation planning
