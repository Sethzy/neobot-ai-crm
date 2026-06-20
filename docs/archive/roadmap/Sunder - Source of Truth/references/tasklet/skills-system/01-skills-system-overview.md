# Skills System Overview

This component documents Tasklet's system skills layer: markdown instruction files that constrain how the agent uses platform capabilities.

## Referenced Skill Files

- `/agent/skills/system/README.md`
- `/agent/skills/system/building-preview-apps/SKILL.md`
- `/agent/skills/system/creating-connections/SKILL.md`

## Purpose of Skills

- Standardize operational behavior for specific domains.
- Encode hard constraints (security, UX, tooling, and flow requirements).
- Reduce policy drift across sessions.

## Themes in Current Skills

1. Preview app development discipline
- CSP-safe dependencies
- strict response-shape validation
- optimistic UI with rollback
- persistence via SQL/file tools (not browser storage)

2. Connection-creation policy
- prefer pre-built integrations
- verify capabilities before enabling
- treat direct API/computer use as specialized paths

