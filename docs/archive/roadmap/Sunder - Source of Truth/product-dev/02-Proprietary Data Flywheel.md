# Proprietary Data Flywheel

> "Claude can generate X. It cannot tell you whether X will work." — The moat is outcome-attributed data that compounds.

Inspired by Michelle Lim's ["How Apps Don't Get Killed by Claude"](references/Fintool/michellelim-how-apps-dont-get-killed-by-claude-FULL.md) and Fintool articles (all in `references/Fintool/`).

---

## Three Tiers

### Tier 1: Per-user compounding memory (built)

SOUL.md, USER.md, MEMORY.md per client. Agent gets better for *this* user over time. Already the primary switching cost (MEM-07).

### Tier 2: Agent self-improvement from outcomes (next)

The missing "autonomous improvement" loop. The agent doesn't just remember — it learns from what happens:

- Agent sends follow-up → contact replies → agent notes "direct, short messages work for this contact"
- User rejects/edits agent draft → agent observes the delta, adjusts future tone
- Deal stage advances → agent notes which actions preceded it

Data asset: per-user model of "what works" that deepens with every interaction.

### Tier 3: Cross-user market intelligence (needs scale)

Aggregate anonymized patterns across all users. "What works" at the market level. Requires meaningful adoption first.

---

## Vertical Selection for Tier 3

Best verticals have: high interaction volume, clear outcome signals, fast feedback loops, low competitive tension between users.

| Vertical | Volume | Outcome signal | Feedback speed | Competitive tension | Notes |
|----------|--------|---------------|----------------|-------------------|-------|
| **Recruitment** | High (hundreds of outreaches/week) | Reply rate, interview, placement | Days to weeks | Low (different roles/regions) | Closest to HubSpot email intelligence pattern |
| **Medical/dental clinics** | High (daily patient comms) | Show rate, rebooking, treatment acceptance | Days | Low (different neighborhoods) | Underrated. Fast loops, clear signal |
| **Property management** | High (daily tenant comms) | Resolution time, tenant retention, occupancy | Days to weeks | Low (managers aren't competing) | Flips RE sales dynamic |
| **Insurance brokers** | Medium | Policy sold, renewal rate | Weeks | Low-medium | "Month 10 review call → 40% more renewals" |
| **Tuition/education centers** | High (student/parent comms) | Enrollment, retention, referral | Weeks | Moderate (hyperlocal) | Clear parent communication patterns |
| **B2B SaaS sales** | Very high | Reply, meeting, deal closed | Days to weeks | High | Too crowded (Outreach, Salesloft, Apollo) |
| **Financial advisors** | Medium | AUM growth, retention | Months | Medium | Slow loops, heavy regulation |

**Strong fits:** Recruitment, medical/dental, property management.
**Weak fits:** B2B SaaS (crowded), financial advisors (slow, regulated).

---

## Current Decision

Tier 1+2 for v1 (vertical-agnostic). Tier 3 vertical TBD — design data capture to support it later, don't need to pick yet.

---

*Last updated: 2026-03-16*
