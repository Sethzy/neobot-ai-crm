# Skill Development Prompt

Use this prompt when creating or modifying instruction skills for Sunder. Copy and paste it at the start of the session.

---

## The Prompt

```
I want to create/modify an instruction skill for Sunder. Before we start, load these 4 reference resources in order:

1. Read the Anthropic official guide:
   `roadmap docs/Sunder - Source of Truth/references/claude/complete-guide-to-building-skills-for-claude.md`

   This is the canonical 32-page guide covering: skill structure (SKILL.md + scripts/ + references/ + assets/), progressive disclosure (3 levels), YAML frontmatter spec, 5 design patterns (sequential workflow, multi-MCP coordination, iterative refinement, context-aware tool selection, domain-specific intelligence), testing methodology (triggering + functional + performance), and troubleshooting.

2. Read Thariq's operational guide:
   `roadmap docs/Sunder - Source of Truth/references/claude/lessons-from-building-claude-code-skills-FULL.md`

   This is the practitioner's guide from Anthropic's internal usage: 9 skill categories (library/API, verification, data fetching, business process, scaffolding, code quality, CI/CD, runbooks, infra ops), tips (don't state the obvious, build gotchas sections, use filesystem for progressive disclosure, avoid railroading, think about setup, description field is for the model, memory via stored data, store scripts, on-demand hooks), distribution patterns (repo vs plugin marketplace), and measuring skills.

3. Read the Anthropic skills keynote summary:
   `roadmap docs/Sunder - Source of Truth/references/claude/anthropic-skills-keynote-agents-need-expertise.md`

   Core thesis: intelligence ≠ expertise. One general agent with a skills library beats many specialized agents. Skills = applications (models = processors, runtime = OS). Progressive loading, MCP = connectivity while skills = expertise, non-technical users creating skills, organizational memory via shared skills, agents that create/refine/discard their own skills.

4. Read the skill-creator skill:
   `.claude/skills/skill-creator/SKILL.md`

   This is Anthropic's meta-skill for building and iterating on skills: capture intent → interview → write SKILL.md → create test prompts → run evals (parallel subagents) → human review → iterate → trigger-tune description → package. Use this process.

After reading all 4, confirm what you've loaded and then ask me what skill I want to build or modify. Follow these constraints for Sunder skills:

- Skills are instruction-only (no sandbox, no code execution) — they guide how the agent uses existing tools
- Always reference built-in tools: `search_crm`, `web_search`, `read_file`, `write_file`
- May reference connection categories (email, calendar, chat) as optional enhancements — use plain language like "if email is connected" rather than specific Composio tool slugs
- Do NOT reference specific connection tool names (e.g., `GMAIL_SEND_EMAIL`, `conn_xyz__GMAIL_FETCH_EMAILS`)
- Follow the SKILL.md format: YAML frontmatter (name + description) + markdown body
- Description field must include WHAT + WHEN (trigger phrases the model will see)
- Include a Gotchas section — this is the highest-value part per Thariq's guide
- Include a Connectors table when the skill benefits from optional connections (email, calendar, etc.)
- Follow the Anthropic reference patterns: three-part description (WHAT + HOW + WHEN), first-person voice, output format template, execution flow, related skills
- Reference repo: `/Users/sethlim/Documents/sales/skills/` (Anthropic's official sales plugin)
- Make descriptions slightly "pushy" per skill-creator guidance — models tend to undertrigger
```

---

## When to Use

- Creating a new default skill for Sunder (e.g., a new advisory sales workflow)
- Modifying an existing default skill in `skill-templates.ts`
- Helping a user create a custom skill via chat
- Reviewing skill quality (trigger accuracy, gotchas coverage, tool references)

## Where Skills Live

- **Bundled defaults:** `src/lib/runner/skills/skill-templates.ts` (string constants, single source of truth)
- **Per-client custom:** `{clientId}/skills/{slug}/SKILL.md` in Supabase Storage
- **Reference material:** `roadmap docs/Sunder - Source of Truth/references/claude/`
