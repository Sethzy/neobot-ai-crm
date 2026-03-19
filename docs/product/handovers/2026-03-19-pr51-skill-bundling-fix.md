# PR51 Skill Bundling Fix — Handover

**Date:** 2026-03-19
**Fixed by:** Claude Code session
**Bug:** `ENOENT: no such file or directory` on first chat message after PR51 landed

---

## What Broke

PR51 added 7 default instruction skills + system skill loading. Both `skill-bootstrap.ts` and `system-skills.ts` used `readFile()` + `__dirname` to load `.md` files from disk at runtime. This works in Vitest (source tree), but breaks in Next.js because webpack bundles everything into `.next/server/app/api/chat/route.js` — the `.md` files are not included in that bundle.

The error path: `POST /api/chat → runAgent → assembleContext → bootstrapMemoryFiles → bootstrapSkills → readFile(join(__dirname, "defaults", "call-prep", "SKILL.md"))` → ENOENT because `__dirname` resolves to `.next/server/app/api/chat/`, not `src/lib/runner/skills/`.

## First Fix Attempt (commit 23b7030) — Also Failed

Another dev tried using `import.meta.url` to resolve asset paths. Webpack did pick up the `.md` files and placed them at `/_next/static/media/SKILL.a74190ae.md`. But that's a **browser URL**, not a filesystem path. The server-side `readFile("/_next/static/media/SKILL.a74190ae.md")` still got ENOENT.

## The Actual Fix

Followed the existing `src/lib/memory/templates.ts` pattern — all skill content inlined as TypeScript string constants. Webpack bundles strings into the JavaScript output. No filesystem reads at runtime.

### Files Changed

| File | What |
|---|---|
| `src/lib/runner/skills/skill-templates.ts` | **Created.** All 7 default skills + 2 system skills as `export const` string literals. Single source of truth for bundled skill content. |
| `src/lib/runner/skills/skill-bootstrap.ts` | **Rewritten.** Imports `DEFAULT_SKILL_CONTENT` from `skill-templates.ts`. No `readFile`, no `fs/promises` import. |
| `src/lib/runner/skills/system-skills.ts` | **Rewritten.** Imports `SYSTEM_SKILL_CONTENT` from `skill-templates.ts`. No `readFile`, no `fs/promises` import. Now synchronous (callers use `await` on it which is harmless). |
| `src/lib/runner/skills/bundled-skill-files.ts` | **Deleted.** The failed `import.meta.url` approach. |
| `src/lib/runner/skills/__tests__/bundled-skill-files.test.ts` | **Deleted.** Tests for deleted module. |
| `src/lib/runner/skills/__tests__/skill-templates.test.ts` | **Created.** 6 tests: all slugs have content, frontmatter is valid, no optional tool references. |

### Files NOT Changed

- `src/lib/runner/tools/storage/index.ts` — calls `getSystemSkillContent()` with `await`, still works (awaiting a non-promise returns the value).
- All other skill files (`discover-skills.ts`, `skill-bootstrap.test.ts`, `system-skills.test.ts`, etc.) — unchanged, all tests pass.
- `src/lib/runner/skills/defaults/` — **deleted** to avoid two sources of truth. `skill-templates.ts` is the single source.
- `src/lib/runner/skills/system/` — **deleted** for the same reason.

## The Pattern

```
WRONG (breaks in Next.js bundle):
  readFile(join(__dirname, "defaults", "call-prep", "SKILL.md"))

WRONG (import.meta.url resolves to browser URL):
  readFile(fileURLToPath(new URL("./defaults/call-prep/SKILL.md", import.meta.url)))

RIGHT (same as memory/templates.ts):
  import { DEFAULT_SKILL_CONTENT } from "./skill-templates";
  const content = DEFAULT_SKILL_CONTENT["call-prep"];
```

If you ever need to add bundled content that the server reads at runtime, use string constants in `.ts` files — never `readFile` from the source tree.

## Latent Bug Also Fixed

`system-skills.ts` had the same `readFile` + `__dirname` pattern from the original PR26a implementation. It hadn't blown up yet because the code path only triggers as a fallback (when Supabase Storage download fails for a `skills/system/*` path). It would have failed in production on Vercel. Now fixed — system skills use the same string constant pattern.

## Test Coverage

36 tests across 5 files, all passing:
- `skill-templates.test.ts` — 6 tests (content validity, frontmatter, tool references)
- `system-skills.test.ts` — 10 tests (path detection, content retrieval, traversal protection)
- `skill-bootstrap.test.ts` — 7 tests (seeding, conflicts, caching, error handling)
- `skill-integration.test.ts` — 2 tests (frontmatter validity across all defaults)
- `discover-skills.test.ts` — 11 tests (discovery, exclusions, frontmatter parsing)

Build verified: `npm run build` passes clean.

## How to Edit Skill Content Going Forward

Edit the string constants in `src/lib/runner/skills/skill-templates.ts`. This is the **single source of truth** — there are no separate `.md` files. The `defaults/` and `system/` directories have been deleted to prevent drift.
