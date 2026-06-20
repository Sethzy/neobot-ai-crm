# Research Prompt: Integration Provider Trigger Comparison

## Context

Sunder currently uses **Composio** for OAuth + tool execution + triggers. We're about to ship external event triggers (Gmail, Calendar, etc.) using Composio's polling-based trigger system.

**The problem:** Composio-managed OAuth enforces a **15 min minimum polling interval** for triggers. With our own Google OAuth app, we get **1 min polling**. But 1 min is still not real-time — Tasklet uses Pipedream which gets **5-30 second** latency via Gmail Pub/Sub push.

**The question:** Should we stick with Composio for triggers, or is there a provider that offers better latency and/or better pricing for event-driven triggers? We're open to switching the trigger layer while keeping Composio for OAuth + tool execution (separation of concerns).

## Providers to Evaluate

### Tier 1: Direct competitors to Composio triggers (evaluate in depth)

1. **Pipedream Connect** — https://pipedream.com/connect — What Tasklet uses. Open-source source components, Pub/Sub push for Gmail, per-trigger state. Known pricing: $99/mo + $2/user beyond 100. Public registry trigger executions are free.

2. **Paragon** — https://useparagon.com — Embedded integration platform. Check if they have a triggers/events system. Pricing?

3. **Nango** — https://nango.dev — Open-source unified API + syncs. Check if they support event-driven triggers or just data syncing. Pricing?

4. **Arcade** — https://arcade.dev — AI-native integration platform. Check trigger capabilities. Pricing?

5. **Alloy Automation** — https://runalloy.com — Embedded iPaaS. Check trigger capabilities, polling intervals. Pricing?

### Tier 2: Consider if Tier 1 doesn't yield a clear winner

6. **Merge.dev** — Unified API. Primarily for HR/ATS/CRM aggregation. May not have triggers.
7. **Vessel** — https://vessel.dev — Embedded integrations. Evaluate if still active.
8. **Tray.io / Workato / Zapier** — Enterprise iPaaS. Likely overkill and expensive but check pricing for embedded/OEM use.

## What to Evaluate for Each Provider

For each Tier 1 provider, answer:

### 1. Trigger Capabilities
- Does it support **event-driven triggers** (not just data syncing)?
- What trigger types are available for **Gmail** and **Google Calendar** specifically?
- Is it **webhook/push-based** or **polling-based** for Gmail? For Calendar?
- What's the **minimum polling interval** if polling-based?
- Does it support **custom OAuth apps** to bypass shared rate limits?

### 2. Latency
- What's the **end-to-end latency** from "email arrives in Gmail" to "webhook fires to our endpoint"?
- Best case / worst case / average?

### 3. Integration Model
- How does the provider deliver events to our app? (Webhook URL? SDK callback? Pub/Sub?)
- Is it **per-trigger webhook URL** or **project-level**?
- What metadata is in the payload? Can we identify which user/trigger fired?
- HMAC verification?

### 4. Pricing at Scale
- Base cost per month
- Per-user cost (we're embedding for multi-tenant — each Sunder user is an "end user")
- Per-trigger-execution cost
- Cost estimate at **100 users** and **500 users**, each with Gmail + Calendar triggers

### 5. SDK / Developer Experience
- TypeScript SDK available?
- How do you create/delete/list triggers programmatically?
- Is the OAuth flow managed (like Composio) or do we handle it ourselves?
- Can we use our existing Composio OAuth connections, or does the trigger provider need its own OAuth flow?

### 6. Maturity / Reliability
- How long has the trigger system been in production?
- Any known outage history or reliability complaints?
- Open-source components (for vendor risk mitigation)?
- Acquisition risk?

## Comparison Table to Produce

| Feature | Composio (current) | Pipedream | Paragon | Nango | Arcade | Alloy |
|---|---|---|---|---|---|---|
| Gmail trigger type | Poll | Push (Pub/Sub) | ? | ? | ? | ? |
| Gmail latency | 1-15 min | 5-30 sec | ? | ? | ? | ? |
| Calendar trigger type | Poll | ? | ? | ? | ? | ? |
| Min polling interval | 15 min (managed) / 1 min (custom) | N/A (push) | ? | ? | ? | ? |
| Per-user cost | $0 (tool-call based) | $2/user >100 | ? | ? | ? | ? |
| Monthly base | ~$229 (Business, already paying) | $99 | ? | ? | ? | ? |
| 500-user estimate | ~$229 | ~$1,000-1,600 | ? | ? | ? | ? |
| TypeScript SDK | Yes | Yes | ? | ? | ? | ? |
| Managed OAuth | Yes | Yes | ? | ? | ? | ? |
| Can reuse Composio OAuth? | N/A | No (own auth) | ? | ? | ? | ? |
| Open-source triggers | No | Yes (GitHub) | ? | ? | ? | ? |
| Reliability | Reported issues | Battle-tested | ? | ? | ? | ? |

## Decision Framework

After the research, recommend based on:

1. **If a provider offers push-based Gmail triggers at comparable or lower cost to Composio** → strong candidate to replace Composio's trigger layer (keep Composio for OAuth + tools)
2. **If no provider beats Composio significantly** → stick with Composio, ship at 15 min polling, upgrade to 1 min with own OAuth
3. **If Pipedream is the only option with push-based triggers** → quantify the cost delta vs Composio and recommend whether the latency improvement justifies it

## Background Reading

- Full Pipedream/Tasklet trigger internals: `roadmap docs/Sunder - Source of Truth/references/tasklet/trigger-system-internals.md`
- Composio verification findings: `roadmap docs/Sunder - Source of Truth/references/tasklet/composio-triggers-verification-prompt.md`
- Sunder's existing Composio integration: `src/lib/composio/` (OAuth, tools, client)
- Sunder trigger system: `src/lib/triggers/` (scanner, executor, schemas)
