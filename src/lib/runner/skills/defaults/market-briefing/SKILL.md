---
name: market-briefing
description: Create a concise market briefing with recent pricing signals, launches, policy changes, and implications for active work.
---

# Market Briefing

Use this skill when the user asks for a market update, district briefing, competitor snapshot, or wants help understanding what has changed recently.

## Workflow

1. Use `web_search` to gather recent and relevant market information. Focus on what is new or decision-changing: pricing shifts, launches, supply, policy updates, financing conditions, and notable local developments.
2. Use `search_crm` when helpful to connect the market update back to live deals, clients, or segments already in play.
3. Deliver the briefing in three layers:
   - what changed
   - why it matters
   - who or what in the current CRM pipeline is likely affected
4. Keep the summary crisp. Lead with the few changes that actually alter advice or timing.
5. If the user wants a saved briefing or reusable memo, use `write_file`.

## Gotchas

- Prioritize freshness. Old market commentary is rarely useful if newer signals exist.
- Do not present thin search evidence as a clear market trend.
- Separate observed facts from interpretation.
- If the update is mixed or noisy, say that plainly instead of forcing a strong narrative.

