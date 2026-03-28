# Handover: Sprites Sandbox Removal — Code Review

**Date:** 2026-03-28
**Commit:** `refactor: remove Sprites sandbox — clean slate for Vercel Sandbox migration`
**Reviewer task:** Verify the removal is clean, nothing broke, and the codebase is ready for Vercel Sandbox implementation from scratch.

---

## Context

Sunder is replacing its sandbox architecture:
- **Old:** Sprites (Fly.io) — one persistent VM per client, nested Claude Code agent inside, async job state machine with webhook callbacks
- **New:** Vercel Sandbox — ephemeral per-run sandboxes from a golden snapshot, direct `run_command` tool on the outer agent, no nested agent

The design doc is at `docs/plans/2026-03-28-vercel-sandbox-migration-design.md`. This commit removes all Sprites code to start from a clean slate. The new implementation will be built separately.

---

## What Was Removed (49 files, -4,588 lines)

### Deleted entirely

| Directory/File | What it was |
|---|---|
| `src/lib/sandbox/` (14 source + 13 test files) | Sprites SDK client, session management, async job system, Claude Code launcher, superpowers, skill loader, types, env, paths, delivery, SSRF protection |
| `src/lib/runner/tools/sandbox/` (2 files) | `execute_in_sandbox` tool definition + barrel export |
| `app/api/sandbox/callback/route.ts` | Webhook callback for async job completion |
| `app/api/cron/cleanup-sprites/route.ts` | Daily cron to destroy stale Sprites |
| `src/lib/runner/skills/__tests__/sandbox-skills.test.ts` | Sandbox skill test |

### Edited (remove sandbox references)

| File | What changed |
|---|---|
| `src/lib/runner/tool-registry.ts` | Removed `isSandboxConfigured` import, `createSandboxTools` import/call, `...sandboxTools` spread |
| `src/lib/runner/tools/index.ts` | Removed `createSandboxTools` export |
| `src/lib/runner/run-agent.ts` | Removed `isSandboxConfigured` import and `includeSandboxTools` flag |
| `src/lib/ai/system-prompt.ts` | Removed entire `SANDBOX_PROMPT` export (~23 lines) |
| `src/lib/runner/context.ts` | Removed `SANDBOX_PROMPT` import, `includeSandboxTools` from 3 interfaces + all pass-throughs, sandbox prompt injection block, `sprite_jobs` active job query + context injection (~20 lines) |
| `app/api/cron/scan/route.ts` | Removed Sprites imports, sprite job checking block, `spriteJobs` from response |
| `src/lib/runner/skills/skill-bootstrap.ts` | Removed `migrateSkillBodies()` function, `MIGRATED_SKILL_SLUGS`, `SKILL_MIGRATION_VERSION`, `migratedClients` Set |
| `src/lib/runner/skills/skill-templates.ts` | Removed 7 sandbox skill slugs + template content, updated 5 skill descriptions (see below) |
| `package.json` | Removed `@fly/sprites` dependency |
| `src/types/database.ts` | Removed `sprite_sessions` and `sprite_jobs` type definitions (~99 lines) |
| `src/clients/skill-registry.ts` | Updated deprecated comment (removed sandbox references) |
| `src/components/ui/badge.tsx` | Added back `success` variant (pre-existing build fix, unrelated to sandbox) |

### Tests updated

| File | What changed |
|---|---|
| `src/lib/runner/__tests__/tool-registry.test.ts` | Removed sandbox mock setup + 3 sandbox test cases |
| `src/lib/ai/__tests__/system-prompt.test.ts` | Removed `SANDBOX_PROMPT` import + test case |
| `src/lib/runner/__tests__/context.test.ts` | Removed "active background jobs" `describe` block (2 test cases testing `sprite_jobs` injection) |
| `src/lib/runner/__tests__/integration-lifecycle.test.ts` | Removed `vi.mock("@/lib/sandbox/env")` |
| `src/lib/runner/skills/__tests__/skill-templates.test.ts` | Updated expected slug count from 20 to 13 |

### New

| File | What |
|---|---|
| `supabase/migrations/20260328120000_drop_sprite_tables.sql` | `DROP TABLE IF EXISTS sprite_jobs; DROP TABLE IF EXISTS sprite_sessions;` |

---

## Skill Templates: What Was Kept vs Removed vs Modified

### 13 skills kept (unchanged)

`onboarding`, `call-prep`, `daily-briefing`, `draft-outreach`, `pipeline-review`, `opportunity-analysis`, `call-summary`, `market-briefing`

### 5 skills kept but modified (sandbox instructions replaced)

| Skill | Change |
|---|---|
| `deal-comparison` | "Step 4: Hand off to coding agent" → "Step 4: Analyze and present" — removed `execute_in_sandbox()` call, replaced with "present the results with tables" |
| `property-showcase` | "Step 6: Hand off to coding agent" → "Step 6: Present the showcase" — removed `execute_in_sandbox()` call, replaced with "present a structured property showcase" |
| `market-report` | "Step 5: Hand off to coding agent" → "Step 5: Analyze and present" — removed `execute_in_sandbox()` call |
| `re-analyst` | Description changed from "read by the coding agent inside the sandbox" to "Used when building financial models and analysis" — content body unchanged |
| `frontend-design` | Description changed from "read by the coding agent inside the sandbox" to just the design preferences description — content body unchanged |

### 7 skills removed entirely (sandbox-only)

| Skill | What it was |
|---|---|
| `pdf_creation` | WeasyPrint HTML→PDF instructions |
| `excel_editing` | openpyxl/pandas/LibreOffice Excel instructions |
| `docx_editing` | python-docx Word document instructions |
| `pptx_editing` | python-pptx PowerPoint instructions |
| `pdf_form_filling` | PyMuPDF form filling instructions |
| `pdf_signing` | PyMuPDF signature overlay instructions |
| `publish_website` | here.now API publishing instructions |

**These are recoverable from git history** (`git show HEAD~1:src/lib/runner/skills/skill-templates.ts`). When the Vercel Sandbox `run_command` tool is implemented, these skill templates should be adapted to use `run_command` instead of `execute_in_sandbox` and re-added. The actual content (WeasyPrint patterns, openpyxl formulas, etc.) is valuable and reusable.

---

## Review Checklist

1. **No broken imports:** Run `grep -r "from.*@/lib/sandbox" src/ app/` — should return nothing
2. **No stale references:** Run `grep -r "execute_in_sandbox\|SpriteHandle\|sprite_jobs\|sprite_sessions\|createSandboxTools\|isSandboxConfigured\|SANDBOX_PROMPT" src/` — should return nothing
3. **Tests pass:** `pnpm vitest run src/lib/runner/__tests__/tool-registry.test.ts src/lib/runner/__tests__/context.test.ts src/lib/runner/skills/__tests__/skill-templates.test.ts` — all should pass
4. **Pre-existing failures (not introduced by this commit):**
   - `src/lib/ai/__tests__/system-prompt.test.ts` — "does not contain bare model-facing path references" fails due to bare `SOUL.md` reference (pre-existing)
   - `pnpm build` — type error in `app/(dashboard)/cases/[caseId]/documents/[docId]/page.tsx` due to WIP autopilot timezone column (pre-existing from WIP commit)
5. **DB migration:** `supabase/migrations/20260328120000_drop_sprite_tables.sql` drops `sprite_jobs` then `sprite_sessions` — verify neither table has reverse FK dependencies (they don't)
6. **Lock file:** `pnpm-lock.yaml` no longer references `@fly/sprites`
7. **Skill count:** `DEFAULT_SKILL_SLUGS` should have exactly 13 entries
8. **Modified skills make sense:** Read the updated `deal-comparison`, `property-showcase`, and `market-report` skills — the gathering steps (CRM, web search, browser scrape) are preserved, only the "hand off to sandbox" final step was replaced with a generic "analyze and present" step

---

## What Comes Next

The Vercel Sandbox implementation will be built from scratch per the design doc. Key differences from the old architecture:
- **No nested agent** — the outer agent calls `run_command` directly
- **Ephemeral per-run** — sandbox boots from a golden snapshot, dies after the run
- **No async job system** — `run_command` is synchronous (awaited by the Vercel Function)
- **No webhook callbacks** — results come back in the `run_command` response
- **The 7 removed skill templates** will be re-added with `run_command` instructions instead of `execute_in_sandbox`
