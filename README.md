# Sunder (Next.js App Router Migration)

This repo is now running on Next.js App Router.

## Scripts

- `npm run dev` starts Next.js dev server.
- `npm run dev:turbo` starts the dev server with Turbopack explicitly enabled.
- `npm run neo` clears `.next` and starts a fresh plain dev server.
- `npm run neo:turbo` clears `.next` and starts a fresh Turbopack dev server.
- `npm run build` creates a production build.
- `npm run start` runs the production build.
- `npm run lint` runs ESLint.
- `npm run test:run` runs Vitest suites.

## Environment

Copy `.env.example` to `.env.local` and fill in required values.

## Routing

- UI routes live in `app/**`.
- API routes are currently bridged through `pages/api/**` to preserve existing behavior:
  - `/api/chat`
  - `/api/docgen/generate`
  - `/api/gemini/process`

## Notes

- `next build` is configured to skip lint gating; use `npm run lint` for lint checks.
