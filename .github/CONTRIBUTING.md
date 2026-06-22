# Contributing

NeoBot is a portfolio/product repository for an AI CRM workspace. Keep changes
small, reviewable, and aligned with the existing Next.js, Supabase, and Managed
Agents architecture.

## Local Setup

```bash
pnpm install
pnpm dev
```

Copy `.env.example` to `.env.local` for local credentials. Never commit local
environment files, auth state, generated screenshots, or tool scratch output.

## Before Opening a PR

```bash
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
```

`pnpm test:run` runs the unit project. Run `pnpm test:integration` separately
after `supabase start` when a change touches RLS, trigger RPCs, approval events,
or other database behavior that needs real Postgres coverage.

Vercel deploy builds intentionally skip Next.js' duplicate lint/type validation
step. GitHub CI and the local commands above are the required correctness gate.

Prefer focused commits using conventional commit messages, for example:

```text
feat(crm): add company detail activity feed
fix(auth): handle expired Supabase session
docs(readme): clarify local setup
```

## Architecture Notes

- Runtime agent code lives in `src/lib/managed-agents/`.
- Runtime skill bundles live in `managed-agents/skills/`.
- Agent registration and upload scripts live in `scripts/managed-agents/`.
- Historical research belongs under `docs/archive/`.
