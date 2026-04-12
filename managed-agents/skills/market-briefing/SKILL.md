---
name: market-briefing
description: "Produces a market briefing with relevant trends, news, and implications for the user's work. Use when the user asks for a market update, market brief, sector summary, or competitive context."
---

# Market Briefing

Research market conditions and generate a focused briefing that connects external signals back to your active work. The output maps what changed to why it matters to who in your CRM pipeline is affected.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     MARKET BRIEFING                              │
├─────────────────────────────────────────────────────────────────┤
│  ALWAYS (works standalone)                                       │
│  ✓ Web search: pricing shifts, new offerings, policy changes   │
│  ✓ CRM: connect signals back to active deals and clients       │
│  ✓ Three-layer analysis: what changed → why it matters → who   │
│  ✓ Output: scannable briefing with pipeline impact              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Getting Started

When you run this skill, I'll ask for what I need:

**If topic is clear:**
> "Market briefing on [area/segment/topic]" — I'll research and deliver.

**If topic is broad:**
> I'll ask: "Any specific area, segment, or topic? Or a general market scan?"

**If recurring:**
> Save the briefing with `storage_write` and set up a trigger for weekly/monthly updates.

---

## Output Format

```markdown
# Market Briefing: [Topic/Area]

**Generated:** [Date]
**Sources:** Web Research, CRM

---

## Quick Take

[2-3 sentences: The one or two things that actually change advice or timing for active deals]

---

## What Changed

### Pricing Signals
| Signal | Detail | Source | Date |
|--------|--------|--------|------|
| [Price movement] | [Specifics] | [Source] | [Date] |

### New Offerings / Launches
| Offering | Detail | Why It Matters |
|----------|--------|----------------|
| [New product/listing/policy] | [Key details] | [Impact on your work] |

### Policy / Regulatory
| Change | Detail | Effective | Impact |
|--------|--------|-----------|--------|
| [Policy change] | [What changed] | [When] | [Who it affects] |

### Other Notable Developments
- [Development — why it matters]

---

## Why It Matters

For each signal above, the implication:

1. **[Signal]** → [What this means for your clients/deals]
2. **[Signal]** → [How this changes advice or timing]

---

## Who's Affected in Your Pipeline

| Client/Deal | Signal | Impact | Recommended Action |
|-------------|--------|--------|--------------------|
| [Name/Deal] | [Which signal] | [How it affects them] | [What to do] |
| [Name/Deal] | [Which signal] | [How it affects them] | [What to do] |

---

## Recommended Actions

1. **[Action]** — [Why now, tied to a specific signal]
2. **[Action]** — [Why now]
3. **[Action]** — [Why now]

---

## Sources
- [Source 1](URL)
- [Source 2](URL)
```

---

## Execution Flow

### Phase 1: Research Market Signals

```
Run targeted web searches by category:

Pricing:
1. "[Market/area] pricing trends [year]" — recent price movements
2. "[Market/area] transaction data" — volume and pricing signals

New Offerings:
3. "[Market/area] new launch OR new product OR new listing" — what's new
4. "[Market/area] upcoming releases" — what's coming

Policy / Regulatory:
5. "[Market/area] regulation OR policy change [year]" — regulatory shifts
6. "[Industry] compliance OR requirements update" — new requirements

Financing / Conditions:
7. "[Market/area] interest rates OR financing" — cost of capital
8. "[Market/area] supply OR demand trends" — macro conditions
```

### Phase 2: Connect to CRM Pipeline

```
1. search_crm → Active deals and contacts
   - Match signals to deals by area, segment, budget, timeline
   - Flag deals where a signal changes urgency or advice

2. Identify:
   - Which clients should hear about this
   - Which deals are accelerated or at risk
   - Which stale deals this could re-engage
```

### Phase 3: Synthesize Briefing

```
1. Filter to signals that actually change advice or timing
2. Structure in three layers: what → why → who
3. Lead with the most impactful signals
4. Connect every signal to a CRM action where possible
5. Output formatted briefing
```

---

## Briefing Variations

### General Market Scan
Focus on: Broad overview across all categories
Best for: Weekly or monthly check-in on market conditions

### Segment-Specific
Focus on: Deep dive on one area, segment, or product category
Best for: When a client asks about a specific market

### Trigger-Based
Focus on: One specific event and its implications
Best for: Reacting to a policy change, major launch, or price shift

---

## Refresh Cadence

Market intel gets stale. Recommended refresh:

| Trigger | Action |
|---------|--------|
| **Weekly** | Quick scan — new pricing signals, launches |
| **Monthly** | Full briefing — all categories |
| **Policy change** | Immediate update on that change and who it affects |
| **Major launch** | Immediate analysis of the new offering |
| **Client asks** | On-demand segment or topic briefing |

---

## Gotchas

- Prioritize freshness. Old market commentary is rarely useful if newer signals exist.
- Do not present thin search evidence as a clear market trend. Say "early signal" not "trend."
- Separate observed facts from interpretation. Label which is which.
- If the update is mixed or noisy, say that plainly instead of forcing a strong narrative.
- Not everything is actionable. If nothing significant changed, say that.

---

## Tips

1. **Be specific** — "market briefing on District 15 condos" gets better results than "market update"
2. **Set up a recurring trigger** — Weekly market scans keep you ahead of clients
3. **Name the signal** — "What does the new ABSD change mean for my clients?" focuses the briefing
4. **Save and share** — Use `storage_write` to save briefings you want to reference later

---

## Related Skills

- **opportunity-analysis** — Deep dive on a specific opportunity surfaced by the briefing
- **pipeline-review** — See which active deals are affected by market changes
- **draft-outreach** — Reach out to affected clients with the news
