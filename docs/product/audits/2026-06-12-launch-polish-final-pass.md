# Launch Polish Final Pass

Date: 2026-06-12

Scope: Codex in-app Browser audit of the authenticated product surface at desktop `1280x800` and mobile `390x844`.

Routes checked:
- `/chat`
- `/customers/deals`
- `/customers/companies`
- `/customers/people`
- `/tasks`
- `/automations`
- `/meetings`
- `/settings/profile`
- `/settings/agent/memory`
- `/settings/workspace/billing`
- `/pricing`
- `/skills`

## Overall Readiness

Launch polish status: **mostly ready, with 3 polish issues to clean before public demo / production push.**

No launch-blocking UI regressions were found after a clean dev-server restart. The previous `Internal Server Error` sweep was caused by a stale `.next` development manifest cache, not route code.

## What Passed

- No visible `999999` quota copy.
- No `Unavailable/mo` or `Contact us/mo` pricing artifacts.
- No visible `Lorem ipsum`, `dsds`, `dss`, or obvious junk demo text on audited product surfaces.
- No visible loading skeletons stuck on audited routes.
- No broken or missing visible image assets detected on audited routes.
- No unlabeled visible buttons detected in audited routes.
- Mobile layouts for chat, CRM list cards, tasks, settings profile, and pricing did not horizontally overflow.
- Settings profile and workspace billing render real content, not full-page placeholder skeletons.

## Checklist

### P1 - Remove Supabase Auth Warning From Console

Evidence: every audited route logs the Supabase warning:

> Using the user object as returned from supabase.auth.getSession() or from some supabase.auth.onAuthStateChange() events could be insecure...

Likely source:
- `app/auth/confirm/page-client.tsx:27` still calls `supabase.auth.getSession()`.
- `src/hooks/use-session.ts:38` still receives auth state change events and should avoid trusting the event session/user directly.

Acceptance:
- Browser console is clean of this warning on `/chat`, `/pricing`, and CRM pages after hard reload.
- Confirmation flow still routes confirmed users to `/chat`.

### P2 - Normalize Desktop CRM Table Containment

Evidence: desktop CRM table pages load correctly, but their tables extend wider than the content column and rely on internal horizontal scroll. The document itself did not move on horizontal scroll, so this is not a catastrophic viewport overflow, but it still reads slightly unfinished on desktop.

Affected routes:
- `/customers/deals`
- `/customers/companies`
- `/customers/people`

Likely source:
- `src/components/ui/list-table.tsx:324` uses `overflow-x-auto`.
- `src/components/ui/list-table.tsx:332` enables `min-w-full table-fixed`.
- `src/components/ui/list-table.tsx:334` sets `width: table.getTotalSize()`, which can exceed the available content area.

Acceptance:
- CRM list tables fit the visible content band at `1280x800`, or the horizontal scroll container has an intentional visual treatment.
- Sticky first column and actions column do not appear clipped at the right edge.
- Mobile card layouts remain unchanged.

### P2 - Increase Mobile Automation Switch Hit Area / Visual Weight

Evidence: `/automations` on `390x844` has labeled switches, but visible switch boxes are `32x18`, below the usual 40px target guidance. They may technically have invisible hit padding, but visually they look small beside rows.

Source:
- `src/components/automations/automations-list.tsx:160`

Acceptance:
- Switch interaction target is at least 40px high on mobile, either via explicit wrapper/label hit area or a larger mobile switch variant.
- Existing accessible labels remain intact, e.g. `Disable Daily Orchestrator`.

### P3 - Improve Skills Catalog Description Scannability

Evidence: `/skills` is functional, but card descriptions are single-line truncated; some installed plugin descriptions are very long and feel abruptly cut.

Source:
- `app/(dashboard)/skills/predefined-card.tsx:53`

Acceptance:
- Skill descriptions use `line-clamp-2` or a similarly calm two-line treatment.
- Buttons remain stable in height and the install/uninstall action does not jump layout.

### P3 - Keep "Coming Soon" Out Of Launch Settings Paths

Evidence: no visible `Coming soon` appeared on audited settings/profile or billing routes. Static scan still finds a disabled messaging channel row that renders a disabled `Coming soon` button.

Source:
- `src/components/settings/messaging-channels/disabled-channel-row.tsx:34`

Acceptance:
- If this row is reachable before launch, replace `Coming soon` with a calmer state such as `Not connected` or hide unreleased channels.
- If unreachable, no action needed for launch.

## Verification Performed

- Restarted local dev server after clearing stale `.next` cache.
- Audited authenticated product routes in the Codex in-app Browser named `iab`.
- Checked desktop viewport `1280x800`.
- Checked mobile viewport `390x844`.
- Ran static text scan for launch-junk copy and auth warning sources.

## Recommendation

Fix P1 and P2 items before launch/demo. P3 items are polish-only and can ship if time is tight.
