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
pnpm test:run
pnpm build
```

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
