# PostHog Analytics — Recommended V2 Strategy for Sunder

Use this document to interpret the existing PostHog setup through Sunder's actual product loop, not a generic SaaS lens.

## Core Framing

Sunder is not a generic engagement product. The core product questions are:

1. How quickly does a new user get to first trusted value?
2. Is the agent reliable and safe enough to earn repeat usage?
3. Is value compounding through memory, connections, CRM activity, and automations?
4. Do users who reach value convert to paid?

That means the current event setup is good enough for v1, but the dashboard order should change.

## Recommended Dashboard Order

1. Time to Trusted Value
2. Trust & Autonomy
3. Compounding Usage
4. Revenue Readiness
5. Acquisition

Acquisition should be last until Sunder has real user traffic.

## Current Dashboard Migration Plan

Use the dashboards that already exist in PostHog as the starting point. Do not delete them yet. Reuse the shells, rename where needed, and rebuild only the dashboards whose framing is wrong.

| Current PostHog dashboard | Action | Recommended new name | Why |
|---------------------------|--------|----------------------|-----|
| `Sunder · Activation & Engagement` | Rename and rebuild | `Sunder · Time to Trusted Value` | The current framing is too generic. This dashboard should measure speed to first trusted outcome, not just chat engagement. |
| `Sunder · Agent Health` | Rename and expand | `Sunder · Trust & Autonomy` | This is already close to the right shape. It just needs approvals and reliability treated as trust signals, not only operational signals. |
| `Sunder · Retention` | Rename and rebuild | `Sunder · Compounding Usage` | A single weekly retention tile is too thin for Sunder. This shell should become the compounding-value dashboard. |
| `Sunder · Revenue & Billing` | Keep, lightly rename if desired | `Sunder · Revenue Readiness` | The current billing dashboard is useful and mostly correct, but it should sit below activation and trust. |
| `Sunder · Acquisition` | Keep but de-prioritize | `Sunder · Acquisition` | The dashboard is fine, but PM should not treat it as a weekly headline dashboard until traffic is meaningful. |

### Dashboard-by-dashboard changes

#### 1. `Sunder · Activation & Engagement` → `Sunder · Time to Trusted Value`

Keep the dashboard object. Replace the framing.

**Keep as secondary tiles:**

- repeat usage within 7 days
- one supporting trend for active users if PM still wants a volume check

**Remove from headline position:**

- raw `DAU`
- raw `WAU`
- raw `MAU`
- generic top-tools usage if it is not connected to first value

**Rebuild around:**

- `signed_up` → `chat_message_sent`
- `signed_up` → `agent_run_completed`
- `signed_up` → first durable side-effect event
- time from `signed_up` to first completed run
- first meaningful category reached in first 7 days

#### 2. `Sunder · Agent Health` → `Sunder · Trust & Autonomy`

This is the closest existing dashboard to the right product frame.

**Keep:**

- `agent_run_completed` vs `agent_run_failed`
- failed runs by tool
- runs by trigger type
- run duration
- token usage

**Move in or emphasize more:**

- `approval_resolved` as a core tile, not a side metric
- top tools used, but interpreted as "where autonomy is happening"

**Interpretation shift:**

This dashboard is not just for engineering. It is the PM dashboard for trust.

#### 3. `Sunder · Retention` → `Sunder · Compounding Usage`

Reuse the dashboard shell, but the current contents are too thin.

**Keep:**

- weekly retention as one tile

**Add / rebuild around:**

- `memory_file_saved`
- `connection_completed`
- `trigger_created`
- `trigger_executed`
- `crm_record_created`
- `deal_stage_changed`
- feature breadth across chat, CRM, memory, connections, and automations

This should become the dashboard that answers whether Sunder is getting harder to leave.

#### 4. `Sunder · Revenue & Billing` → `Sunder · Revenue Readiness`

This dashboard is already mostly correct.

**Keep:**

- trial → paid conversion
- plan distribution
- churn
- payment failures

**De-emphasize for now:**

- pricing page traffic as a top product signal

This dashboard matters, but only after the value loop is healthy.

#### 5. `Sunder · Acquisition`

Keep it, but treat it as supporting context.

**Keep:**

- unique visitors
- traffic sources
- landing → signup
- signup method split

**PM guidance:**

Do not open here first every week. Open here only after activation and trust look healthy or when running acquisition experiments.

### Recommended execution order inside PostHog

1. Rename `Sunder · Activation & Engagement` to `Sunder · Time to Trusted Value`.
2. Rename `Sunder · Agent Health` to `Sunder · Trust & Autonomy`.
3. Rename `Sunder · Retention` to `Sunder · Compounding Usage`.
4. Optionally rename `Sunder · Revenue & Billing` to `Sunder · Revenue Readiness`.
5. Leave `Sunder · Acquisition` as-is, but move it to the bottom of the PM workflow.
6. Rebuild dashboard tiles in that same order.

### PM default dashboard stack

Once this migration is done, the PM opening order should be:

1. `Sunder · Time to Trusted Value`
2. `Sunder · Trust & Autonomy`
3. `Sunder · Compounding Usage`
4. `Sunder · Revenue Readiness`
5. `Sunder · Acquisition`

## Dashboard 1: Time to Trusted Value

This should be the main PM dashboard.

### Goal

Measure whether a new user gets useful agent work done quickly, ideally in the first session and definitely within the first 7 days.

### Recommended tiles

| Insight | Type | Definition using current events |
|---------|------|---------------------------------|
| Signup → first message | Funnel | `signed_up` → `chat_message_sent` |
| Signup → first completed run | Funnel | `signed_up` → `agent_run_completed` |
| Signup → first useful side effect | Funnel | `signed_up` → one of `crm_record_created`, `memory_file_saved`, `connection_completed`, or `trigger_created` |
| Repeat usage within 7 days | Funnel | `signed_up` → `chat_message_sent` → repeat `chat_message_sent` within 7 days |
| First-run latency | Trend / distribution | Time from `signed_up` to first `agent_run_completed` |
| Activation mix | Bar | For newly signed-up users, first meaningful event category: chat, CRM, memory, connection, automation |

### PM interpretation

`chat_message_sent` is useful, but it is not the end state. Treat it as intent, not value.

For Sunder, "activation" should mean:

- the user signs up
- the user engages in chat
- the agent completes work
- the work produces a durable artifact or system change

If users message the agent but never reach `agent_run_completed` or a durable side-effect event, activation is weaker than it looks.

## Dashboard 2: Trust & Autonomy

This dashboard should answer whether the agent is safe, reliable, and worth using more deeply.

### Recommended tiles

| Insight | Type | Definition using current events |
|---------|------|---------------------------------|
| Run success vs failure | Trend | `agent_run_completed` vs `agent_run_failed` |
| Approval requests | Trend | `approval_requested` count over time |
| Approval outcomes | Trend | `approval_resolved` broken down by `outcome` |
| Failed runs by stage | Bar | `agent_run_failed` broken down by `error_stage` |
| Top tools used | Bar | `agent_run_completed` broken down by `tools_called` |
| Runs by trigger type | Trend | `agent_run_completed` broken down by `trigger_type` |
| Run duration | Trend | `agent_run_completed` using median and P95 of `duration_ms` |
| Token usage | Trend | `agent_run_completed` sum of `total_tokens` |

### PM interpretation

For Sunder, trust is not just "the model answered." Trust means:

- runs complete reliably
- failure clusters are understandable
- approvals are not overwhelming users
- background work is starting to happen through triggers and connections

If approvals spike or failures cluster around one tool, product quality has dropped even if message volume is stable.

## Dashboard 3: Compounding Usage

This is the most product-specific dashboard. It should measure whether value is starting to accumulate over time.

### Recommended tiles

| Insight | Type | Definition using current events |
|---------|------|---------------------------------|
| Memory writes over time | Trend | `memory_file_saved` count per week |
| Connections completed | Trend | `connection_completed` count per week |
| Automations created | Trend | `trigger_created` count per week |
| Automations executing | Trend | `trigger_executed` count per week |
| CRM work completed | Trend | `crm_record_created` and `deal_stage_changed` over time |
| Feature breadth | Table / bar | Users who fired events across chat, CRM, memory, connections, and automations |
| Compounding cohort | Trend | Users who used at least 2 non-chat categories in the last 30 days |

### PM interpretation

This is where Sunder differs from a normal chatbot.

The product gets stronger when users move from:

- chat only
- to chat + completed work
- to connected systems
- to memory and automations

The compounding signal is not raw activity. It is breadth plus durability.

## Dashboard 4: Revenue Readiness

Keep revenue close to activation, but not above it.

### Recommended tiles

| Insight | Type | Definition using current events |
|---------|------|---------------------------------|
| Trial → paid conversion | Funnel | `checkout_started` → `subscription_created` |
| Plan distribution | Pie | users broken down by `plan_name` |
| Churn over time | Trend | `subscription_canceled` per week |
| Payment failures | Trend | `payment_failed` per week |

### PM interpretation

Until activation is healthy, revenue metrics mostly tell you conversion friction, not product-market fit.

## Dashboard 5: Acquisition

This should stay lower priority until you have enough traffic for source analysis to matter.

### Recommended tiles

| Insight | Type | Definition using current events |
|---------|------|---------------------------------|
| Unique visitors | Trend | `$pageview` unique users |
| Traffic sources | Bar | `$pageview` by `$referring_domain` or UTM |
| Landing → signup | Funnel | homepage → register → `signed_up` |
| Signup method split | Pie | `signed_up` by `method` |

### PM interpretation

Useful later, but currently less important than whether the agent creates value after signup.

## What To De-emphasize Right Now

- raw DAU / WAU / MAU as the headline metric
- pageview-heavy acquisition reporting
- pricing page funnels as a top-level PM dashboard
- power-user rankings based only on `chat_message_sent`

These are useful support metrics, not the center of the story.

## Current Events That Are Strong Product Signals

- `agent_run_completed`
- `agent_run_failed`
- `approval_resolved`
- `connection_completed`
- `trigger_created`
- `trigger_executed`
- `memory_file_saved`
- `crm_record_created`
- `deal_stage_changed`
- `subscription_created`

## Current Events That Need Careful Interpretation

- `chat_message_sent`
- `signed_in`
- `signed_up`
- `$pageview`

These are useful, but they are upstream signals. They do not prove value on their own.

## Events Worth Adding Later

The current setup is enough for v1. Later, Sunder should add a few more product-shaped events.

Recommended future events:

- `first_useful_output_delivered`
- `agent_work_accepted`
- `memory_reused_in_run`
- `approval_requested`
- `background_run_completed`

These would let PM distinguish between conversation, work, trust, and compounding value much more clearly.

## Weekly PM Questions

Every week, answer these in order:

1. Are new users getting from `signed_up` to `agent_run_completed` quickly?
2. Are they getting to at least one durable side effect like CRM, memory, connection, or automation usage?
3. Are runs completing reliably enough to support trust?
4. Are users broadening usage across systems, not just chatting?
5. Are users who hit those milestones more likely to start checkout and convert?

If the answer to 1 or 2 is weak, acquisition and pricing metrics are secondary.
