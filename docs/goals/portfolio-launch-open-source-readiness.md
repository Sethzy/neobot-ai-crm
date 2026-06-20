# Portfolio Launch And Open Source Readiness

## Decision / Outcome

The Sunder repository is ready to publish from a portfolio page and open source publicly only when the current launch branch is verified, the intended production deployment matches the launch version, local quality gates pass, core UI flows are browser-checked, open-source setup files are tidy, and both current files plus reachable Git history have no unresolved secret findings.

Current state as of 2026-06-17: mostly complete but not fully public-launch complete. Local gates pass, redacted secret scans pass for current files and reachable history, the launch branch has been merged to `main`, and the current Next.js app is deployed successfully to Vercel production. Public access still needs the registrar DNS record for `app.trysunder.com`, and open-source release still needs a license decision.

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
| Launch branch identified | Current branch, app-code commit, and intended deployment target recorded | Complete | Branch `feat/twenty-aesthetic-clone` was merged into `main` with history preserved. Latest app-code commit is `c18e0b6f2a43d01831d3fa88a35a749ac09cb127`; goal/evidence documentation commits may sit on top. Deployment target is Vercel project `sunder-next-migration-20260225`. |
| Source of truth checked | v2 implementation plan reviewed for remaining launch-critical work | Complete with drift noted | AGENTS now references `docs/product/plans/2026-04-13-PR-list-neobot-current.json`; the deprecated v2 phasing plan remains at `docs/product/plans/2026-03-05-implementation-phasing-plan-v2-deprecate.json` for historical context. |
| Local quality gates pass | Lint, typecheck, tests, and production build pass or documented equivalents pass | Complete | `pnpm lint` passed with typography lint. `pnpm exec tsc --noEmit` passed. `pnpm test:run` passed after Vitest project split cleanup: 436 files, 2,476 tests. `pnpm build` passed on Next.js 15.5.12. Build emitted non-fatal warnings for the missing Next ESLint plugin and sitemap Supabase fallback during local static generation. |
| Core UI verified | Browser verification of the production or local production build across key launch flows | Complete locally | Local production server `PORT=3001 pnpm start`; Playwright verified `/` title `Sunder | The AI autopilot for advisory sales`, `/login` title `Sign in · Sunder`, `/register` title `Create account · Sunder`, signed-out `/chat` redirects to `/login?redirect=%2Fchat`, signed-out `/customers/people` redirects to `/login?redirect=%2Fcustomers%2Fpeople`, and mobile 390x844 landing viewport had 0 console errors/warnings. Screenshot artifact: `.playwright-mcp/sunder-local-mobile-home.png`. |
| Production deployment verified | Vercel production URL reachable and mapped to intended commit, or blocker documented | Deployed; public DNS pending | `vercel --prod --yes --scope sethzys-projects` succeeded for deployment `dpl_4BSNUhigNY1Dhk43TEtgR9cR6pfs`, URL `https://sunder-next-migration-20260225-7umj3m96l-sethzys-projects.vercel.app`, status `READY`. Generated `.vercel.app` URLs are behind Vercel Authentication. `app.trysunder.com` is attached to the project and verified in Vercel, but registrar DNS is missing; add `A app.trysunder.com 76.76.21.21` before public browser verification. Existing `www.trysunder.com` remains attached to the separate `sunder` Vite project. |
| Open-source hygiene complete | README, license, env example, ignore rules, and public-facing docs reviewed or updated | Needs license decision | README now uses Sunder naming and pnpm commands. `.env.example`, `scripts/property-pipeline/.env.example`, PostHog handover docs, Composio example docs, and Google Maps handover prose were cleaned to avoid real/example-shaped keys. `.gitleaksignore` records reviewed historical fingerprints. No root `LICENSE` exists yet; user needs to choose a license before this is truly open source. |
| Secrets absent from working tree | Dedicated scanner or documented fallback scan reports no unresolved secrets in current files | Complete | Current publishable-files scan covers tracked plus untracked non-ignored files, excluding ignored local env/build artifacts: `gitleaks detect --source /tmp/neobot-ai-crm-current-files --no-git --redact=100 --report-format json --report-path /tmp/neobot-ai-crm-local-current-files-final.json --exit-code 0 --gitleaks-ignore-path .gitleaksignore`; result: no leaks found. `.env.local` and `scripts/property-pipeline/.env` are not tracked and are ignored by `.gitignore`. |
| Secrets absent from Git history | Dedicated scanner or documented fallback scan reports no unresolved secrets in reachable history | Complete with reviewed ignores | Final local all-ref scans after dependency fixes and goal-note updates used `gitleaks detect --source . --log-opts=--all --redact=100 --report-format json --exit-code 0`; latest recorded report path: `/tmp/neobot-ai-crm-all-refs-final-goal-note.json`. Result: no unresolved leaks found. Commit history preserved; historical false-positive/public-example fingerprints are documented in `.gitleaksignore`. |
| Sensitive findings remediated | Confirmed findings are removed, rotated externally if needed, and re-scanned | Complete for repo contents | Current confirmed/public-hygiene findings were removed from source templates/docs/tests. No private secret was confirmed in Git. No history rewrite performed. |
| Final launch notes recorded | Final Result summarizes evidence, known limitations, and deployment URL | Complete | See Final Result below. |

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
- 2026-06-17: Vercel production deploy initially failed on missing markdown-renderer dependencies. Fixed by declaring direct dependencies `@types/hast` and `remark-gfm`, then redeployed successfully to `sunder-next-migration-20260225`.
- 2026-06-17: `app.trysunder.com` was added to Vercel project `sunder-next-migration-20260225`. Vercel still requires registrar DNS: `A app.trysunder.com 76.76.21.21`. Public generated Vercel URLs remain protected by Vercel Authentication.
- 2026-06-17: Branch `feat/twenty-aesthetic-clone` was pushed to GitHub after retrying HTTPS with HTTP/1.1 to avoid an RPC disconnect.
- 2026-06-17: `origin/main` moved while finishing the branch, so it was merged into `feat/twenty-aesthetic-clone` with a normal merge commit, preserving both histories. `main` was then fast-forwarded to the merged launch history and pushed to GitHub.

## Final Result

Done:

- Current launch history is merged to `main` and pushed. Latest app-code commit is `c18e0b6f2a43d01831d3fa88a35a749ac09cb127`; final goal/evidence documentation is pushed on top.
- Local gates pass: lint, TypeScript, full Vitest run, and Next.js production build.
- Local production browser checks pass for landing, auth pages, protected-route redirects, and mobile landing.
- Current publishable files and reachable Git history pass redacted gitleaks scans with no unresolved leaks. Commit history was preserved; no rewrite was performed.
- Latest Next.js app is deployed to Vercel production as deployment `dpl_4BSNUhigNY1Dhk43TEtgR9cR6pfs`.
- `app.trysunder.com` is attached to the correct Vercel project.

Remaining before calling this fully public-launch/open-source complete:

- Add registrar DNS record `A app.trysunder.com 76.76.21.21`, then verify `https://app.trysunder.com` publicly in a browser.
- Choose and add a root `LICENSE` before making the repository public.
- Decide whether `www.trysunder.com` should remain on the separate Vite site or be moved to this Next.js app.
