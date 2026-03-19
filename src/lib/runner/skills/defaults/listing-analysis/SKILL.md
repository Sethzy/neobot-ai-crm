---
name: listing-analysis
description: Analyze a property listing with market context, pricing signals, and likely fit for people already in the CRM.
---

# Listing Analysis

Use this skill when the user asks whether a listing looks good, wants a fast property read, or needs help deciding which clients might match a listing.

## Workflow

1. Use `web_search` to gather the listing details, project context, nearby comparables, district signals, and any policy or supply context that materially affects the analysis.
2. Use `search_crm` to identify existing clients whose preferences, stage, and budget may fit the property.
3. Build a concise analysis that covers:
   - what the listing appears to be
   - what looks attractive
   - what looks risky or uncertain
   - how the pricing feels relative to nearby context
   - which CRM contacts might care and why
4. If the user wants a saved brief or reusable note, store it with `write_file`.

## Gotchas

- Separate listing facts from market interpretation.
- Be explicit when comparable evidence is thin or noisy.
- Do not oversell a listing just because the marketing copy is strong.
- If the address or project name is ambiguous, say so before making a confident judgment.

