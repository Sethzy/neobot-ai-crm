# Sunder Automations UX Plan v1

Status: proposed  
Date: 2026-03-06

## Goal

Ship a simple Automations page that is easy to build, easy to understand, and fully aligned with Sunder's current architecture.

This plan intentionally favors KISS over a full Cursor-style workflow product.

## Core Decision

Use a Dorabot-style page as the base:

- one page
- Autopilot card at the top
- simple list of automations below
- inline actions on each row
- thread remains the place for history, approvals, and deeper context

Borrow only two ideas from Cursor:

- a natural-language creation box at the top of the page
- suggestion cards in the empty state

Do not build separate builder screens, detail tabs, run dashboards, or environment setup UI in v1.

## Non-Negotiables From Source Of Truth

- `/automations` must show active triggers with name, type, schedule or config, last run, next run, status, enable or disable control, and links to the trigger's thread.
- Automations must show Autopilot status, cadence, and controls in the same destination as scheduled jobs.
- Automations must never be a blank screen.
- Approvals live in trigger threads, not on a separate automations approval surface.

## Historical Visual References

The original screenshot pack for this archived v1 automations plan was pruned
during repo hygiene cleanup. The retained direction is summarized below so the
archive still explains the product rationale without carrying old binary
artifacts.

### Primary baseline: Dorabot

Use these as the main visual reference for the v1 page structure:

What to copy from Dorabot:

- simple one-page layout
- `Pulse` block at the top
- compact automation rows
- inline actions like enable, run now, and delete
- no separate builder or detail screen

### Secondary reference: Cursor overview and creation affordances

Use these only for the top creation box and suggestion-card treatment:

What to copy from Cursor:

- chat-like automation creation box at top
- empty-state suggestion cards
- clean spacing and restrained visual style

What not to copy from Cursor in v1:

- separate automation detail pages
- settings and run-history tabs
- environment sections
- full template gallery or template modal flow

### Out of scope references

Cursor settings/detail pages, template galleries, and Manus/Tasklet examples
were reviewed but were not the target for v1 implementation.

## Recommended Page Layout

### 1. Header

- Title: `Automations`
- Subtitle: `Background routines and autopilot controls.`

### 2. Create Automation Box

This is the one Cursor-style addition worth keeping.

It should look like a lightweight chat composer, not a form builder.

Example placeholder text:

- `Every weekday at 8am prepare my morning brief`
- `Watch PropertyGuru for new listings in District 15`

Primary behavior:

- user types a request
- submitting creates a new chat thread
- user is redirected into that thread
- the message is sent as the first user message
- the agent continues setup inside the thread using trigger tools

This is the same mental model as `/chat`, just started from `/automations`.

### 3. Suggestion Cards

Show small starter cards under the composer, especially in empty states.

Examples:

- Daily morning briefing
- Weekly pipeline review
- New lead triage
- Listing RSS watcher
- Follow-up reminder

Clicking a suggestion should do the same thing as typing into the composer:

- create a new thread
- send the suggestion prompt
- navigate to `/chat/[threadId]`

### 4. Autopilot Card

Autopilot should be the first block on the page.

Fields:

- status
- pulse interval
- quiet hours
- last run
- next run

Actions:

- `Enable` or `Pause`
- `Run now`
- `Open thread`

This should feel more like Dorabot's `Pulse` row than like a complex settings page.

### 5. Automation List

Render each automation as a compact expandable row or card.

Collapsed state should show:

- name
- type
- short summary
- next run
- last result
- enabled state

Inline actions:

- `Enable` or `Pause`
- `Run now`
- `Open thread`
- `Delete`

Expanded state can reveal:

- schedule or trigger config
- created date
- instruction preview
- webhook URL or RSS feed URL when relevant

This avoids needing a separate detail page in v1.

## Creation Flow

This is the key architectural recommendation.

### When user creates from `/automations`

1. User submits the top composer or clicks a suggestion.
2. App uses the same new-session behavior as the current chat entry flow.
3. A new thread is created.
4. The user is redirected to `/chat/[threadId]`.
5. The first message is the automation request.
6. The agent asks follow-up questions if needed.
7. When the agent calls `setup_trigger`, that trigger should use this same thread as its dedicated automation thread.

This keeps the system simple and gives us a clean invariant:

- one automation thread per automation created from the Automations page

That is the simplest way to preserve run history, approval context, and thread-native UX.

## Why This Fits Sunder Better Than Cursor

Cursor assumes a more fully featured automation product:

- richer builder
- multi-section detail screens
- dedicated run views
- environment management
- developer-facing tools model

Sunder today is simpler:

- `agent_triggers`
- `autopilot_config`
- `conversation_threads`
- `runs`
- approvals in-thread

So the right v1 UX is:

- creation starts from Automations
- execution and approval continue in chat thread
- Automations page is a control surface, not a second workspace

## What We Should Not Build In v1

- separate automation detail routes
- settings and run-history tabs
- full run-detail screens
- on-page streaming chat session
- environment or MCP setup sections
- complex template marketplace
- multi-trigger workflows in one automation

## Empty State

The page should still feel useful when there are no user automations yet.

Recommended structure:

- top composer still visible
- suggestion cards visible
- Autopilot card visible
- empty list state copy: `No automations yet`
- helper text: `Describe a routine above or start from a suggestion`

## Mobile Behavior

Keep the same structure, just stacked:

- composer
- suggestion cards
- Autopilot card
- automation cards

On mobile, each automation should be a card, not a table row.

## Implementation Notes

### Reuse existing chat session creation

The Automations page should not invent its own orchestration flow.

Reuse the same new-thread behavior as chat:

- create draft or thread
- send first user message
- navigate into the thread

### Best thread model

For automations created from this page:

- the setup thread should become the automation's permanent thread

This is the cleanest path for:

- approvals
- run history
- user follow-ups
- future edits

### Data shown on the page

Minimum v1 read model:

- non-pulse rows from `agent_triggers`
- `autopilot_config`
- pulse trigger row for Autopilot
- `runs` aggregation for last run and next run display

## Final Recommendation

Yes, the best v1 direction is a hybrid:

- Dorabot-style simple automations control page
- Cursor-style composer and suggestions at the top
- existing chat flow reused for creation

That gives us:

- a page that is not blank
- a simple UX
- a natural way to create automations
- no unnecessary builder complexity
- clean alignment with Sunder's thread-based architecture
