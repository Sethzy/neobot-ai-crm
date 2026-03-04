# Refactor Playbook

## Command Matrix

Use project scripts first when available, then direct tool commands.

- Duplication (`jscpd`)
  - Preferred: existing project script
  - Fallback: `pnpm exec jscpd ...` or `npx --no-install jscpd ...`
- Dead code (`knip`)
  - Preferred: existing project script
  - Fallback: `pnpm exec knip --reporter json` or `npx --no-install knip --reporter json`
- Modern lint pass
  - Base lint: `pnpm run lint` / `npm run lint`
  - React compiler rule: `react-compiler/react-compiler`
  - Deprecation rule: `deprecation/deprecation`
- Dependency drift
  - `pnpm outdated --format json` or `npm outdated --json`

## API Route Consolidation Checklist

1. Inventory all route files (`app/api/**/route.ts`, `pages/api/**`, `api/**`).
2. Group routes by domain and repeated validation logic.
3. Merge handlers that only differ by trivial branching.
4. Centralize shared parsing/validation in reusable utilities.
5. Preserve route contracts unless product asks for behavior changes.

## File Size and Restructuring Checklist

1. Flag files above 300-400 lines.
2. Split by responsibility:
   - Data access
   - Domain logic
   - UI rendering
   - Event handlers
3. Keep file moves mechanical first, then simplify logic.
4. Verify imports and tests after every split.

## Tests and Comments Checklist

1. Add tests around risky branches before major rewrites.
2. Prioritize unstable/slow tests that gate CI.
3. Remove brittle full-tree renders when targeted unit tests are enough.
4. Add concise comments only for non-obvious decisions or invariants.

## Docs Maintenance Checklist

1. Update docs when route contracts, architecture, or setup steps change.
2. Prefer short docs next to code ownership boundaries.
3. Keep changelog/release notes aligned with user-visible behavior changes.

## Dependency and Tool Upgrades

1. Upgrade in small batches by ecosystem (linting, testing, build, runtime).
2. After each batch: run lint, typecheck, and tests.
3. Defer major version upgrades that require broad migration unless requested.
4. Record deferred upgrades with explicit reason and owner.
