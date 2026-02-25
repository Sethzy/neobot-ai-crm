# Next.js Migration Plan (KISS, Docs-Aligned)

**Date:** 2026-02-25  
**Owner:** Migration lead  
**Goal:** Migrate Sunder from Vite + TanStack Router to Next.js App Router with production parity first, then optimization.

---

## Why This Version Exists

This replaces the previous plan with a simpler and safer approach:

1. Keep git history (no `git init` in a fresh folder).
2. Keep secrets out of docs and commits.
3. Use Next.js App Router defaults correctly (Server Components by default, `'use client'` only where needed).
4. Migrate in phases with hard exit criteria.
5. Protect the highest-risk area (`/api/chat` SSE stream) with contract tests.

---

## Official References Used

1. Next.js App Router migration and Server/Client guidance  
   - https://nextjs.org/docs/app/guides/migrating/app-router-migration
2. Next.js Route Handlers and streaming responses  
   - https://nextjs.org/docs/app/building-your-application/routing/route-handlers
3. Supabase SSR for Next.js App Router (`@supabase/ssr`)  
   - https://supabase.com/docs/guides/auth/server-side/nextjs
4. Supabase SSR middleware cookie requirements (`getAll` + `setAll`)  
   - https://github.com/supabase/ssr/blob/main/docs/design.md

---

## Scope

### In Scope

1. Next.js 15 App Router migration.
2. Route migration for public, auth, and dashboard pages.
3. API migration from Vercel-style handlers to App Router Route Handlers.
4. Supabase auth migration with middleware refresh flow.
5. Test and build stability at parity level.

### Out of Scope (for this migration PR series)

1. Full rewrite to Server Actions for all mutations.
2. Full removal of React Query.
3. UI redesign.
4. Feature expansion.

---

## Architecture Decisions (KISS)

1. **Parity first, optimize second.** Preserve behavior and contracts before refactors.
2. **Server by default.** Use Server Components for page shells/data loading. Add `'use client'` only for interactive islands.
3. **Keep existing `src/` code layout initially.** Do not mass-move files during migration.
4. **Keep React Query for dashboard interactions in phase 1 parity.** Revisit later.
5. **Preserve API contracts.** `/api/chat` SSE event format must remain unchanged for current frontend parser.
6. **No secrets in docs.** `.env.local` never committed; sample env file uses placeholders only.

---

## Repo Strategy

Create a new repo folder **with history preserved**:

```bash
cd /Users/sethlim/Documents
git clone /Users/sethlim/Documents/Sunder sunder-next
cd sunder-next
git checkout -b migration/nextjs-app-router
```

Do not run `git init`.

---

## Baseline Inventory (Current App)

1. TanStack Router imports are widespread (routes + components + tests).
2. API functions:
   - `api/chat.ts` ~998 lines (SSE streaming, highest risk)
   - `api/gemini/process.ts` ~820 lines
   - `api/docgen/generate.ts` ~186 lines
3. Auth is currently route-guarded via TanStack `beforeLoad` in `src/routes/__root.tsx`.

---

## Phase Plan

## Phase 0: Baseline and Guardrails

**Goal:** Snapshot current behavior before edits.

### Tasks

1. Save current route map and API contract notes in docs.
2. Run baseline checks in `sunder-next` and store output:
   - `npm run build`
   - `npm run test:run`
   - `npm run lint`
3. Add migration checklist doc section for parity criteria.

### Exit Criteria

1. Baseline outputs captured.
2. Known failing tests/lint documented (so new failures are detectable).

---

## Phase 1: Bootstrap Next.js Runtime

**Goal:** Start Next.js App Router without deleting old code yet.

### Tasks

1. Install Next dependencies:
   - `next`
   - `@supabase/ssr`
2. Keep old scripts temporarily and add transitional scripts:
   - `dev:next`, `build:next`, `start:next`
3. Create minimal App Router skeleton:
   - `app/layout.tsx`
   - `app/page.tsx`
   - `app/globals.css`
   - `next.config.ts`
4. Add `middleware.ts` placeholder (no auth logic yet).
5. Keep Vite files for now; remove only after cutover.

### Exit Criteria

1. `npm run dev:next` boots successfully.
2. `/` renders from Next app.
3. Existing Vite app still runnable via old script during transition.

---

## Phase 2: Shared Foundation and Auth

**Goal:** Set up Supabase and auth correctly for App Router.

### Tasks

1. Add Supabase helpers:
   - `src/lib/supabase/client.ts` using `createBrowserClient`
   - `src/lib/supabase/server.ts` using `createServerClient`
2. Add middleware auth refresh using official Supabase pattern:
   - Implement `getAll` and `setAll` cookie handling.
   - Ensure cookie writes are propagated on response.
3. Add route access rules (public/auth/protected) in middleware.
4. Normalize environment variable strategy:
   - Client: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Server: `SUPABASE_SERVICE_ROLE_KEY`, AI keys, etc.
5. Add `.env.example` placeholders (no real values).

### Exit Criteria

1. Unauthenticated protected route redirects to `/login`.
2. Authenticated user visiting `/login` redirects to app default (`/chat` or `/cases`).
3. Session refresh survives hard reload.

---

## Phase 3: Route Migration (App Router)

**Goal:** Replace TanStack route entrypoints with App Router pages.

### Route Groups

1. `app/(public)`
2. `app/(auth)`
3. `app/(dashboard)`

### Tasks

1. Migrate layouts:
   - `app/layout.tsx` (root)
   - `app/(dashboard)/layout.tsx`
2. Migrate public pages:
   - `/`, `/demo`, `/industries`, `/industries/[slug]`, `/use-cases`, `/use-cases/[slug]`
3. Migrate auth pages:
   - `/login`, `/register`, `/forgot-password`, `/update-password`, `/auth/confirm`
4. Migrate dashboard pages:
   - `/chat`, `/cases`, `/cases/[caseId]`, `/cases/[caseId]/documents/[docId]`
   - `/automations`, `/channels`, `/crm`, `/knowledge`, `/memory`, `/mission-control`, `/settings`, `/tasks`
5. For each route:
   - Move route-level metadata to `metadata` / `generateMetadata`.
   - Keep page shell as Server Component unless interactivity requires client.
   - Extract interactive portions into Client Components.
6. Add `loading.tsx` and `error.tsx` only where needed first (dashboard routes + slow pages).

### Exit Criteria

1. All route URLs resolve in Next app.
2. Sidebar and main nav links work.
3. Auth redirects are equivalent to current behavior.

---

## Phase 4: API Migration (Route Handlers)

**Goal:** Port API endpoints while preserving request/response contracts.

### Endpoint Order (low risk to high risk)

1. `/api/docgen/generate`
2. `/api/gemini/process`
3. `/api/chat` (SSE streaming)

### Tasks

1. Create route handlers:
   - `app/api/docgen/generate/route.ts`
   - `app/api/gemini/process/route.ts`
   - `app/api/chat/route.ts`
2. Keep shared business logic in `src/` modules where possible.
3. Preserve auth header behavior (`Authorization: Bearer ...`).
4. Preserve timeout behavior via `export const maxDuration = ...`.
5. For `/api/chat` SSE:
   - Return `text/event-stream`
   - Preserve event framing: `data: {...}\n\n`
   - Preserve existing event types and ordering used by current client
   - Preserve metadata event at stream end
6. Add explicit regression tests for `/api/chat` stream framing and terminal events.

### Exit Criteria

1. Existing frontend API calls work unchanged (`/api/...` paths).
2. `/api/chat` stream parser in `use-analyst-chat` works without client changes.
3. Non-streaming endpoints return expected status codes and payload shapes.

---

## Phase 5: Tests, Cutover, Cleanup

**Goal:** Make Next.js the default runtime and remove Vite-only scaffolding.

### Tasks

1. Update test setup for Next:
   - Mock `next/navigation`, `next/link`, and any route-specific hooks where needed.
2. Keep unit tests on Vitest for now; add integration smoke tests for:
   - Login redirect behavior
   - Cases page load
   - Chat streaming happy path
3. Switch scripts:
   - `dev` -> `next dev`
   - `build` -> `next build`
   - `start` -> `next start`
4. Remove Vite/TanStack app bootstrap files only after parity is confirmed:
   - `src/main.tsx`
   - `src/routeTree.gen.ts`
   - `vite.config.ts`
   - Vite-only plugin config
5. Update deploy config:
   - Remove Vite-specific Vercel rewrites/config
   - Let Vercel detect Next.js framework

### Exit Criteria

1. `npm run build` passes on Next.js.
2. `npm run lint` passes or only pre-approved existing issues remain.
3. `npm run test:run` passes for migration-critical suites.
4. Manual smoke checklist passes (see below).

---

## Smoke Test Checklist (Must Pass)

1. `/` loads.
2. `/login` loads.
3. Unauthed visit to `/cases` redirects to `/login`.
4. Authenticated login redirects to `/chat` or `/cases`.
5. `/cases` list loads.
6. `/cases/[caseId]` loads.
7. `/cases/[caseId]/documents/[docId]` renders PDF viewer.
8. Chat stream returns assistant output and metadata (container + files).
9. `/api/docgen/generate` and `/api/gemini/process` return expected JSON.

---

## Definition of Done

1. Next.js App Router is the default runtime.
2. Core routes and APIs are migrated with behavior parity.
3. Supabase auth refresh works through middleware.
4. No secrets are embedded in docs or source.
5. Old Vite runtime files are removed from active path.

---

## Post-Migration Optimization Backlog

1. Move selected dashboard read paths to richer Server Component data loading.
2. Introduce targeted Server Actions for safe mutations.
3. Reduce client bundle with more dynamic imports for heavy browser-only modules.
4. Improve metadata and dynamic SEO for industry/use-case pages.
