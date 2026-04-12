---
name: pipeline-review
description: "Reviews the user's pipeline, highlights risks, and recommends next actions. Use when the user asks for pipeline review, deal review, stage analysis, or where momentum is slipping."
---

# Pipeline Review

Analyze your pipeline health, prioritize deals, and get actionable recommendations for where to focus.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     PIPELINE REVIEW                              │
├─────────────────────────────────────────────────────────────────┤
│  ALWAYS (works standalone)                                       │
│  ✓ CRM: pull all active deals automatically                    │
│  ✓ Health check: flag stale, stuck, and at-risk deals          │
│  ✓ Prioritization: rank deals by impact and closability        │
│  ✓ Hygiene audit: missing data, overdue tasks, no next step    │
│  ✓ Weekly action plan: what to focus on                        │
├─────────────────────────────────────────────────────────────────┤
│  SUPERCHARGED (when you connect your tools)                      │
│  + Calendar: See upcoming meetings per deal                     │
│  + Email: Recent threads per deal, waiting on replies           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Connectors (Optional)

| Connector | What It Adds |
|-----------|--------------|
| **Calendar** | Upcoming meetings per deal, scheduling gaps |
| **Email** | Recent threads per deal, emails waiting on replies |

> **No connectors?** No problem. CRM has everything needed for a solid pipeline review.

---

## Output

```markdown
# Pipeline Review: [Date]

**Deals Analyzed:** [X]
**Total Pipeline Value:** [X]

---

## Pipeline Health Score: [X/100]

| Dimension | Score | Issue |
|-----------|-------|-------|
| **Stage Progression** | [X]/25 | [X] deals stuck in same stage 30+ days |
| **Activity Recency** | [X]/25 | [X] deals with no activity in 14+ days |
| **Close Date Accuracy** | [X]/25 | [X] deals with close date in past |
| **Task Coverage** | [X]/25 | [X] deals with no next step or open task |

---

## Priority Actions This Week

### 1. [Highest Priority Deal]
**Why:** [Reason — large, closing soon, at risk, etc.]
**Action:** [Specific next step]

### 2. [Second Priority]
**Why:** [Reason]
**Action:** [Next step]

### 3. [Third Priority]
**Why:** [Reason]
**Action:** [Next step]

---

## Deal Prioritization Matrix

### Close This Week (Focus Time Here)
| Deal | Value | Stage | Close Date | Next Action |
|------|-------|-------|------------|-------------|
| [Deal] | [Value] | [Stage] | [Date] | [Action] |

### Close This Month (Keep Warm)
| Deal | Value | Stage | Close Date | Status |
|------|-------|-------|------------|--------|
| [Deal] | [Value] | [Stage] | [Date] | [Status] |

### Nurture (Check-in Periodically)
| Deal | Value | Stage | Close Date | Status |
|------|-------|-------|------------|--------|
| [Deal] | [Value] | [Stage] | [Date] | [Status] |

---

## Risk Flags

### Stale Deals (No Activity 14+ Days)
| Deal | Value | Last Activity | Days Silent | Recommendation |
|------|-------|---------------|-------------|----------------|
| [Deal] | [Value] | [Date] | [X] | [Re-engage / Downgrade / Remove] |

### Stuck Deals (Same Stage 30+ Days)
| Deal | Value | Stage | Days in Stage | Recommendation |
|------|-------|-------|---------------|----------------|
| [Deal] | [Value] | [Stage] | [X] | [Push / Re-qualify / Close out] |

### Past Close Date
| Deal | Value | Close Date | Days Overdue | Recommendation |
|------|-------|------------|--------------|----------------|
| [Deal] | [Value] | [Date] | [X] | [Update date / Close lost] |

---

## Hygiene Issues

| Issue | Count | Deals | Action |
|-------|-------|-------|--------|
| Missing close date | [X] | [List] | Add realistic close dates |
| Missing next step | [X] | [List] | Define next action |
| No linked contact | [X] | [List] | Link primary contact |
| Overdue tasks | [X] | [List] | Complete or reschedule |

---

## Pipeline Shape

### By Stage
| Stage | # Deals | Value | % of Pipeline |
|-------|---------|-------|---------------|
| [Stage] | [X] | $[Value] | [X]% |

### By Close Month
| Month | # Deals | Value |
|-------|---------|-------|
| [Month] | [X] | $[Value] |

### By Deal Size
| Size | # Deals | Value |
|------|---------|-------|
| $500K+ | [X] | $[Value] |
| $200K-500K | [X] | $[Value] |
| $100K-200K | [X] | $[Value] |
| <$100K | [X] | $[Value] |

---

## Recommendations

### This Week
1. [ ] [Specific action for priority deal 1]
2. [ ] [Action for at-risk deal]
3. [ ] [Hygiene task]

### This Month
1. [ ] [Strategic action]
2. [ ] [Pipeline building if needed]

---

## Deals to Consider Removing

These deals may be dead weight:

| Deal | Value | Reason | Recommendation |
|------|-------|--------|----------------|
| [Deal] | [Value] | [No activity 60+ days, no response] | Mark closed-lost |
| [Deal] | [Value] | [Pushed 3+ times, no engagement] | Qualify out |
```

---

## Prioritization Framework

I'll rank deals using this framework:

| Factor | Weight | What I Look For |
|--------|--------|-----------------|
| **Close Date** | 30% | Deals closing soonest get priority |
| **Deal Size** | 25% | Bigger deals = more focus |
| **Stage** | 20% | Later stage = more focus |
| **Activity** | 15% | Active deals get prioritized |
| **Risk** | 10% | Lower risk = safer bet |

You can tell me to weight differently: "Focus on big deals over soon deals" or "I need quick wins, prioritize close dates."

---

## Execution Flow

### Step 1: Gather Pipeline Data

```
1. search_crm → All active deals
   - Pull: deal name, value, stage, close date, created date
   - Pull: last activity date, linked contacts, open tasks

2. search_crm → Recent interactions per deal
   - Last 5 interactions per deal
   - Flag: deals with no recent activity

3. Calendar (if connected) → Upcoming meetings per deal
4. Email (if connected) → Recent threads per deal
```

### Step 2: Score and Prioritize

```
Priority ranking:
1. Close date proximity — Deals closing soonest get priority
2. Deal value — Bigger deals = more focus
3. Stage — Later stage = more focus
4. Activity recency — Active deals get prioritized
5. Risk level — Lower risk = safer bet

Health scoring:
- Stage Progression: 25 pts if no deals stuck 30+ days
- Activity Recency: 25 pts if no deals silent 14+ days
- Close Date Accuracy: 25 pts if no past-due close dates
- Task Coverage: 25 pts if all deals have a next step
```

### Step 3: Generate Review

```
Assemble sections:
1. Pipeline Health Score — Always
2. Priority Actions — Top 3 deals needing attention
3. Deal Prioritization Matrix — Grouped by timeline
4. Risk Flags — Stale, stuck, past due
5. Hygiene Issues — Data quality problems
6. Pipeline Shape — Stage distribution
7. Recommendations — Actionable checklist
8. Deals to Remove — Dead weight candidates
```

---

## Gotchas

- Do not confuse a full pipeline inventory with a useful review. Focus on decisions and interventions.
- Call out data gaps clearly when a deal cannot be assessed confidently.
- Do not label something as stalled just because there was no interaction yesterday. Use 14-day threshold.
- If the pipeline looks healthy, say that. The review should not always sound alarmist.

---

## Tips

1. **Review weekly** — Pipeline health decays fast. Weekly reviews catch issues early.
2. **Kill dead deals** — Stale deals inflate your pipeline and distort your focus. Be ruthless.
3. **Every deal needs a next step** — If there's no clear next action, the deal isn't real.
4. **Close dates should mean something** — A close date is when you expect it to close, not when you hope.

---

## Related Skills

- **daily-briefing** — Quick daily view focused on today's priorities
- **opportunity-analysis** — Deep dive on a specific deal
- **call-prep** — Prep for a meeting with a priority deal
