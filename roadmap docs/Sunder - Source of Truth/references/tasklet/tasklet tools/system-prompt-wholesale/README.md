# Tasklet System Prompt Wholesale

Verbatim captures of the full Tasklet system prompt across versions.

## Files

- `00-v1-system-prompt-verbatim.md` — original system prompt (pre-March 2026)
- `01-v2-system-prompt-verbatim.md` — updated system prompt (captured 4 Mar 2026)

## Key Changes v1 → v2

- **`toolcalls` → `blocks`** — filesystem path and concept renamed throughout
- **New `<blocks>` section** — documents block storage, instant app execution blocks
- **New `<preview-panel-and-instant-apps>`** — instant apps (interactive TSX previews)
- **New `<pdf-generation>`** — skill file requirement for PDF work
- **Intelligence levels** — `basic ($) → advanced ($) → expert ($$) → genius ($$)`
- **Triggers expanded** — bullet-list format, "recommend most specific trigger" guidance
- **Sandbox filesystem** — clearer `/tmp/` vs `/agent/` guidance
- **Subagent file structure** — now uses code-fenced markdown template
- **Output guidance** — URL-encoding for filenames with spaces (`%20`)
- **Tool usage instruction** — appended at end (one tool per request)
- **Bullet style normalized** — `*` → `-` throughout

## Scope

Use these as the canonical reference for full prompt policy and runtime behavior directives.
