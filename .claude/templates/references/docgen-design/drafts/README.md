# Draft Docgen Patterns

This directory contains **draft patterns** for document generation - interesting approaches that have been captured for future reference but are **not yet production-ready**.

## Purpose

When you see an interesting pattern for docgen (form filling, document processing, data extraction, etc.), log it here. These are ideas to potentially productionize later.

## Key Differences from Production Patterns

| Aspect | Production (sibling folders) | Drafts (`drafts/`) |
|--------|---------------------------|-------------------|
| File name | `SKILL.md` | `PATTERN.md` |
| Status | Tested, documented | Ideas, rough notes |
| Referenced by | Orchestrator skills | Nothing (isolated) |
| Quality bar | High | Low - just capture |

## Workflow

1. **Capture**: Use `/new-docgen-pattern` skill to dump interesting patterns
2. **Review**: Periodically review drafts for patterns worth productionizing
3. **Promote**: Move validated patterns to sibling folder with proper `SKILL.md` format

## Directory Structure

```
drafts/
├── README.md                           # This file
└── {pattern-name}/                     # One folder per pattern
    └── PATTERN.md                      # Single markdown file
```

## Template

Each `PATTERN.md` follows this structure:

```markdown
---
status: draft
captured: YYYY-MM-DD
source: [where you found this]
tags: [relevant-tags]
---

# Pattern: {Pattern Title}

## TL;DR
> One-sentence summary

## The Pattern
{Original content}

## Why This Is Interesting
{Your notes}

## Potential Applications
- {Ideas}

## Open Questions
- {Things to figure out}
```

## Rules

- **NEVER** reference draft patterns from production skills
- **NEVER** put drafts in production folders (alongside `SKILL.md` files)
- **ALWAYS** use `PATTERN.md` (not `SKILL.md`) for drafts
- **ALWAYS** include capture date in frontmatter
