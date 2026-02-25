---
name: new-docgen-pattern
description: Log a new docgen pattern as a draft for future reference. Creates structured PATTERN.md in drafts folder.
---

# New Docgen Pattern

## Overview

Capture interesting docgen patterns as drafts for future reference.

**Core principle:** Dump pattern -> Generate name -> Create structured draft.

**Announce at start:** "I'm using the new-docgen-pattern skill to capture this pattern."

## The Process

### Step 1: Receive Pattern Content

Accept raw pattern content from user - can be:
- Copy-pasted text
- URL to fetch
- Description to expand

### Step 2: Extract/Generate Pattern Name

- If pattern has a clear title, use it
- Otherwise, generate descriptive name from content
- Format: lowercase-with-dashes (e.g., `target-driven-form-filling`)

### Step 3: Ask for Metadata

Use AskUserQuestion to gather:
- **Source** (where did you find this?)
- **Tags** (optional, for categorization)

### Step 4: Create Draft Structure

1. Create folder: `.claude/templates/references/docgen-design/drafts/{pattern-name}/`
2. Create `PATTERN.md` with this template:

```markdown
---
status: draft
captured: {today's date}
source: {user-provided or "personal observation"}
tags: [{tags}]
---

# Pattern: {Pattern Title}

## TL;DR
> {Generated one-sentence summary}

## The Pattern

{Original content, lightly formatted}

## Why This Is Interesting

{User's notes if provided, or placeholder}

## Potential Applications

- {Placeholder - to be filled}

## Open Questions

- {Placeholder - to be filled}
```

### Step 5: Confirm

Show path to created file and summary.

## Red Flags

**Never:**
- Put drafts in production pattern folders (alongside `SKILL.md` files)
- Reference draft patterns from production skills
- Delete or overwrite existing patterns without confirmation

**Always:**
- Use `PATTERN.md` (not `SKILL.md`) for drafts
- Include capture date in frontmatter
- Keep original content intact in "The Pattern" section
