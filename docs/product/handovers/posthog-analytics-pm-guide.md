# PostHog Analytics — PM Quick Start

Use this guide once the engineering implementation is live. It is written for PM workflow, not for code changes.

For a more Sunder-specific product lens, read [posthog-analytics-v2-strategy.md](/Users/sethlim/Documents/sunder-next-migration-20260225/docs/product/handovers/posthog-analytics-v2-strategy.md). The live PostHog project now uses that v2 dashboard stack.

## What You Can Answer Now

PostHog can now tell you:

- whether new users are signing up and signing in
- whether they reach first value through chat and completed agent work
- whether the agent is completing runs safely and reliably
- whether approvals, CRM actions, connections, triggers, memory writes, uploads, and billing flows are being used
- which plans are converting, churning, or failing payment

## First-Time Setup

1. Open the Sunder PostHog project and confirm you are looking at the production project, not a personal sandbox.
2. Open live events and verify that recent traffic is flowing before building any dashboards.
   Default filter: `environment = production`.
   If the team has configured internal email domains, also filter `is_internal != true`.
3. Filter to Sunder custom events and check that you can see at least these events:
   - `signed_up`
   - `signed_in`
   - `chat_message_sent`
   - `agent_run_completed`
    - `agent_run_failed`
   - `approval_requested`
   - `approval_resolved`
   - `subscription_created`
4. Open a few person profiles and confirm properties like `plan_name` and `subscription_status` are present.

## Start With These Dashboards

Open these in order. The full metric definitions live in [posthog-analytics-handover.md](/Users/sethlim/Documents/sunder-next-migration-20260225/docs/product/handovers/posthog-analytics-handover.md).

1. Time to Trusted Value
   Start here. This is the main PM dashboard for whether a new user reaches first trusted value quickly.
2. Trust & Autonomy
   Use this for run reliability, approvals, top tools, and background execution health.
3. Compounding Usage
   Use this to see whether memory, CRM, connections, and automations are starting to accumulate durable value.
4. Revenue Readiness
   Check conversion, churn, payment failures, and plan mix after the value loop is healthy.
5. Acquisition
   Keep this as supporting context, not the default weekly headline dashboard.

## Recommended Weekly Routine

Every week, check:

- signups and sign-ins
- first-message conversion rate
- signup to first completed run
- repeat-message rate within 7 days
- `agent_run_completed` versus `agent_run_failed`
- approval request volume and approve/deny split
- memory writes, connections completed, and trigger creation / execution
- checkout starts, new subscriptions, cancellations, and payment failures
- feature breadth across CRM, triggers, connections, memory, and uploads

If one metric moves sharply, drill into event properties before drawing conclusions. In most cases the useful breakdowns are `plan_name`, `method`, `trigger_type`, `tool_name`, `toolkit_slug`, and `entity_type`.
For reliability work, the most useful failure breakdowns are now `error_stage`, `trigger_type`, and `result_status`.

## Event Cheat Sheet

- Acquisition: `signed_up`, `signed_in`
- Activation: `chat_message_sent`
- Core product health: `agent_run_completed`, `agent_run_failed`, `approval_requested`, `approval_resolved`
- CRM usage: `crm_record_created`, `crm_record_viewed`, `deal_stage_changed`
- Connection usage: `connection_initiated`, `connection_completed`
- Automation usage: `trigger_created`, `trigger_executed`
- Memory and uploads: `memory_file_saved`, `file_uploaded`
- Revenue: `checkout_started`, `subscription_created`, `subscription_canceled`, `payment_failed`

## What Not To Overinterpret

- Autocaptured clicks and pageviews are useful for exploration, but the custom Sunder events should drive product decisions.
- One user can generate many agent runs; use user-based views for adoption questions and event-based views for operational questions.
- Billing events should be read together with plan properties. Raw event counts alone do not tell you net revenue health.

## When To Pull In Engineering

Ask engineering to help if:

- live events suddenly stop flowing
- key person properties disappear
- an important funnel step drops to zero unexpectedly
- a new feature ships and there is no corresponding event or dashboard tile
