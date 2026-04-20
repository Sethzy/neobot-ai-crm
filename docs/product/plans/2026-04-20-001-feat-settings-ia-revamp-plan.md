---
title: Settings IA revamp with nested sub-pages
type: feat
status: active
date: 2026-04-20
---

# Settings IA revamp with nested sub-pages

## Overview

Restructure `/settings` from a single-page dashboard of stacked cards into a two-pane layout with a left sub-nav and one route per concern. Clone the Gooseworks pattern visually (inner rail with USER / AGENT / WORKSPACE sections) while adapting the IA to Sunder's solo-practitioner product shape.

This is **pure information architecture**: file moves, a layout shell, a nav component, and a sidebar collapse signal. No backend changes, no new DB migrations, no new API routes, no new env vars, no realtime, no state machines.

The page sets up PR 2 (Messaging Channels) to land directly in its final home at `/settings/workspace/messaging-channels`.

## Problem Statement / Motivation

`/settings/page.tsx` today renders five stacked cards on one route: Billing teaser, Telegram pairing, Autopilot config, Skills teaser, Agent Context teaser. The surface is beginning to sprawl — additional channels (Slack, WhatsApp, Telegram Group) are on the roadmap, Notifications preferences are implied by autopilot, Memory/SOUL editing is already its own route but linked as a teaser card. The single-page-with-cards pattern won't scale past ~6 sections without becoming unreadable.

The Gooseworks IA (screenshot reference in the initiating conversation) demonstrates the target pattern: a dedicated settings surface with an inner left rail grouping items under semantic sections. Adopting this now — while settings content is still small — is cheaper than retrofitting later when channels and notifications land.

## Proposed Solution

### Information architecture

Three sections, eight routes. Not a 1:1 Gooseworks clone — Gooseworks is a multi-tenant team product; Sunder is solo-practitioner, so Team / Members / API Keys / Environment / Mailbox / MCP Servers are explicitly dropped. Memory and Connections are added because they reflect what Sunder actually has.

```
USER
  Profile              — avatar, display name, email, password reset
  Notifications        — when/where to ping (web push, Telegram, email)

AGENT
  General              — Autopilot config (moved from /settings)
  Memory               — SOUL/USER context editor (existing /settings/agent-context content)
  Connections          — Composio OAuth integrations

WORKSPACE
  Messaging Channels   — STUB in this PR, shipped in PR 2
  Billing              — existing /settings/billing content
  Usage                — LLM token/run spend (stub for now)
```

### Sidebar interaction pattern — Option B+

Main app sidebar collapses to icon-only rail when `pathname.startsWith("/settings")`. ShadCN's `Sidebar` already supports this via the `collapsible="icon"` prop (already set at `src/components/layout/app-sidebar.tsx:148`), so we only need to trigger `setOpen(false)` in a route-aware `useEffect`. No hand-rolled state machine. Users can still manually expand the rail if they want it back while on settings — the collapse is a default, not a lock.

The settings page itself provides the inner left rail via its own layout.

### Route tree

```
app/(dashboard)/settings/
  layout.tsx                              # two-pane shell: <SettingsNav /> + {children}
  page.tsx                                # redirect → /settings/profile
  profile/page.tsx                        # STUB
  notifications/page.tsx                  # STUB
  agent/
    general/page.tsx                      # renders <AutopilotCard />
    memory/page.tsx                       # renders <AgentContextForm /> (existing)
    connections/page.tsx                  # STUB
  workspace/
    messaging-channels/page.tsx           # STUB (PR 2 fills this in)
    billing/page.tsx                      # existing billing content, moved
    usage/page.tsx                        # STUB
  billing/page.tsx                        # REDIRECT → /settings/workspace/billing
  agent-context/page.tsx                  # REDIRECT → /settings/agent/memory
                                          #   (existing route must not 404 — internal links may exist)
```

### Stub content convention

Stub pages are not blank "Coming soon" placards. Each stub renders:
- The section title matching the nav item.
- One sentence describing what will live there (sets expectations, not vaporware).
- A `Skeleton`-style muted surface using `border-border/70 bg-card` tokens so the page does not look broken.

Example copy:
- Profile — "Display name, avatar, and email live here. Coming soon."
- Notifications — "Choose when the agent pings you on web, Telegram, or email. Coming soon."
- Connections — "OAuth-connected tools (Google Drive, Docs, Sheets, and more) will be listed here. Managed for now from inside chat."
- Messaging Channels — "Connect Telegram, Slack, WhatsApp, and iMessage so the agent can talk to you on your phone. Landing in the next PR."
- Usage — "Message counts, token spend, and run history. Coming soon."

## Technical Considerations

### Architecture impacts

- **No backend changes.** No API routes, migrations, env vars, or runner changes.
- **Server Components everywhere.** Following `CLAUDE.md:109`, pages are server-rendered. Only `SettingsNav` is a client component (needs `usePathname()` for active-item highlighting); optionally a tiny client component triggers sidebar collapse via `useSidebar()`.
- **Existing client components move verbatim.** `AutopilotCard` (`app/(dashboard)/settings/autopilot-card.tsx`) and `AgentContextForm` (`app/(dashboard)/settings/agent-context/agent-context-form.tsx`) are self-contained — they are imported into their new parent pages without modification.

### Sidebar collapse mechanism

ShadCN's `Sidebar` already runs in `collapsible="icon"` mode (`src/components/ui/sidebar.tsx:20-31`, applied at `src/components/layout/app-sidebar.tsx:148`). The `useSidebar()` hook exposes `setOpen(false)` / `setOpen(true)`.

Approach:
- Add a tiny client component (e.g. `src/components/settings/settings-sidebar-sync.tsx`) that mounts inside `settings/layout.tsx`, calls `useSidebar()`, and runs `setOpen(false)` on mount. On unmount (user navigates away from `/settings/*`), it restores to `true`.
- Zero custom CSS, zero data-attrs. Idiomatic ShadCN.

Alternative considered: CSS-only via `data-pathname`. Rejected — requires setting a data attribute on `<html>` and writing brittle selectors. `useSidebar()` is the documented path.

### Stripe return URL preservation

`/settings/billing` is referenced as a return URL in three places and one test:
- `app/api/stripe/checkout/route.ts:23` — `redirect(new URL("/settings/billing?billing=success", requestUrl))`
- `src/lib/stripe/stripe.ts:464` — `return_url: \`${resolveAppBaseUrl()}/settings/billing\``
- `src/lib/stripe/actions.ts:62` — `redirect(\`/settings/billing?billing=${billingErrorCodes.portalError}\`)`
- `app/api/stripe/checkout/__tests__/route.test.ts:34` — expects redirect to `http://localhost/settings/billing?billing=success`

**The plan keeps `/settings/billing` alive as a redirect.** The route replaces its existing page content with a server-side `redirect()` to `/settings/workspace/billing`. Query strings (e.g. `?billing=success`) pass through via `searchParams`. The existing test continues to pass because Stripe still lands on `/settings/billing` first — our redirect is transparent. No changes to Stripe libs, Stripe config, or any place that hardcodes the URL.

### Agent Context route preservation

`/settings/agent-context` already exists with a working form. It becomes `/settings/agent/memory`. The old path stays alive as a redirect to avoid breaking any internal links, bookmarks, or in-app buttons not yet audited.

### Naming & conventions

- Directory names: lowercase-with-dashes (`messaging-channels`, not `messagingChannels`) per `CLAUDE.md:90`.
- Flexoki semantic tokens only (`bg-card`, `border-border/70`, `text-muted-foreground`) per `CLAUDE.md:123`. No raw palette classes.
- File-level JSDoc `@module` header on each new file per `CLAUDE.md:128`.
- Commit convention `feat(pr##): …` per `CLAUDE.md:96`. PR number assigned at merge.

## System-Wide Impact

### Interaction graph

- `/settings/billing` → redirect → `/settings/workspace/billing` → renders moved billing page → Stripe portal form → server action → Stripe API. No behavior change visible to Stripe or the user.
- `/settings` → redirect → `/settings/profile` → stub. No consumers of bare `/settings` exist beyond the sidebar link and Stripe's `?billing=success` query, both of which land cleanly.
- `/settings/agent-context` → redirect → `/settings/agent/memory` → renders `<AgentContextForm />` → PATCH `/api/settings/agent-context`. The form and its API are untouched.
- Sidebar renders everywhere; when pathname enters `/settings/*`, a mount-effect inside `settings/layout.tsx` calls `setOpen(false)`. When the user navigates away, cleanup restores `setOpen(true)`.

### Error & failure propagation

- Redirect pages (`/settings`, `/settings/billing`, `/settings/agent-context`) use Next.js `redirect()` from `next/navigation`. If called outside a Server Component this throws — these are all server pages, so the concern is contained.
- `AutopilotCard` and `AgentContextForm` carry their own error states (API error → inline `errorText`). Moving them doesn't change behavior.
- Sidebar collapse fails open: if `useSidebar()` hook throws (e.g. in tests without `SidebarProvider`), the whole settings page fails to mount. Mitigation: `settings-sidebar-sync.tsx` wraps the call in a try/catch or no-ops when the provider is absent.

### State lifecycle risks

None. No persisted state is created or mutated by this PR. Sidebar `open` state is in-memory only (not persisted to cookie in current setup — verify: ShadCN's default persists to cookie; if so, the mount-effect toggle persists and the user sees the icon-only state on next visit, which is actually fine UX-wise but worth confirming).

**Open question:** does ShadCN's `Sidebar` persist `open` state across reloads via cookie? If yes, `setOpen(false)` on entering settings will leak: the user exits settings but next cold load the sidebar is still collapsed. Investigate during implementation (~5 min read of `src/components/ui/sidebar.tsx`). If it persists, the cleanup effect on unmount is sufficient — state restores as soon as the user leaves `/settings/*`.

### API surface parity

No API surface is touched. The Stripe checkout/portal API routes (`app/api/stripe/*`) still exist, still return URLs pointing at `/settings/billing`, and that path still exists (as a redirect shim). Parity preserved.

### Integration test scenarios

1. Existing Stripe checkout test (`app/api/stripe/checkout/__tests__/route.test.ts`) must continue to pass — the test expects a redirect to `/settings/billing?billing=success`, and that path remains valid.
2. Manual E2E: complete a Stripe checkout and verify the user lands on the billing view (now at `/settings/workspace/billing` after the transparent redirect). Query string `?billing=success` must survive the redirect.
3. Manual E2E: visit an old `/settings/agent-context` link and verify redirect to `/settings/agent/memory` with the form rendering and PATCH still working.
4. Manual E2E: navigate in and out of `/settings/*` and verify main app sidebar collapses to icons on entry and restores on exit.

## Acceptance Criteria

### Functional

- [ ] Navigating to `/settings` redirects to `/settings/profile`.
- [ ] Navigating to `/settings/billing` redirects to `/settings/workspace/billing` with query strings preserved.
- [ ] Navigating to `/settings/agent-context` redirects to `/settings/agent/memory` with the form rendering and its API behavior unchanged.
- [ ] All 8 settings pages are reachable via the inner left rail and render without errors.
- [ ] Active nav item is highlighted based on `usePathname()`.
- [ ] `/settings/agent/general` renders the existing `AutopilotCard` with no behavioral change.
- [ ] `/settings/agent/memory` renders the existing `AgentContextForm` with no behavioral change.
- [ ] `/settings/workspace/billing` renders the existing billing content (plan state, Stripe portal button) with no behavioral change.
- [ ] Stubs for Profile, Notifications, Connections, Messaging Channels, and Usage render a section title + one-sentence description + muted card surface — not a blank page.
- [ ] Main app sidebar auto-collapses to icon-only while on `/settings/*` and restores to full width when leaving.
- [ ] The dead `/channels` route is removed (file deleted, sidebar entry removed or repointed to `/settings/workspace/messaging-channels`).

### Non-functional

- [ ] No new DB migrations.
- [ ] No new API routes.
- [ ] No new env vars.
- [ ] No new npm dependencies.
- [ ] No raw Tailwind palette classes in any new file (Flexoki semantic tokens only).
- [ ] Every new file has a file-level JSDoc `@module` header.
- [ ] Existing Stripe checkout test continues to pass unmodified.

### Quality gates

- [ ] A single Vitest test on `SettingsNav` confirms the three sections render with expected items (8 links, correct labels, active state logic works). No further unit tests on stub pages.
- [ ] `pnpm lint` passes.
- [ ] `pnpm typecheck` passes.

## Success Metrics

- The settings surface can accommodate PR 2 (Messaging Channels real content) without further restructuring — the page slot exists at `/settings/workspace/messaging-channels` and needs only its contents filled.
- Stripe checkout and Customer Portal flows are unaffected (verified by running existing test + one manual checkout).
- Users reach the renamed Agent Context (now Memory) and Autopilot settings in ≤2 clicks from any dashboard route.

## Dependencies & Risks

### Dependencies

- Next.js App Router `redirect()` from `next/navigation` — already in use across the repo.
- ShadCN `Sidebar` `collapsible="icon"` mode — already in use.
- TanStack Query — already configured; stubs don't need it.

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Stripe redirect breaks due to hidden URL hardcode we missed | Low | Grepped every `/settings/billing` reference before planning. Keep the shim route in place; revisit after launch to measure hits. |
| ShadCN sidebar cookie-persisted `open` state leaks the collapsed state outside `/settings/*` | Low | Cleanup effect on unmount restores `setOpen(true)`. If cookie-persisted, confirm behavior during implementation; worst case, sidebar stays collapsed until user manually expands — not broken, just surprising. |
| A consumer links directly to `/settings` expecting the old card list | Medium | The redirect lands on `/settings/profile` (a stub). Acceptable: stub says "Coming soon" with intent, and the nav rail shows where everything moved. |
| The `/settings/agent-context` redirect breaks a test we didn't find | Low | Grep shows tests exist for the form (`agent-context-form.test.tsx`) and the page (`page.test.tsx`). The form test will still pass (form logic unchanged). The page test may need updating to account for the new route; plan for a 10-min adjustment. |
| Nav component grows complex over time | Low | Keep it a single file (`settings-nav.tsx`), one array of sections, one map function. No clever abstractions. YAGNI. |

## Out of scope (explicit)

- Telegram pairing UX rebuild → PR 2 (Messaging Channels).
- Realtime pairing-complete detection → PR 2.
- Slack / WhatsApp / iMessage / Telegram Group channels → PR 3+.
- Profile, Notifications, Connections, Usage real content → future PRs, one section at a time.
- Memory editor upgrade (e.g. viewing `memory/*.md` files beyond SOUL/USER) → future PR, the current `AgentContextForm` ships as-is.
- Sidebar redesign beyond the icon-collapse-on-settings toggle.
- Any change to env vars, DB schema, API routes, webhook, or the managed-agent runner.

## Implementation Plan

### Files to create

| Path | Purpose |
|---|---|
| `app/(dashboard)/settings/layout.tsx` | Two-pane shell. Renders `<SettingsNav />` + `<SettingsSidebarSync />` + `{children}` in a grid. |
| `app/(dashboard)/settings/page.tsx` | Server component: `redirect("/settings/profile")`. |
| `app/(dashboard)/settings/profile/page.tsx` | Stub with section title + intent description. |
| `app/(dashboard)/settings/notifications/page.tsx` | Stub. |
| `app/(dashboard)/settings/agent/general/page.tsx` | Loads autopilot config server-side (same query as current `/settings/page.tsx`), renders `<AutopilotCard initialConfig={...} />`. |
| `app/(dashboard)/settings/agent/memory/page.tsx` | Loads agent context server-side (same query as current `/settings/agent-context/page.tsx`), renders `<AgentContextForm />`. |
| `app/(dashboard)/settings/agent/connections/page.tsx` | Stub. |
| `app/(dashboard)/settings/workspace/messaging-channels/page.tsx` | Stub with "landing in PR 2" copy. |
| `app/(dashboard)/settings/workspace/billing/page.tsx` | Moves the entire current `/settings/billing/page.tsx` content verbatim. |
| `app/(dashboard)/settings/workspace/usage/page.tsx` | Stub. |
| `src/components/settings/settings-nav.tsx` | Client component: USER/AGENT/WORKSPACE groups, highlights active via `usePathname()`, uses Flexoki tokens + ShadCN `Button`/`cn()`. |
| `src/components/settings/settings-sidebar-sync.tsx` | Client component: `useSidebar().setOpen(false)` on mount, restore on unmount. |
| `src/components/settings/settings-nav.test.tsx` | Vitest: renders 3 sections, 8 items, active state works. |

### Files to edit

| Path | Change |
|---|---|
| `app/(dashboard)/settings/billing/page.tsx` | Replace content with `redirect(\`/settings/workspace/billing?${searchParams}\`)`. Preserve query strings. |
| `app/(dashboard)/settings/agent-context/page.tsx` | Replace content with `redirect("/settings/agent/memory")`. |
| `src/components/layout/app-sidebar.tsx` | Remove `{ label: "Channels", href: "/channels", … }` entry from `databaseNavItems` (line 66). |

### Files to delete

| Path | Reason |
|---|---|
| `app/(dashboard)/settings/telegram-connect-card.tsx` | Orphaned after old settings page is replaced. Telegram pairing rebuilt in PR 2 at `/settings/workspace/messaging-channels`. |
| `app/(dashboard)/settings/telegram-connect-card.test.tsx` | Tests the deleted component. |
| `app/(dashboard)/settings/page.test.tsx` | The old multi-card page is gone; its test is obsolete. |
| `app/(dashboard)/channels/page.tsx` | Dead "Coming soon" route, no other consumers. |

### Files moved, not edited

- `app/(dashboard)/settings/autopilot-card.tsx` → leave in place; imported by the new `/settings/agent/general/page.tsx`. Optionally move to `src/components/settings/autopilot-card.tsx` for consistency with the new settings components directory; if moved, update the import. **Recommendation: move** to avoid a dangling file in the old settings folder.
- `app/(dashboard)/settings/agent-context/agent-context-form.tsx` → same reasoning; optionally move to `src/components/settings/agent-context-form.tsx`.

### Order of work (safe-commit atomic steps)

1. Create `src/components/settings/settings-nav.tsx` + test. Verify nav renders standalone.
2. Create `app/(dashboard)/settings/layout.tsx` and `app/(dashboard)/settings/page.tsx` (redirect).
3. Create all 5 stub pages (Profile, Notifications, Connections, Messaging Channels, Usage). Visit each; confirm renders.
4. Create `agent/general/page.tsx` and move autopilot data-loading + `<AutopilotCard />` into it. Verify autopilot still works end-to-end.
5. Create `agent/memory/page.tsx` and move agent-context data-loading + `<AgentContextForm />` into it. Verify form PATCH still works.
6. Create `workspace/billing/page.tsx` by copying the current `/settings/billing/page.tsx` content. Verify Stripe portal button still opens the portal.
7. Replace `/settings/billing/page.tsx` with a redirect. Replace `/settings/agent-context/page.tsx` with a redirect. Test Stripe checkout end-to-end.
8. Create `src/components/settings/settings-sidebar-sync.tsx` and wire into `layout.tsx`. Verify sidebar collapses on `/settings/*` and restores on exit.
9. Remove `/channels` route and sidebar entry. Delete orphaned Telegram card files and old settings page/test.
10. Run `pnpm lint`, `pnpm typecheck`, and the existing Stripe test. All green.
11. Commit: `feat(pr??): settings IA revamp — two-pane layout with nested sub-pages`.

## Sources & References

### Internal references

- Current settings page: `app/(dashboard)/settings/page.tsx:1-193`
- Existing billing subpage: `app/(dashboard)/settings/billing/page.tsx`
- Existing agent-context: `app/(dashboard)/settings/agent-context/page.tsx` + `agent-context-form.tsx`
- Autopilot card: `app/(dashboard)/settings/autopilot-card.tsx`
- App sidebar: `src/components/layout/app-sidebar.tsx:66` (dead `/channels` entry), `:148` (`collapsible="icon"`)
- ShadCN sidebar primitive: `src/components/ui/sidebar.tsx`
- Dashboard layout: `app/(dashboard)/layout.tsx`
- Stripe URL hardcodes: `app/api/stripe/checkout/route.ts:23`, `src/lib/stripe/stripe.ts:464`, `src/lib/stripe/actions.ts:62`
- Stripe checkout test: `app/api/stripe/checkout/__tests__/route.test.ts:34`
- Flexoki tokens examples: `app/(dashboard)/settings/page.tsx:126`, `app/(dashboard)/settings/billing/page.tsx:106`
- Vitest setup: `vitest.config.ts`
- Test example for a nav-like component: `src/components/layout/app-sidebar.test.tsx`

### Conventions

- `CLAUDE.md:90` — lowercase-with-dashes directory naming.
- `CLAUDE.md:96` — commit convention: `feat(pr##): …`.
- `CLAUDE.md:109` — prefer Server Components.
- `CLAUDE.md:123` — Flexoki semantic tokens only.
- `CLAUDE.md:128` — JSDoc module headers at file top.

### Related work

- Prior settings-related task: `docs/product/tasks/2026-03-26-autopilot-settings-timezone-tasklist.md` — established the autopilot card.
- Prior Stripe integration: `docs/product/designs/stripe-billing-integration.md` — documents `/settings/billing` as return URL.
- PR 2 (next): Messaging Channels page — will fill `/settings/workspace/messaging-channels` stub.
