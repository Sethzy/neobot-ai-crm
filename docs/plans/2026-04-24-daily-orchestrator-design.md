# Daily Orchestrator — design

**Date:** 2026-04-24
**Status:** Approved, not yet implemented
**Supersedes:** separate Autopilot product surface, `pulse` trigger concept, quiet-hours concept

## Background

Sunder currently has two overlapping concepts for proactive work:

- **Autopilot** as a separate product surface with its own settings card, prompt, and config table.
- **Automations** as the general scheduled/webhook/RSS trigger system.

In practice, Autopilot is already just a hidden special-case automation. It adds product and code complexity without earning a distinct user mental model. The simplification goal is to collapse proactive behavior into a single automation model and remove the extra concept entirely.

## Goal

Replace Autopilot with one seeded default automation that behaves like every other automation.

## Core decisions

- Seed one default automation for every new client: `Daily Orchestrator`.
- Default schedule: every day at `8:00 AM` local time.
- Enabled by default.
- Fully editable, disable-able, rename-able, and deletable like any other automation.
- No restore flow if deleted.
- Keep the current automation thread model: **new thread per run**.
- Remove the `pulse` concept rather than hiding it behind renamed UI.
- Remove quiet hours rather than preserving a separate suppression system.
- Do not create child automations or same-day one-off automations from this feature.

## Behavior

`Daily Orchestrator` is a single morning run, not an all-day pulse loop.

Each morning it starts a fresh run thread and:

- gives a concise executive-assistant-style briefing for the day,
- auto-does obvious internal work,
- prepares external drafts or recommendations when useful.

It may do real prep work, but it does **not** execute external-facing actions unprompted. External actions still require the user to continue or approve in-thread.

It also does **not** schedule later work automatically. If something should happen later, that is outside the scope of this feature.

## Thread model

`Daily Orchestrator` follows the same thread model as every other automation:

- one automation row,
- one new thread per run,
- user can reply in that run thread and continue the work naturally.

We do **not** add a persistent immortal automation thread just for this default automation.

## Conversation sketch

```text
Daily Orchestrator — Apr 24, 8:00 AM

Assistant:
Friday, Apr 24. Light morning, heavier afternoon.

11:00 AM — Atlas Wealth intro with Sarah Lim. Worth prep.
3:00 PM — ACME renewal review. Pricing pushback likely.
You are clear 1:00–2:30 PM.

Prepared for you:
- Drafted notes for the Atlas prep.
- Pulled the latest context for ACME.
- Drafted a reply to Jane Wu on policy options.

Worth deciding:
- Do you want me to turn the Jane draft into a send-ready email?
- Do you want a sharper prep brief for Atlas?

User:
Yes. Tighten the Jane draft and prep me for Atlas.

Assistant:
[continues in the same thread like a normal chat]
```

## Non-goals

- No template gallery.
- No hidden system-owned automation behavior.
- No child automations.
- No same-day one-off automations created by the morning run.
- No repeated pulse wakeups throughout the day.
- No quiet-hours feature.
- No exception to the current per-run thread model.

## Success criteria

- A new user sees one proactive concept: Automations.
- The default proactive automation is visible on the Automations page and managed like any other row.
- There is no separate Autopilot surface to learn.
- The morning run is useful on quiet days and busy days without producing filler.
- The agent can do obvious internal prep work automatically without silently expanding into a meta-scheduler.

## Open question

- How close should the seeded `Daily Orchestrator` prompt stay to the current EA-style Autopilot prompt versus being trimmed into a shorter default prompt now that the product boundary is narrower?
