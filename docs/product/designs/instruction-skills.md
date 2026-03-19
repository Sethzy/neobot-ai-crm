# Instruction Skills — Design Doc

**Status:** Draft
**Date:** 2026-03-19
**Scope:** Enable user-created instruction skills that guide how the agent uses existing tools — no sandbox required.

---

## 1. Problem

Sunder's agent has powerful tools (CRM, web search, browser, connections, memory) but no way for users to teach it **how they want those tools used together** for recurring workflows. Every time a user asks for a call prep or a daily briefing, they have to re-explain their process.

## 2. What This Is (and Isn't)

**Instruction skills** are markdown files that guide the model's behavior with existing tools. They don't execute code. They don't need a sandbox.

```
Instruction Skills (this doc):          Execution Skills (sandbox doc):
  = SKILL.md with instructions            = SKILL.md + scripts + runtime
  = agent uses existing tools              = agent writes + runs code
  = no sandbox, no code execution          = Vercel Sandbox + Claude CLI
  = ~0 additional cost per use             = ~$0.10-0.60 per invocation
  = call-prep, daily-briefing, etc.        = analyze_spreadsheet, publish_artifact
```

## 3. What Already Exists

The codebase already has a two-tier skills system:

| Tier | Path | Discovery | Purpose |
|---|---|---|---|
| System skills | `src/lib/runner/skills/system/` | Bundled in code, fallback in `read_file` | Guides for creating connections |
| Connection skills | `{clientId}/skills/connections/{connId}/SKILL.md` | Discovered via system-reminder, per active connection | How to use a specific connection's tools |

**Key existing infrastructure:**
- `src/lib/runner/skills/system-skills.ts` — `isSystemSkillPath()`, `getSystemSkillContent()`
- `src/lib/storage/skill-files.ts` — `getConnectionSkillPath()`, `getConnectionSkillContent()`
- `src/lib/runner/system-reminder.ts` — lists active connections with skill pointers
- `src/lib/runner/tools/storage/index.ts` — `read_file` with system skill fallback, `classifyStoragePath()` recognizes `skills/*`
- `src/lib/ai/system-prompt.ts` — instructs agent to read skills before using tools

**What's missing:** A way for users to create **general-purpose** skills (not tied to connections) that the agent discovers and can load on demand.

## 4. The Design

### Storage

User-created skills go in the existing `skills/` prefix, alongside connections and system skills:

```
Supabase Storage: agent-files bucket
{clientId}/
├── SOUL.md
├── USER.md
├── MEMORY.md
├── memory/
├── skills/
│   ├── system/                          ← existing (bundled fallback)
│   │   └── creating-connections/
│   ├── connections/                     ← existing (per-connection)
│   │   └── {connectionId}/
│   └── call-prep/                       ← NEW (user-created)
│       ├── SKILL.md
│       └── references/                  ← optional supporting files
│           └── objection-handling.md
```

Model path: `/agent/skills/call-prep/SKILL.md`
Storage path: `{clientId}/skills/call-prep/SKILL.md`

Existing `toStoragePath()` / `toModelPath()` handles this. Existing `classifyStoragePath()` already classifies `skills/*` correctly.

### Discovery

At context assembly time, list the user's skill directories (excluding `system/` and `connections/`) and inject metadata into the system prompt.

```typescript
// NEW: src/lib/runner/skills/discover-skills.ts

interface SkillMetadata {
  name: string;
  description: string;
  path: string; // model path, e.g. "/agent/skills/call-prep"
}

async function discoverUserSkills(
  supabase: SupabaseClient,
  clientId: string,
): Promise<SkillMetadata[]> {
  // List directories under {clientId}/skills/
  // Exclude: system/, connections/ (handled separately)
  // For each directory: read SKILL.md, parse frontmatter (name + description)
  // Return array of { name, description, path }
}
```

### System Prompt Injection

Add discovered skills to the system prompt in `assembleContext()`:

```typescript
// In assembleContext(), after loading memory:

const userSkills = await discoverUserSkills(supabase, clientId);

if (userSkills.length > 0) {
  const listing = userSkills
    .map(s => `- **${s.name}**: ${s.description} → \`read_file("${s.path}/SKILL.md")\``)
    .join("\n");

  sections.push(`<available-skills>\n${listing}\n</available-skills>`);
}
```

The agent sees a listing of available skills with their descriptions. When a user's request matches, the agent calls `read_file` to load the full skill — **progressive disclosure**, same pattern as Anthropic's skills.

### Loading

Already works — the agent calls `read_file("/agent/skills/call-prep/SKILL.md")` and gets the content. If the skill references supporting files (e.g., `references/objection-handling.md`), the agent reads those too.

No new tool needed. `read_file` already handles the `skills/` prefix correctly.

### Creation and Editing

Users create skills through normal conversation:

```
User: "I want to set up my call prep workflow. Here's how I prepare..."

Agent: writes /agent/skills/call-prep/SKILL.md via existing write_file tool

User: "Update my call prep to always include competitor analysis"

Agent: reads + edits the existing SKILL.md via read_file + write_file
```

No new tools needed. `write_file` already handles `skills/*` paths.

## 5. Example Skills for RE Agents

Adapted from [anthropics/knowledge-work-plugins/sales](https://github.com/anthropics/knowledge-work-plugins/tree/main/sales):

### call-prep

```yaml
---
name: call-prep
description: Prepare for a client meeting with property data, CRM history, and talking points. Trigger with "prep me for my call with [client]" or "meeting prep [name]".
---
```

Agent workflow when triggered:
1. `search_crm` — pull client history, interactions, preferences
2. `web_search` — recent market data for properties they've discussed
3. Generate prep brief: talking points, objection handling, relevant listings

### daily-briefing

```yaml
---
name: daily-briefing
description: Morning briefing with today's tasks, follow-ups due, and deal pipeline status. Trigger with "morning briefing", "start my day", or "what's on today".
---
```

Agent workflow when triggered:
1. `search_crm` — tasks due today, deals needing attention, follow-ups overdue
2. Check triggers/autopilot for scheduled activities
3. Generate prioritized action plan

### draft-outreach

```yaml
---
name: draft-outreach
description: Research a prospect and draft personalized outreach. Trigger with "draft outreach to [name]", "write to [prospect]", or "reach out to [name]".
---
```

Agent workflow when triggered:
1. `search_crm` — existing relationship history
2. `web_search` — prospect's recent activity, company news
3. Draft personalized email following user's voice/style from SOUL.md

### pipeline-review

```yaml
---
name: pipeline-review
description: Review deal pipeline, flag stale deals, and suggest next actions. Trigger with "pipeline review", "deal review", or "how's my pipeline".
---
```

Agent workflow when triggered:
1. `search_crm` — all active deals, stages, last activity dates
2. Flag: deals stale >14 days, deals missing next steps, high-value deals needing attention
3. Generate summary with recommended actions per deal

### listing-analysis

```yaml
---
name: listing-analysis
description: Analyze a property listing with market comps, pricing assessment, and client fit. Trigger with "analyze this listing", "what do you think of [property]", or "is [address] a good deal".
---
```

Agent workflow when triggered:
1. `web_search` — property details, recent transactions nearby
2. `search_crm` — which clients might be interested (matching preferences)
3. Generate analysis: pricing vs comps, pros/cons, which clients to show it to

## 6. Implementation

### New Files

```
src/lib/runner/skills/
├── system-skills.ts              ← existing
├── discover-skills.ts            ← NEW: discoverUserSkills()
└── system/                       ← existing
    └── creating-connections/

src/lib/runner/skills/__tests__/
├── system-skills.test.ts         ← existing
└── discover-skills.test.ts       ← NEW
```

### Changes to Existing Files

| File | Change |
|---|---|
| `src/lib/runner/context.ts` | Call `discoverUserSkills()`, inject into system prompt |
| `src/lib/ai/system-prompt.ts` | Add instruction block for how to use custom skills |

### No Changes Needed

- `read_file` / `write_file` tools — already work with `skills/*` paths
- `classifyStoragePath()` — already classifies `skills/*` correctly
- `toStoragePath()` / `toModelPath()` — already handles the path translation
- System-reminder — connection skills stay as-is
- Tool registry — no new tools

## 7. System Prompt Addition

Add to `SYSTEM_PROMPT` in `src/lib/ai/system-prompt.ts`:

```
## Custom Skills

The user may have custom skills available. These are workflow guides you should follow
when the user's request matches a skill's description. Skills are listed in
<available-skills> in your context.

When you see a matching skill:
1. Call read_file on the skill's SKILL.md to load full instructions
2. If the skill references additional files, read those too
3. Follow the skill's workflow, using your existing tools as directed
4. Do NOT mention that you're "using a skill" — just do the work naturally

Skills are created and edited by the user via write_file. If a user describes a
recurring workflow they want you to follow, offer to save it as a skill.
```

## 8. Relationship to Sandbox Skills

These are complementary, not competing:

```
User request → Runner (Gemini Flash)
  │
  ├── Matches instruction skill? (call-prep, daily-briefing, etc.)
  │   → read_file(SKILL.md) → follow instructions → use existing tools
  │   → no sandbox, no extra cost
  │
  ├── Needs spreadsheet analysis?
  │   → analyze_spreadsheet tool → Vercel Sandbox (snap_excel)
  │
  └── Needs artifact publishing?
      → publish_artifact tool → Vercel Sandbox (snap_artifact)
```

Instruction skills could also reference sandbox tools. For example, a `market-report` skill might instruct the agent to: (1) search CRM for active deals, (2) web search for market data, (3) call `analyze_spreadsheet` to build an Excel model, (4) format results. The skill orchestrates; the sandbox executes the compute part.

## 9. Reference Implementations

| Source | What we take from it |
|---|---|
| [anthropics/knowledge-work-plugins/sales](https://github.com/anthropics/knowledge-work-plugins/tree/main/sales) | 9 sales skills (call-prep, draft-outreach, daily-briefing, pipeline-review, etc.). Pattern: skill = instructions for using existing tools (CRM, email, search). No code execution. |
| [AI SDK Cookbook: Agent Skills](https://ai-sdk.dev/cookbook/guides/agent-skills) | `discoverSkills()` + `buildSkillsPrompt()` + `loadSkill` tool pattern. Progressive disclosure. Sandbox abstraction interface. |
| [Anthropic: Equipping agents with Agent Skills](https://claude.com/blog/equipping-agents-for-the-real-world-with-agent-skills) | Progressive disclosure (metadata → SKILL.md → linked files). Skills = folders not files. |
| [Thariq: Lessons from Building Claude Code Skills](https://x.com/trq212/status/2033949937936085378) | 9 skill categories. Tips: don't state the obvious, build gotchas sections, avoid railroading Claude. |

## 10. Batteries Included — Pre-Installed Skills

Skills are the product, not the model. Users shouldn't start from zero.

> "Without skills, models are surprisingly bad at domain tasks. Ask a frontier model to do a DCF
> valuation. It knows what DCF is. It can explain the theory. But actually executing one? It will
> miss critical steps... The output looks plausible but is subtly wrong in ways that matter."
> — Nicolas Bustamante, Fintool

Every new Sunder client gets a set of **pre-installed RE-specific skills** on onboarding. These are system-level defaults that the user can edit, override, or delete. Adapted from [anthropics/knowledge-work-plugins/sales](https://github.com/anthropics/knowledge-work-plugins/tree/main/sales) for real estate:

| Skill | Adapted from (Anthropic sales) | RE version |
|---|---|---|
| `call-prep` | `call-prep` | Pull CRM history + property interests + market context → talking points + objection handling |
| `daily-briefing` | `daily-briefing` | Today's tasks, overdue follow-ups, deals needing attention, autopilot activity summary |
| `draft-outreach` | `draft-outreach` | Research prospect + draft personalized message (WhatsApp/email) in agent's voice |
| `pipeline-review` | `pipeline-review` | Active deals by stage, stale deals flagged, next actions per deal |
| `listing-analysis` | `account-research` | Analyze a listing: pricing vs comps, pros/cons, which CRM clients to show it to |
| `call-summary` | `call-summary` | Post-meeting: extract action items, update CRM, draft follow-up message |
| `market-briefing` | `competitive-intelligence` | Weekly: district price trends, new launches, policy changes, what it means for active deals |

### How Pre-Installed Skills Work

Same mechanism as system skills for connections — bundled in the codebase, seeded to client storage on first run:

```
Bundled defaults:
  src/lib/runner/skills/defaults/
  ├── call-prep/SKILL.md
  ├── daily-briefing/SKILL.md
  ├── draft-outreach/SKILL.md
  ├── pipeline-review/SKILL.md
  ├── listing-analysis/SKILL.md
  ├── call-summary/SKILL.md
  └── market-briefing/SKILL.md

On client onboarding (bootstrapMemoryFiles pattern):
  → check if {clientId}/skills/ exists in Supabase Storage
  → if empty: seed default skills from bundled defaults
  → user now has 7 skills ready to go from day 1

User customization:
  → user edits via chat ("update my call prep to always include...")
  → agent writes to {clientId}/skills/call-prep/SKILL.md
  → their version overrides the default (same file path, overwritten)
```

This follows the Fintool pattern: **public skills (bundled defaults) → user's private copy (editable)**. No shadowing complexity needed — the user's edit simply overwrites the seeded file. If they want to reset, we can re-seed from the bundled default.

## 11. Frontend — Skill Management UI

The frontend should surface skills so users know what's available and can manage them:

### Skills List (Settings or sidebar)

```
┌─────────────────────────────────────────────────┐
│  Your Skills                           [+ New]  │
├─────────────────────────────────────────────────┤
│                                                 │
│  📋 call-prep                          [Edit]   │
│  Prepare for a client meeting with CRM          │
│  history and talking points                     │
│                                                 │
│  📋 daily-briefing                     [Edit]   │
│  Morning briefing with tasks, follow-ups,       │
│  and pipeline status                            │
│                                                 │
│  📋 draft-outreach                     [Edit]   │
│  Research a prospect and draft outreach          │
│                                                 │
│  📋 pipeline-review                    [Edit]   │
│  Review deal pipeline and flag stale deals       │
│                                                 │
│  📋 listing-analysis                   [Edit]   │
│  Analyze a listing with comps and client fit     │
│                                                 │
│  📋 call-summary                       [Edit]   │
│  Post-meeting summary with action items          │
│                                                 │
│  📋 market-briefing                    [Edit]   │
│  Weekly market trends and policy changes         │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Skill Editor

- Simple markdown editor (or just a textarea)
- Shows SKILL.md content
- User edits → saves to Supabase Storage
- Could also edit via chat ("update my call prep to include...")

### Skill Triggers in Chat

When the agent uses a skill, the chat UI could show a subtle indicator:

```
┌──────────────────────────────────────────┐
│  📋 Using: call-prep                     │  ← subtle chip/badge
│                                          │
│  Here's your prep for the Tan family...  │
└──────────────────────────────────────────┘
```

This builds trust — the user sees which skill is guiding the output and can edit it if the result isn't right.

### Future: Skill Marketplace

Not for v1, but the natural evolution:
- Share skills between agents in the same brokerage
- Publish skills to a community marketplace
- Import skills from other users ("use Sarah's listing-analysis")

## 12. Scope

### This PR

- `discoverUserSkills()` function
- Inject skill listing into system prompt via `assembleContext()`
- System prompt instruction block for custom skills
- Bundled default RE skills (7 skills, adapted from Anthropic sales)
- Seed defaults on client onboarding (extend `bootstrapMemoryFiles` pattern)
- Tests for discovery + seeding

### Fast Follow

- Frontend: skills list page (read skills from Supabase Storage, display name + description)
- Frontend: skill editor (textarea, save to Storage)
- Chat UI: subtle indicator when agent uses a skill

### NOT This PR

- Sandbox skills (separate design doc: `sandbox-skill-execution.md`)
- Skill sharing between clients
- Skill marketplace
