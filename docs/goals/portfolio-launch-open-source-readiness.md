# Portfolio Launch And Open Source Readiness

## Decision / Outcome

The Sunder repository is ready to publish from a portfolio page and open source publicly only when the current launch branch is verified, the intended production deployment matches the launch version, local quality gates pass, core UI flows are browser-checked, open-source setup files are tidy, and both current files plus reachable Git history have no unresolved secret findings.

Current state as of 2026-06-17: not complete. Local filesystem permissions are restored, test fixes are in progress, and the latest checked public Vercel production site does not currently match this repository's Sunder CRM/autopilot app.

## Evidence Surface

Strong evidence includes:

- Current branch and deployment commit are identified and match, or any deliberate difference is documented.
- Production deployment URL is reachable and core UI flows are manually verified in a browser.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass, or the repo's actual equivalent commands are discovered and run.
- Managed Agent test or eval commands, if run, use `claude-haiku-4-5` or the latest Haiku model only.
- Secret scanning covers both the working tree and Git history with a real scanner such as `gitleaks`, `trufflehog`, or an equivalent, and any findings are remediated or explicitly classified as false positives.
- Open-source files are reviewed or created as needed: `README`, `.gitignore`, `.env.example`, `LICENSE`, contribution or setup notes if appropriate.
- Deployment configuration is reviewed for obviously missing production environment variables without exposing secret values.

Proxy evidence includes:

- Static file searches for common secret patterns when a dedicated scanner is unavailable.
- Local build output when the production deployment cannot be reached due to external access or account limits.

## Scope And Boundaries

In scope:

- `/Users/sethlim/Documents/neobot-ai-crm`
- Production readiness checks for the current Next.js, Supabase, Vercel, Anthropic Managed Agents, Vercel AI SDK, and Composio implementation.
- Repository hygiene needed before public release.
- Secret detection and remediation for files tracked by Git, untracked launch-relevant files, and reachable Git history.
- Vercel deployment verification when local credentials and project configuration allow it.
- Documentation updates that help external users understand what the project is, how to run it, and which environment variables are required.

Out of scope unless explicitly requested later:

- Major product redesigns or large feature changes.
- Replacing Anthropic Managed Agents with another agent runtime.
- Broad dependency upgrades unrelated to launch readiness.
- Publishing secrets, printing full secret values, or weakening `.gitignore` protections.
- Database migrations that are not required for launch readiness.
- Real production Managed Agent tests with Sonnet or Opus.

## Constraints

- Preserve existing architecture: Anthropic Managed Agents remain the runner engine, and Vercel AI SDK stays limited to title generation, thread compaction, and chat UI message adapters.
- Always use `claude-haiku-4-5` or the latest Haiku for Managed Agent testing.
- Use Supabase MCP for migrations if a migration becomes necessary.
- Use Context7 MCP before relying on current third-party library or platform documentation.
- Keep changes straightforward, readable, and scoped to launch readiness.
- Do not commit or expose secrets. If a secret appears to be present, stop using the value, record only a redacted finding, and remediate safely.
- Do not mark the Goal complete based on intent or partial checks; current evidence must prove the deliverables.

## Iteration Policy

After each work pass:

- Update the Completion Audit statuses with the exact command, file, URL, or artifact proving progress.
- Record notable findings in the Iteration Log, including failed checks and chosen remediations.
- Re-run the narrowest relevant checks after each fix, then broaden to full verification before completion.
- If a scanner reports possible secrets, classify each finding as confirmed, false positive, or unresolved using redacted evidence only.
- If deployment fails, inspect logs or configuration evidence, fix the smallest likely cause, and retry when safe.

## Blocked Condition

The Goal is blocked only if progress is impossible or irresponsible after repeated attempts because:

- Required Vercel, Supabase, Anthropic, Composio, or scanner credentials are unavailable.
- A confirmed secret exists in Git history and requires account-owner rotation, repository rewrite approval, or external revocation before public release.
- Production deployment requires a user-owned approval, billing action, DNS change, or account setting that Codex cannot perform.
- Required documentation or license choice needs a product/legal decision from the user.

To unblock, provide the missing access, confirm the external action has been completed, or decide the unresolved product/legal question.

## Completion Audit

| Deliverable | Evidence Required | Status | Evidence Link / Command |
| --- | --- | --- | --- |
| Launch branch identified | Current branch, HEAD commit, and intended deployment target recorded | In progress | Branch `feat/twenty-aesthetic-clone`, HEAD `3cf9706e30f50b732ca173786704a9ecdb5a5073` via `git status --short --branch` and `git rev-parse HEAD`. Deployment target still needs decision because local `.vercel` project and public `www.trysunder.com` point at different Vercel projects. |
| Source of truth checked | v2 implementation plan reviewed for remaining launch-critical work | In progress | AGENTS references `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`, but the current repo contains `docs/product/plans/2026-03-05-implementation-phasing-plan-v2-deprecate.json` and `docs/product/plans/2026-04-13-PR-list-sunder-current.json`. This documentation drift is launch hygiene to record or correct. |
| Local quality gates pass | Lint, typecheck, tests, and production build pass or documented equivalents pass | Complete | `pnpm lint` passed with typography lint. `pnpm exec tsc --noEmit` passed. `pnpm test:run` passed after Vitest project split cleanup: 436 files, 2,476 tests. `pnpm build` passed on Next.js 15.5.12. Build emitted non-fatal warnings for the missing Next ESLint plugin and sitemap Supabase fallback during local static generation. |
| Core UI verified | Browser verification of the production or local production build across key launch flows | Complete locally | Local production server `PORT=3001 pnpm start`; Playwright verified `/` title `Sunder | The AI autopilot for advisory sales`, `/login` title `Sign in · Sunder`, `/register` title `Create account · Sunder`, signed-out `/chat` redirects to `/login?redirect=%2Fchat`, signed-out `/customers/people` redirects to `/login?redirect=%2Fcustomers%2Fpeople`, and mobile 390x844 landing viewport had 0 console errors/warnings. Screenshot artifact: `.playwright-mcp/sunder-local-mobile-home.png`. |
| Production deployment verified | Vercel production URL reachable and mapped to intended commit, or blocker documented | Blocked by mismatch | Vercel `sunder` project latest production commit was `0b56ba783fef56c1474bc72f79cb97be3a83c1ce` from repo `Sethzy/Sunder`; `https://www.trysunder.com` returns a document-processing Vite site, not this Next.js CRM/autopilot app. Local `.vercel` project `sunder-next-migration-20260225` is separate and had no current production URL in project listing. |
| Open-source hygiene complete | README, license, env example, ignore rules, and public-facing docs reviewed or updated | Needs license decision | README now uses Sunder naming and pnpm commands. `.env.example`, `scripts/property-pipeline/.env.example`, PostHog handover docs, Composio example docs, and Google Maps handover prose were cleaned to avoid real/example-shaped keys. `.gitleaksignore` records reviewed historical fingerprints. No root `LICENSE` exists yet; user needs to choose a license before this is truly open source. |
| Secrets absent from working tree | Dedicated scanner or documented fallback scan reports no unresolved secrets in current files | Complete | Current publishable-files scan covers tracked plus untracked non-ignored files, excluding ignored local env/build artifacts: `gitleaks detect --source /tmp/neobot-ai-crm-current-files --no-git --redact=100 --report-format json --report-path /tmp/neobot-ai-crm-local-current-files-final.json --exit-code 0 --gitleaks-ignore-path .gitleaksignore`; result: no leaks found. `.env.local` and `scripts/property-pipeline/.env` are not tracked and are ignored by `.gitignore`. |
| Secrets absent from Git history | Dedicated scanner or documented fallback scan reports no unresolved secrets in reachable history | Complete with reviewed ignores | Local all-ref scan: `gitleaks detect --source . --log-opts=--all --redact=100 --report-format json --report-path /tmp/neobot-ai-crm-local-all-refs-after-ignore.json --exit-code 0`; result: 1,046 commits scanned, no unresolved leaks found. Commit history preserved; historical false-positive/public-example fingerprints are documented in `.gitleaksignore`. |
| Sensitive findings remediated | Confirmed findings are removed, rotated externally if needed, and re-scanned | Complete for repo contents | Current confirmed/public-hygiene findings were removed from source templates/docs/tests. No private secret was confirmed in Git. No history rewrite performed. |
| Final launch notes recorded | Final Result summarizes evidence, known limitations, and deployment URL | Not started |  |

## Goal Prompt

```text
/goal Make /Users/sethlim/Documents/neobot-ai-crm production-ready for a portfolio launch and safe to open source publicly, verified by matching the intended latest deployed version to the current launch commit, passing the repo's lint/typecheck/test/build gates, browser-checking core app flows, verifying the Vercel production deployment, reviewing or updating open-source docs and env examples, and scanning both the working tree and reachable Git history for secrets with no unresolved findings. Preserve the existing Anthropic Managed Agents, Vercel AI SDK, Supabase, and Vercel architecture; use only claude-haiku-4-5 or the latest Haiku for Managed Agent testing; use Context7 for current library/platform documentation; use Supabase MCP for any required migrations; avoid broad dependency upgrades or product redesigns unless launch-blocking evidence requires them. Between iterations, update docs/goals/portfolio-launch-open-source-readiness.md with completed evidence, failed checks, remediations, and next actions. If blocked or no valid paths remain, record attempted paths, redacted evidence gathered, the exact blocker, and what would unlock progress.
```

## Iteration Log

- 2026-06-17: Restored local access confirmed. `pwd`, `ls -la`, `git status --short --branch`, `git rev-parse HEAD`, and reading this goal file all succeed after the earlier macOS permission failure.
- 2026-06-17: Preserving commit history is an explicit user requirement. If a real historical secret is found, the safe path is redacted reporting plus rotation/revocation and explicit user approval before any rewrite.
- 2026-06-17: Deployment evidence currently shows a mismatch. Public `www.trysunder.com` is reachable but points to a different Vercel project/repository/product than this Next.js app, so production readiness cannot be claimed yet.
- 2026-06-17: Test remediation in progress. Stale Telegram CTA assertions were corrected to match the current channels/Profile UX, automation route tests no longer import the heavy real spawn module, CRM RLS seed data now uses `amount`, and integration tests were isolated to avoid shared local Supabase races.
- 2026-06-17: Open-source hygiene pass removed key-shaped values from `.env.example`, `scripts/property-pipeline/.env.example`, PostHog handover docs, Composio anti-pattern examples, and a Google Maps handover false-positive phrase. Local Supabase integration helper now derives local test tokens from env, `supabase status`, or the running Supabase auth container instead of storing local JWTs in source.
- 2026-06-17: Secret scanning now passes for current publishable files and full local reachable history. Historical gitleaks findings are preserved as reviewed fingerprints in `.gitleaksignore`; no commit history rewrite was used.
- 2026-06-17: Local gates passed: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test:run` (436 files, 2,476 tests), and `pnpm build`. Vitest projects now run unit files separately from the 3 serial DB integration files.
- 2026-06-17: Local production browser check passed on `http://localhost:3001` for landing, login, register, protected-route redirects, and mobile landing viewport with zero console errors/warnings.

## Final Result
