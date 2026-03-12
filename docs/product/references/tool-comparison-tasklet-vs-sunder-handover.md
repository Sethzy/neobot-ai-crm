# Tool Alignment Handover: Tasklet → Sunder

> **Input file:** `docs/product/references/tool-comparison-tasklet-vs-sunder.json`
> **Goal:** Zero drift between Sunder's agent tool descriptions/schemas and Tasklet's battle-tested v2 definitions.

## What this is

The JSON compares all 31 Tasklet v2 tools against Sunder's implementations. For each tool it records:

- **`tasklet`** — Tasklet's canonical definition (name, description, params)
- **`sunder`** — Sunder's current code as of last audit (name, description, params, file path)
- **`diffs`** — every difference between the two
- **`decision`** — what to change (or not change) and why

## Status meanings

| Status | What to do |
|--------|-----------|
| **DECIDED** | Implement the `decision` block. This is your work. |
| **PAUSED** | Do not touch. Blocked on other work (blocker noted in `decision.rationale`). |
| **DEFERRED** | Do not touch. Out of v1 scope entirely. |

## How to implement each DECIDED tool

For each tool where `"status": "DECIDED"`:

1. **Open the file** listed in `sunder.file`.
2. **Find the tool definition** — look for the `tool({ description: ... })` call matching the tool name.
3. **Check `decision.action`** to determine scope:

| Action | What to do |
|--------|-----------|
| `NO_CHANGES` | Skip — already aligned. |
| `UPDATE_DESCRIPTION_ONLY` | Replace the `description:` string with `decision.new_description`. |
| `UPDATE_DESCRIPTION_AND_PARAMS` | Replace description AND update params per `decision.param_changes`. |
| `COPY_TASKLET_VERBATIM` | Same as UPDATE_DESCRIPTION — the new description is a verbatim copy of Tasklet's (with brand swaps already applied in the JSON). |
| `DEFERRED_TO_PR32a` (or similar) | Skip — will be done in a future PR. |

4. **For `param_changes`**, each entry uses these fields:

| Field | Meaning |
|-------|---------|
| `new_describe` | Replace the param's `.describe("...")` with this exact text. |
| `add_describe` | This param currently has no `.describe()` — add one with this text. |
| `action: "KEEP_SUNDER"` | Don't change this param. Sunder's version is better. |
| `action: "SKIP"` | Tasklet has this param but Sunder intentionally doesn't. Ignore. |
| `add_validation` | Add a Zod validation constraint (e.g., `.min(1)`). |

5. **Verify before changing.** The `sunder` block is a snapshot. Before editing, confirm the current code still matches what the JSON says. If the code has changed since the audit, use judgment — the `decision.new_description` is still the target.

## Scope rules

- **Only change descriptions, `.describe()` strings, and Zod validation constraints.** Do not refactor tool logic, rename tools, or change execute behavior.
- **Only touch DECIDED tools.** There are 18 of them (Tools 1, 2, 4, 5, 6, 7, 8, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 31). Two of those (Tools 2, 18) are `NO_CHANGES`. Tool 11 is `DEFERRED_TO_PR32a`. So 15 tools need actual edits.
- **Sunder-only tools** (`search_knowledge`, `ask_user_question`, CRM tools) are out of scope for this task. They're tracked in the `sunder_only_tools` section of the JSON but have no decisions to apply.
- **Multi-line descriptions:** Some decided descriptions contain `\n` newlines. In code, use template literals or string concatenation to preserve them.

## Justified drifts (don't "fix" these)

These are intentional differences from Tasklet. Do not try to close these gaps:

| Tool | Drift | Why |
|------|-------|-----|
| read_file | No `pdf_start_page`, `pdf_end_page`, `pdf_format` params | Sunder sends the whole PDF as a single base64 blob — no page-level rendering. Works for v1's typical 1-5 page PDFs. Adding page-level control would require a PDF rendering library for a niche use case. Revisit if PDF-heavy workflows emerge. |
| write_file | No `action_pending`, `action_finished`, `action_error` params | Tasklet's streaming UI shows custom status text ("Writing file...", "File saved"). Sunder doesn't have this UI feature. |
| All tools | Tool names may differ from Tasklet (e.g., `manage_todo` vs `manage_tasks`) | Intentional — `decision.keep_name` specifies which name to use. |
| web_search | `limit` max 20 vs Tasklet's 100, location uses country codes vs free-text | Backend-driven (Brave API constraints), not a wording issue. |

## Validation

After implementing, for each tool:
1. Confirm the `description:` string matches `decision.new_description` exactly.
2. Confirm each param's `.describe()` matches the decided text.
3. Confirm any `add_validation` changes are applied (e.g., `old_string` should have `.min(1)`).
4. Run `pnpm tsc` to catch any type errors from schema changes.
5. Run existing tool tests: `pnpm vitest run src/lib/runner/tools/`.
