# Launch UI Polish and Refero-Inspired Design System PRD

## Problem Statement

Sunder is close to launch, but the authenticated product surface does not yet feel consistently premium across all pages. The current product works, but several areas still read as uneven: the sidebar can feel too tinted, some dashboard pages feel sparse, some data-heavy pages feel raw, and placeholder surfaces can expose internal launch-state language. The user wants Sunder to feel like a top-grade SaaS product without copying another company’s design system or making the app feel decorative.

The user specifically wants to borrow the discipline from the Refero/Voiceflow design reference: neutral product chrome, hairline borders, pill-like controls, sparse but confident brand color, and a calmer relationship between content, navigation, and actions. The product should keep Sunder’s green identity, but use green as a precise signal rather than washing the whole shell in a green tint.

The user also wants launch-safe channel visibility: Channels should show Telegram and WhatsApp as coming soon, without exposing unfinished connection flows.

## Solution

Create a focused launch polish pass across the landing page and authenticated dashboard that makes Sunder feel production-ready, cohesive, and professionally restrained.

The solution should:

- Keep Sunder’s green brand identity, but make it deeper, quieter, and more premium.
- Use neutral app chrome for the shell, sidebar, page backgrounds, tables, and settings surfaces.
- Use green only for primary actions, active navigation, focus, and meaningful state.
- Borrow from the Refero/Voiceflow reference at the level of design principles, not visual copying.
- Remove internal or placeholder-sounding launch language from visible product surfaces.
- Make the dashboard feel like an operational workbench for advisory sales: calm, dense where useful, clean where sparse.
- Improve major dashboard pages aesthetically without changing their core product behavior.
- Keep Telegram implementation hidden from launch-facing flows while exposing a simple Channels roadmap page with Telegram and WhatsApp marked coming soon.

## User Stories

1. As a solo practitioner, I want the app to feel polished when I open it, so that I trust it with client-facing work.
2. As a solo practitioner, I want navigation to feel calm and professional, so that I can move through the product without visual noise.
3. As a solo practitioner, I want active navigation to be clear but not loud, so that I know where I am without the sidebar feeling cheap.
4. As a solo practitioner, I want the dashboard to keep Sunder’s green identity, so that the product still feels recognizable.
5. As a solo practitioner, I want green to be used sparingly, so that it feels premium rather than decorative.
6. As a solo practitioner, I want the chat page to feel like an operating console, so that I understand this is where work starts.
7. As a solo practitioner, I want the chat composer to feel focused and intentional, so that I know exactly where to ask Sunder for help.
8. As a solo practitioner, I want prompt suggestions to be readable and useful, so that I can quickly start common workflows.
9. As a solo practitioner, I want message quota and upgrade information to be clear but quiet, so that billing information does not distract from my work.
10. As a solo practitioner, I want the Skills page to be scannable, so that I can understand what my agent can do.
11. As a solo practitioner, I want long skill descriptions to be controlled, so that the Skills page does not become a wall of text.
12. As a solo practitioner, I want installed and recommended skills to be visually distinct, so that I can understand what is active versus available.
13. As a solo practitioner, I want Automations to show active and inactive work clearly, so that I can trust what is running.
14. As a solo practitioner, I want automation status badges to be visually consistent, so that “ready” and “disabled” states are easy to compare.
15. As a solo practitioner, I want schedule details to read cleanly, so that I can understand when automated work runs.
16. As a solo practitioner, I want the Channels page to show Telegram and WhatsApp as coming soon, so that I understand future communication channels without seeing unfinished setup.
17. As a solo practitioner, I want unfinished channel setup flows hidden, so that the product feels launch-ready.
18. As a solo practitioner, I want CRM people, company, and deal lists to feel like polished work tables, so that I can review client records quickly.
19. As a solo practitioner, I want table rows to have clear hover and selected states, so that I can confidently scan and open records.
20. As a solo practitioner, I want empty or missing values to be visually quiet, so that “None” or blank fields do not dominate the table.
21. As a solo practitioner, I want deal stages and task statuses to use consistent colors, so that status meaning is easy to learn.
22. As a solo practitioner, I want task titles to remain readable even when long, so that one noisy task does not break the page rhythm.
23. As a solo practitioner, I want meetings to be grouped and named cleanly, so that recorded work does not feel like raw logs.
24. As a solo practitioner, I want “Untitled” meeting fallbacks to feel intentional, so that the Meetings page does not look unfinished.
25. As a solo practitioner, I want Pricing to feel premium even when paid checkout is not yet enabled, so that I do not interpret launch setup as product instability.
26. As a solo practitioner, I want plan calls-to-action to be consistent, so that I understand whether I can upgrade, contact support, or stay on my current plan.
27. As a solo practitioner, I want Settings pages to feel useful even when sparse, so that they do not look like placeholders.
28. As a solo practitioner, I want account and workspace settings to use clear empty-state framing, so that I understand what is configurable now.
29. As a mobile user, I want every polished page to remain touch-friendly, so that I can use Sunder between meetings.
30. As a mobile user, I want tables and card views to avoid horizontal scroll, so that core workflows remain usable on a phone.
31. As a mobile user, I want navigation and primary actions to remain reachable, so that I can act quickly.
32. As a returning user, I want the product vocabulary to be consistent across pages, so that I do not need to relearn concepts.
33. As a prospective customer viewing the landing page, I want the public site to match the app’s quality, so that the product feels cohesive before and after sign-up.
34. As a prospective customer, I want landing-page visuals to feel polished but not generic, so that Sunder feels credible and differentiated.
35. As a founder showing the app, I want every launch-critical screen to avoid placeholder language, so that demos feel confident.
36. As a founder showing the app, I want local/dev-only chrome hidden from demo surfaces, so that recordings look production-ready.
37. As a designer or engineer, I want design tokens to carry the new color direction, so that polish does not become one-off class edits.
38. As a designer or engineer, I want shared primitives to carry the main visual changes, so that future pages inherit the polished system.
39. As a designer or engineer, I want tests to cover visible product behavior, so that polish changes do not regress launch-critical surfaces.
40. As a designer or engineer, I want the Refero-inspired direction documented as “principles, not copy,” so that future work does not accidentally clone another brand.

## Implementation Decisions

- Adopt a restrained product color strategy rather than a full redesign. The app should remain mostly neutral, with mature green used for primary and active states.
- Keep the Sunder green identity, but use a deeper green value for primary actions and selected navigation.
- Replace broad green-tinted chrome with neutral sidebar and surface tokens.
- Use subtle active navigation treatment: green text/icon, faint green fill, thin ring or border if needed.
- Preserve the existing dashboard information architecture: chat, skills, automations, channels, CRM, tasks, meetings, pricing, and settings.
- Do not copy the Refero/Voiceflow design system directly. Borrow only the applicable principles: neutral shell, precise accent color, hairline borders, pill-like controls, and calmer hierarchy.
- Treat landing page and authenticated dashboard as related but not identical registers. The landing page can be more brand-led; the dashboard should remain task-led.
- Keep dashboard typography operational. Avoid introducing display-heavy or editorial type into dense UI labels, tables, buttons, or settings controls.
- Continue using existing shared product primitives for page shell, page header, surfaces, cards, buttons, badges, switches, side navigation, list tables, and settings layout.
- Centralize color and surface changes in design tokens and shared primitives wherever possible.
- Avoid raw palette classes in dashboard components. Use semantic and domain tokens for states, CRM concepts, file types, and statuses.
- Keep Telegram backend/API implementation intact, but hide unfinished launch-facing pairing flows.
- Provide a simple Channels page that lists Telegram and WhatsApp as coming soon without connect buttons.
- Remove internal launch-state copy from customer-visible pages.
- Keep pricing fallback states customer-safe. “Contact support” and “Contact us” should feel intentional, not broken.
- Tighten chat page hierarchy so it feels like the primary operating surface rather than a marketing-style empty hero.
- Improve skill cards so long descriptions remain readable but bounded.
- Improve CRM list polish through row density, muted missing values, clearer badges, and table hover/focus states.
- Improve task list polish through long-title handling, quieter generated-noise text, and clearer status hierarchy.
- Improve meetings list polish through cleaner date grouping, better fallbacks, and more refined recording metadata.
- Improve sparse settings pages with intentional empty-state framing.
- Preserve existing data models and backend contracts. This PRD is UI/aesthetic and should not introduce schema changes.
- Preserve existing routing unless a route is only a launch-safe surface for an already visible navigation item.
- Keep mobile behavior first-class. Mobile should not be treated as a compressed desktop.

## Testing Decisions

- Tests should verify external behavior and visible product outcomes, not implementation details.
- The highest test seam should be route/page-level rendering for launch-critical pages.
- Component tests should cover shared primitives only when the component itself owns reusable behavior or state.
- Existing page tests for chat, pricing, settings, sidebar, CRM list pages, automations, and channels should be extended where relevant.
- Browser verification should cover both desktop and mobile-width layouts for the primary surfaces.
- Visual QA should inspect at least the following routes: chat, skills, automations, channels, people, companies, deals, tasks, meetings, pricing, profile settings, agent settings, memory/personality settings, billing settings, and the logged-out landing page.
- For Channels, tests should verify Telegram and WhatsApp are visible as coming soon and that connect actions are not exposed.
- For hidden Telegram launch scope, tests should verify chat and profile settings do not show Telegram connection calls-to-action.
- For pricing, tests should verify internal quota placeholders and unavailable checkout states do not leak to users.
- For navigation, tests should verify the Channels item appears and the active state remains accessible.
- For CRM and task tables, tests should focus on responsive behavior, absence of horizontal page overflow, and visible row controls rather than CSS implementation.
- For Settings pages, tests should verify sparse pages render product-ready copy and do not expose internal implementation language.
- For the landing page, tests should verify the public page renders without authenticated redirects in a logged-out context.
- Existing prior art includes page-level React Testing Library tests, route tests for settings/pricing/chat, sidebar tests, CRM list page tests, and focused component tests around settings rows and channel rows.
- Automated checks should include TypeScript, lint, typography lint, and targeted Vitest suites for changed surfaces.
- Final acceptance requires in-app browser review, not only code inspection.

## Out of Scope

- Rebuilding the full product information architecture.
- Shipping real Telegram pairing in the launch UI.
- Shipping real WhatsApp integration.
- Changing Supabase schemas or RLS policies.
- Replacing the managed-agent runner or tool architecture.
- Replacing the existing dashboard component library.
- Creating a pixel-perfect clone of the Refero/Voiceflow reference.
- Redesigning every workflow interaction from scratch.
- Introducing a new brand identity unrelated to Sunder’s existing green.
- Building net-new billing functionality.
- Building new CRM functionality beyond visual polish.
- Building new automations functionality beyond visual polish.
- Creating a full design system documentation site.

## Further Notes

- The product register should remain “calm operational workbench.” The goal is top-grade SaaS trust, not decorative novelty.
- The user explicitly disliked the full green sidebar tint because it felt cheap. The new direction should use green with restraint and confidence.
- The Refero/Voiceflow reference is useful for taste calibration: neutral shell, precise color, airy composition, and disciplined UI details.
- The current launch priority is aesthetic polish and product readiness, not feature expansion.
- The issue tracker item for this PRD should receive the `ready-for-agent` triage label when published.
- Publishing to the project issue tracker was attempted from the current Codex session, but no callable issue-create tool was exposed. This local PRD should be published once Linear or the project issue tracker connector is available.
