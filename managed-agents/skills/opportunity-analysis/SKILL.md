---
name: opportunity-analysis
description: "Analyzes a specific opportunity, pressure-tests the situation, and recommends next steps. Use when the user asks to analyze a deal, assess an opportunity, or think through a live pursuit."
---

# Opportunity Analysis

Research a specific opportunity — a listing, product, policy, investment, or offering — then assess its attractiveness, risks, and fit for clients already in your CRM.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                   OPPORTUNITY ANALYSIS                           │
├─────────────────────────────────────────────────────────────────┤
│  ALWAYS (works standalone)                                       │
│  ✓ Web search: opportunity details, comparables, market context │
│  ✓ CRM: match against existing clients and their preferences    │
│  ✓ Analysis: attractiveness, risks, pricing context             │
│  ✓ Client matching: who in CRM might care and why               │
│  ✓ Output: structured analysis with recommendation              │
└─────────────────────────────────────────────────────────────────┘
```

---

## What I Need From You

**Option 1: Share a link or description**
Paste a URL, forward a listing, or describe the opportunity. I'll research it.

**Option 2: Ask about something specific**
"What do you think of the new launch at Bishan?" or "Is this whole life policy competitive?"

**Option 3: Compare options**
"Compare these two options for my client John." I'll analyze both and recommend.

---

## Output Format

```markdown
# Opportunity Analysis: [Name/Description]

**Analyzed:** [Date]
**Sources:** Web Research, CRM

---

## Quick Take

[2-3 sentences: What it is, whether it looks attractive, who it might fit]

---

## Overview

| Field | Value |
|-------|-------|
| **Name** | [Opportunity name] |
| **Type** | [Listing / Product / Policy / Investment] |
| **Price / Terms** | [Key pricing info] |
| **Location / Provider** | [If relevant] |
| **Key Features** | [Highlights] |

---

## What Looks Attractive
- [Strength 1 with evidence]
- [Strength 2 with evidence]

## What Looks Risky or Uncertain
- [Risk 1 with evidence]
- [Risk 2 with evidence]

---

## Market Context

**Pricing vs Comparables:**
| Comparable | Price | Difference | Notes |
|-----------|-------|------------|-------|
| [Comp 1] | [Price] | [+/-X%] | [Key difference] |
| [Comp 2] | [Price] | [+/-X%] | [Key difference] |

**Market Signals:**
- [Relevant trend or data point]
- [Recent development that affects this opportunity]

---

## Qualification Signals

### Positive Signals
- ✅ [Signal and evidence]
- ✅ [Signal and evidence]

### Potential Concerns
- ⚠️ [Concern and what to watch for]

### Unknown (Verify Before Proceeding)
- ❓ [Gap in understanding that could change the assessment]

---

## CRM Client Matches

| Client | Deal/Stage | Why They Might Fit | Action |
|--------|-----------|-------------------|--------|
| [Name] | [Deal info] | [Match reason] | [Recommended next step] |
| [Name] | [Deal info] | [Match reason] | [Recommended next step] |

---

## Recommended Approach

**Best Fit For:** [Client name or profile, and why]

**Opening Angle:** [What to lead with when presenting this opportunity]

**Questions to Ask First:**
1. [Question to verify fit before investing more time]
2. [Question about client's constraints or preferences]
3. [Question about timeline or urgency]

---

## Sources
- [Source 1](URL)
- [Source 2](URL)
```

---

## Execution Flow

### Step 1: Research the Opportunity

```
1. Web search for opportunity details
   - "[Opportunity name]" — official listing/product page
   - "[Opportunity name] review" — independent assessments
   - "[Opportunity name] price" — pricing verification

2. Web search for comparables
   - "[Similar offerings] in [area/category]" — competitive context
   - "[Market/segment] trends" — macro context

3. Web search for risks
   - "[Opportunity name] issues OR concerns" — red flags
   - Regulatory or policy context if relevant
```

### Step 2: Match Against CRM

```
1. search_crm → Contacts with matching preferences
   - Filter by: budget range, stated needs, preferences
   - Check: deal stage (active leads most relevant)

2. search_crm → Deals that could benefit
   - Active deals where this opportunity fills a gap
   - Stale deals this could re-engage
```

### Step 3: Analyze and Synthesize

```
1. Assess attractiveness vs risks
2. Compare pricing to market context
3. Identify qualification signals (positive, concerns, unknown)
4. Match to CRM clients with reasoning
5. Generate recommended approach
6. Output formatted analysis
```

---

## Analysis Variations

### Single Opportunity
Focus on: Deep analysis of one opportunity with market context

### Comparison (Two or More)
Focus on: Side-by-side comparison with pros/cons and recommendation per client

### Client-First ("What's good for John?")
Focus on: Search for opportunities matching a specific client's criteria

---

## Gotchas

- Separate facts from market interpretation. Label which is which.
- Be explicit when comparable evidence is thin or noisy.
- Do not oversell an opportunity just because the marketing copy is strong.
- If details are ambiguous or incomplete, say so before making a confident judgment.
- If no CRM clients match, say that clearly rather than forcing a weak match.

---

## Tips

1. **Share the link** — A URL gives me much more to work with than a name
2. **Name the client** — "Is this good for John?" lets me tailor the analysis
3. **State your angle** — "I'm thinking of presenting this to buyers" helps me focus
4. **Ask for comparisons** — "Compare this to [other option]" is more useful than a standalone review

---

## Related Skills

- **draft-outreach** — Draft a message to matched clients about this opportunity
- **pipeline-review** — See how this fits into the broader deal pipeline
- **market-briefing** — Broader market context beyond a single opportunity
