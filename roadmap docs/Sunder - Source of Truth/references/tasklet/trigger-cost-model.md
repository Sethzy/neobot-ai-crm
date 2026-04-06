# Trigger Cost Model: Composio vs Pipedream

## Assumptions

### Usage per user (advisory sales practitioner)
- **2 polling triggers**: Gmail inbox + Google Calendar
- **~10 emails received/day** that fire the Gmail trigger
- **~3 calendar events/day** that fire the Calendar trigger
- **~5 Composio tool calls per trigger fire** (agent reads email, searches CRM, updates contact, drafts reply, etc.)
- **13 trigger fires/day** total → **65 agent tool calls/day** → **1,950 agent tool calls/month**

### Composio polling overhead per trigger
- At **15 min** interval: 96 polls/day per trigger (24h × 4/hr)
- At **1 min** interval: 1,440 polls/day per trigger
- **2 triggers/user**:
  - 15 min: **192 polls/day** → **5,760 polls/month/user**
  - 1 min: **2,880 polls/day** → **86,400 polls/month/user**

### Key unknown: Does Composio count trigger polls as "tool calls"?

**Case A (worst case):** Each poll check counts as a tool call. This is likely — each poll hits the Gmail/Calendar API through Composio's infrastructure.

**Case B (best case):** Trigger polls are free/separate from tool call quota. Only agent actions count.

---

## Scenario 1: Composio Only (current plan)

### Composio Pricing Tiers
| Plan | Monthly | Tool Calls Included |
|---|---|---|
| Growth | $29 | 200,000 |
| Business | $229 | 2,000,000 |
| Custom | Sales | Negotiable |

### Case A: Polls count as tool calls

| Users | Polling calls/mo (15 min) | Polling calls/mo (1 min) | Agent action calls/mo | Total (15 min) | Total (1 min) |
|---|---|---|---|---|---|
| 50 | 288,000 | 4,320,000 | 97,500 | **385,500** | **4,417,500** |
| 100 | 576,000 | 8,640,000 | 195,000 | **771,000** | **8,835,000** |
| 200 | 1,152,000 | 17,280,000 | 390,000 | **1,542,000** | **17,670,000** |
| 500 | 2,880,000 | 43,200,000 | 975,000 | **3,855,000** | **44,175,000** |
| 1000 | 5,760,000 | 86,400,000 | 1,950,000 | **7,710,000** | **88,350,000** |

**Cost mapping (15 min polling):**
| Users | Tool Calls | Plan Needed | Monthly Cost |
|---|---|---|---|
| 50 | 385K | Business ($229) | **$229** |
| 100 | 771K | Business ($229) | **$229** |
| 200 | 1.54M | Business ($229) | **$229** |
| 500 | 3.86M | ~2× Business or Custom | **~$458+** |
| 1000 | 7.71M | ~4× Business or Custom | **~$916+** |

**Cost mapping (1 min polling):**
| Users | Tool Calls | Plan Needed | Monthly Cost |
|---|---|---|---|
| 50 | 4.4M | ~2.2× Business | **~$504+** |
| 100 | 8.8M | ~4.4× Business | **~$1,008+** |
| 200 | 17.7M | ~8.8× Business | **~$2,016+** |
| 500 | 44.2M | ~22× Business | **~$5,038+** |
| 1000 | 88.4M | Custom (negotiable) | **???** |

**The 1-min polling cost is absurd.** At 500 users, trigger polling alone consumes 43M tool calls/month — 21× the Business plan limit.

### Case B: Polls are free, only actions count

| Users | Agent Action Calls/mo | Plan Needed | Monthly Cost |
|---|---|---|---|
| 50 | 97,500 | Growth ($29) | **$29** |
| 100 | 195,000 | Growth ($29) | **$29** |
| 200 | 390,000 | Business ($229) | **$229** |
| 500 | 975,000 | Business ($229) | **$229** |
| 1000 | 1,950,000 | Business ($229) | **$229** |

This is the dream scenario — triggers are free overhead, you only pay for what the agent does. **But this needs to be confirmed with Composio.**

---

## Scenario 2: Pipedream (triggers) + Composio (tools only)

### How it works
- Pipedream handles trigger detection + webhook delivery (push-based, no polling)
- Composio handles OAuth + agent tool execution only
- **Zero Composio polling overhead** — only agent action calls count

### Pipedream Pricing
| Component | Cost |
|---|---|
| Base (Connect plan) | $99/mo |
| First 100 users | Included |
| Each additional user | $2/user/mo |
| Public registry trigger executions | **$0** (free) |
| Credits (10,000 included) | For Pipedream actions only — we don't use these |

### Combined Cost (Pipedream + Composio)

| Users | Pipedream Cost | Composio Cost (actions only) | **Total** |
|---|---|---|---|
| 50 | $99 | $29 (Growth) | **$128** |
| 100 | $99 | $29 (Growth) | **$128** |
| 200 | $99 + $200 = $299 | $229 (Business) | **$528** |
| 500 | $99 + $800 = $899 | $229 (Business) | **$1,128** |
| 1000 | $99 + $1,800 = $1,899 | $229 (Business) | **$2,128** |

---

## Head-to-Head Comparison

### If Composio counts polls as tool calls (Case A)

| Users | Composio Only (15 min) | Composio Only (1 min) | Pipedream + Composio | Winner |
|---|---|---|---|---|
| 50 | $229 | ~$504 | **$128** | Pipedream |
| 100 | $229 | ~$1,008 | **$128** | Pipedream |
| 200 | $229 | ~$2,016 | **$528** | Pipedream at 1min; Composio at 15min |
| 500 | ~$458 | ~$5,038 | **$1,128** | Composio at 15min; Pipedream at 1min |
| 1000 | ~$916 | **???** | **$2,128** | Composio at 15min only |

**Key insight:** Composio is cheaper at 15 min polling (if you can tolerate the latency). The moment you want 1 min polling, Composio's polling overhead makes it MORE expensive than Pipedream — and Pipedream gives you 5-30 second latency for that price.

### If Composio polls are free (Case B)

| Users | Composio Only (any interval) | Pipedream + Composio | Winner |
|---|---|---|---|
| 50 | **$29** | $128 | Composio |
| 100 | **$29** | $128 | Composio |
| 200 | **$229** | $528 | Composio |
| 500 | **$229** | $1,128 | Composio |
| 1000 | **$229** | $2,128 | Composio |

If polls are truly free, Composio is cheaper at every scale. The only reason to add Pipedream is latency (5-30s vs 1-15 min).

---

## The Real Question

**Does Composio count trigger polling as tool calls?**

This single answer determines the entire cost model:

- **Yes (polls = tool calls):** Composio at 1-min polling is prohibitively expensive at scale. Pipedream is both FASTER and CHEAPER. Easy decision.
- **No (polls are free):** Composio is always cheaper. Adding Pipedream is a pure latency bet — you're paying $99-$1,899/mo extra for the difference between "1 minute" and "5-30 seconds."

### How to find out
1. Check Composio dashboard → Usage → see if trigger polls show up in tool call counts
2. Ask Composio support directly
3. Set up a test trigger, let it poll for 24 hours, check tool call consumption

---

## Recommendation

| If... | Then... |
|---|---|
| Polls count as tool calls AND you want 1 min | **Switch to Pipedream.** It's cheaper AND faster. |
| Polls count as tool calls AND 15 min is OK | **Stay Composio.** Cheapest option, but bad UX. |
| Polls are free AND latency matters | **Add Pipedream.** Pay extra for 5-30s vs 1 min. |
| Polls are free AND 1 min is fine | **Stay Composio.** Cheapest at every scale. |

**Action item:** Confirm Composio's polling billing model before making the final call.
