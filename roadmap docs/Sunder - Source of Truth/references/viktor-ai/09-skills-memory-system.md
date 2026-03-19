# Viktor Skills Memory System

Source: Direct Q&A with Viktor instance (2026-03-16)

## What a Skill Looks Like

Plain markdown with YAML frontmatter. Real example from `pdf_creation/SKILL.md`:

```markdown
---
name: pdf_creation
description: Create PDF documents from HTML/CSS. Use when creating
  PDFs, reports, or formatted documents.
---

For PDF creation from scratch, always use the weasyprint python
package and create the pdf from html/css. do not use reportlab.

Include thoughtful design elements, visual hierarchy.

## Fonts
### Option 1: Pre-installed System Fonts
Sans Serif: Roboto, Open Sans, Lato, Noto Sans...
Serif: EB Garamond, Caladea...
Monospace: Fira Code, Noto Mono...

### Option 2: Google Fonts via @import
Google Fonts @import works.
```

## Skill Directory Structure

```
skills/{skill_name}/
├── SKILL.md           # entry point (YAML frontmatter + instructions)
├── scripts/           # automation scripts
└── references/        # detailed docs
```

Currently **18 skill directories** ship with Viktor.

## YAML Frontmatter Schema

Only two fields observed:
- `name` — skill identifier
- `description` — one-liner injected into system prompt

## Who Writes Skills

### Pre-built (Platform)
18 skills ship with Viktor covering common capabilities:
- `pdf_creation`
- `browser`
- `excel_editing`
- etc.

### Auto-created by Viktor
After completing a task, Viktor is instructed to ask: **"What would help next time?"** and update/create skills accordingly.

### Cron-Generated Learnings
Each cron maintains a `LEARNINGS.md` that accumulates run-over-run. This is a specialized form of skill — not in the skills directory, but in `/work/crons/{name}/LEARNINGS.md`.

### User-Requested
"Viktor, remember how to do X" → Viktor creates/updates a skill file.

## How Viktor Decides Which Skills to Load

**No semantic retrieval. No vector search. No RAG.**

Every skill's `description` field is injected into the system prompt verbatim. Each run, Viktor sees a catalog like:

```
- pdf_creation: Create PDF documents from HTML/CSS.
  Use when creating PDFs, reports, or formatted documents.
- browser: Browse websites, fill forms, and scrape web data...
```

Viktor **keyword-matches in its head** against the task, then calls `file_read` on the relevant `SKILL.md` files. It's **LLM reasoning over a catalog**, not retrieval-augmented generation.

## Can You Edit or Delete Skills?

Not directly from Slack. But you can tell Viktor to:
- "Update the pdf_creation skill to always use Roboto"
- "Delete the skill for X"

It's just files on disk. Viktor edits/deletes the markdown file.

## Comparison to Tasklet Skills

| Aspect | Tasklet | Viktor |
|---|---|---|
| Format | Markdown in `/agent/skills/` | Markdown in `/work/skills/` |
| Frontmatter | Not documented | YAML (`name`, `description`) |
| Who writes | Platform-managed (read-only) + connection auto-generated | Pre-built + Viktor-created + user-requested |
| Discovery | Injected into system prompt | Description injected into system prompt |
| Loading | File read on demand | `file_read` on demand |
| Mutability | Read-only (system skills), read-write (connection skills) | All read-write |
| Sub-files | `SKILL.md` + optional sub-docs | `SKILL.md` + `scripts/` + `references/` |

## Comparison to Sunder Memory

| Aspect | Sunder | Viktor |
|---|---|---|
| Long-term memory | SOUL.md, USER.md, MEMORY.md | Skills (SKILL.md per topic) |
| Storage | Supabase Storage (per-client) | Persistent volume (per-workspace) |
| Discovery | Full content injected into system prompt | Descriptions injected, content loaded on demand |
| Who writes | Agent (via `write_file` tool) | Agent + platform + user requests |
| Granularity | 3 files (soul, user, general memory) | 18+ files (one per skill/topic) |
| Cron memory | Not built | `LEARNINGS.md` per cron |

## Key Insights for Sunder

1. **Skill descriptions as table of contents** — Viktor injects only the one-line description, not the full content. Sunder currently injects full SOUL.md + USER.md into the system prompt. As memory grows, a catalog approach (inject descriptions → load on demand) would save tokens.

2. **Cron-specific learnings** — Each recurring job accumulates its own knowledge. Sunder's autopilot runs could benefit from a per-trigger `LEARNINGS.md` pattern.

3. **Structured skill directories** — `scripts/` and `references/` alongside SKILL.md is a clean pattern. Sunder's `memory/*.md` files are flat; adding structure per topic could help organization.

4. **User-editable memory** — "Viktor, remember how to do X" is a nice UX. Sunder's memory system already supports this via the agent's `write_file` tool, but making it more explicit in the UX could increase adoption.
