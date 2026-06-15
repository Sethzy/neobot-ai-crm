# Sunder Launch Polish Checklist

Date: 2026-06-11
Target launch: 2026-06-12
Scope: product UI polish, launch readiness, trust, responsive fit, and demo sharpness.

## Audit Summary

Audit method:
- Impeccable v3.5.0 audit/polish guidance.
- Live Codex in-app Browser pass on `iab`.
- Desktop viewport: 1440 x 900.
- Mobile viewport: 390 x 844.
- Routes checked: `/`, `/chat`, `/customers/people`, `/customers/companies`, `/customers/deals`, `/automations`, `/pricing`, `/settings/profile`, `/settings`, `/login`.
- Detector pass: `node .agents/skills/impeccable/scripts/detect.mjs --json app src/components src/lib/ui/color-maps.ts`.

Health score: 13/20, acceptable but not launch-sharp yet.

| Dimension | Score | Key finding |
| --- | ---: | --- |
| Accessibility | 2/4 | Duplicate headings and small/unlabeled action buttons remain, especially Automations. |
| Performance | 3/4 | App surfaces load, but repeated auth console warnings create noise and indicate auth plumbing debt. |
| Responsive | 3/4 | CRM and pricing fit mobile well; Automations has small mobile controls; Settings/Profile content is not visible. |
| Theming | 3/4 | Flexoki token system is strong; a few anti-pattern/token drift items remain. |
| Anti-patterns | 2/4 | Side-accent border and bounce/wobble motion are flagged by Impeccable; not catastrophic, but polish debt. |

Anti-pattern verdict:
The app no longer reads like a generic AI demo on the primary CRM/chat routes. It reads like a restrained operational product. The remaining launch risk is not visual noise, it is trust damage from broken settings, duplicate/stale demo data, tiny unlabeled controls, and browser console warnings.

## Launch Blockers

- [ ] P0: Fix `/settings/profile` rendering.
  - Evidence: On desktop and mobile, the settings layout shows only the settings nav/skeleton. The actual `PageCanvas` profile content exists in the DOM at `0x0`, outside the visible layout.
  - Impact: A core settings route looks broken during launch demos.
  - Likely files: `app/settings/layout.tsx`, `app/settings/profile/page.tsx`, `app/settings/loading.tsx`, `PageCanvas`.
  - Acceptance: `/settings/profile` visibly shows the Profile header, Telegram connection row, and `Not configured` message on desktop and mobile after reload.
  - Suggested command: `$impeccable harden /settings/profile`.

- [ ] P0: Remove duplicate/stale automation demo rows before launch.
  - Evidence: `/automations` shows many repeated inactive rows: multiple `Weekday Morning Briefing`, `Daily Morning Briefing`, and similar disabled records.
  - Impact: Makes the product feel uncurated and seeded by test runs.
  - Acceptance: Demo account shows one Daily Orchestrator plus a small, intentional set of realistic automations.
  - Suggested command: `$impeccable polish /automations`.

## Should Fix Before Showing People

- [ ] P1: Make Automations mobile action buttons 44px and labeled.
  - Evidence: Mobile `/automations` has many visible buttons around `32 x 18` with empty accessible text in the audit snapshot.
  - Impact: Hard to tap, weak accessibility, and visually feels unfinished.
  - Likely file: `src/components/automations/automations-list.tsx`.
  - Acceptance: Every row action has an accessible name and a touch target of at least `44 x 44` on mobile.
  - Suggested command: `$impeccable adapt /automations`.

- [ ] P1: Replace suspicious demo data values in CRM.
  - Evidence: `/customers/companies` includes `google`, `Ho Bee Land` with `dsds/dss/ds`; `/customers/people` includes `Gerald Tan` email value `ds`.
  - Impact: This is the kind of thing a launch viewer notices instantly.
  - Acceptance: No obvious placeholder, typo, or junk field values in People, Companies, Deals.
  - Suggested command: `$impeccable polish CRM demo data`.

- [ ] P1: Fix repeated Supabase auth warning in browser console.
  - Evidence: Every audited authenticated route logs `Using the user object as returned from supabase.auth.getSession() ... could be insecure`.
  - Likely files: `app/(dashboard)/layout.tsx`, `src/hooks/use-session.ts`.
  - Impact: Not user-visible, but bad launch hygiene and indicates auth session data should be verified with `getUser()`.
  - Acceptance: Browser console has no repeated Supabase auth warnings on `/chat`, CRM, Automations, Pricing, Settings.
  - Suggested command: `$impeccable harden auth session plumbing`.

- [ ] P1: Resolve duplicate H1/page headings.
  - Evidence: `/chat` shows two `h1` nodes for `What can I do for you?`; CRM routes show repeated page H1s in DOM snapshots.
  - Impact: Screen reader noise and less clean semantic structure.
  - Acceptance: One visible primary `h1` per route; duplicate responsive headings use `aria-hidden` or lower-level semantic treatment as appropriate.
  - Suggested command: `$impeccable audit heading hierarchy`.

- [ ] P1: Tune Pricing copy for launch.
  - Evidence: Paid plans show `Contact us` as price and `Contact support` button.
  - Impact: Acceptable fallback, but not crisp for launch. It reads like billing is not ready.
  - Recommendation: If Stripe is ready, wire real prices. If not, use one intentional CTA: `Talk to us` or `Join launch plan`, and add a short explanation.
  - Acceptance: Pricing state feels intentional, not degraded.
  - Suggested command: `$impeccable clarify /pricing`.

## Polish If Time Allows

- [ ] P2: Hide or remove stale chat thread titles in the sidebar.
  - Evidence: Sidebar includes `UI smoke test`, `HDB Tampines Executive`, `HDB Resale Transactions`, `Funan to Changi ETA`.
  - Impact: Demo sidebar feels like internal testing history.
  - Acceptance: Sidebar has 3-5 clean, intentional examples or a fresh demo account.
  - Suggested command: `$impeccable polish chat sidebar data`.

- [ ] P2: Revisit side-accent borders.
  - Evidence: Detector flagged `border-l-2` in `src/components/ui/markdown-renderer.tsx`; code also has stage side-border maps in `src/lib/ui/color-maps.ts`.
  - Impact: Impeccable treats side stripes as an AI UI tell. CRM stage color can still exist through chips, top borders, or subtle badges.
  - Acceptance: No decorative thick left/right side accent borders in cards/callouts.
  - Suggested command: `$impeccable quieter side accents`.

- [ ] P2: Remove bounce/wobble motion.
  - Evidence: Detector flagged `animation: icon-key-wobble` in `app/globals.css` and `animate-bounce` in `src/components/landing/WhatsAppPhoneMockup.tsx`.
  - Impact: Small, but inconsistent with calm operational brand.
  - Acceptance: Replace with a short ease-out state cue or no motion; respect reduced motion.
  - Suggested command: `$impeccable animate motion cleanup`.

- [ ] P2: Tighten display letter spacing.
  - Evidence: `--text-display--letter-spacing: -0.05em`; updated Impeccable guidance floors display letter spacing at `-0.04em`.
  - Impact: Subtle brand polish, avoids cramped large headings.
  - Acceptance: Display heading tracking is `-0.04em` or looser.
  - Suggested command: `$impeccable typeset display scale`.

- [ ] P2: Decide whether settings placeholders are launch-safe.
  - Evidence: `SettingsStubPage` still uses `Coming soon` for Notifications, Connections, Usage.
  - Impact: Depending on launch audience, placeholders may be fine or may weaken confidence.
  - Acceptance: Either hide unavailable settings links or give launch-ready "Not available yet" states with useful context.
  - Suggested command: `$impeccable distill settings IA`.

## Positive Findings

- [x] `/chat` quota display is launch-safe: no visible `999999`.
- [x] `/pricing` no longer shows `Unavailable/mo` or `Contact us/mo`.
- [x] CRM People, Companies, Deals no longer horizontally overflow at desktop or 390px mobile.
- [x] CRM mobile routes render as stacked cards rather than clipped tables.
- [x] Next dev overlay is hidden from visible app surface.
- [x] Flexoki/token design system is strong enough to polish within, not around.

## Recommended Work Order

1. Fix `/settings/profile` visible rendering.
2. Clean demo CRM and Automations data.
3. Fix Automations mobile action buttons and labels.
4. Remove repeated Supabase auth console warning.
5. Clean heading hierarchy.
6. Tighten pricing copy/state.
7. Final pass on detector warnings: side accents, wobble/bounce, display tracking.
8. Re-run live browser audit at desktop and mobile.

## Final Launch Acceptance Checklist

- [ ] No broken or skeleton-only authenticated route.
- [ ] No obvious fixture, QA, junk, or placeholder data in demo account.
- [ ] No visible internal/debug UI.
- [ ] No `Coming soon` copy on primary launch paths.
- [ ] No browser console errors or repeated warnings on app load.
- [ ] All mobile controls on primary workflows meet 44px touch target.
- [ ] One semantic primary heading per page.
- [ ] No horizontal page scroll at 390px, 768px, 1440px.
- [ ] Pricing state reads intentional, even if Stripe is not fully configured.
- [ ] CRM/Automations/Chat are demoable from a fresh account without explanation.
