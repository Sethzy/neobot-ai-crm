# Architectural Decision: Per-Entity Markdown Dossiers

**Status:** Under discussion  
**Date:** 2026-04-05  
**Context:** Karpathy's LLM Wiki pattern + evaluation of current CRM data model

## The Problem

Today, every time the agent needs to understand a contact, it runs 4-5 tool calls:

```
search_crm(contacts, "Sarah")           → contact record
search_crm(record_notes, contact_id=X)  → notes
search_crm(deals, contact_id=X)         → deals
search_crm(companies, company_id=X)     → company
search_crm(interactions, contact_id=X)  → interactions
```

Then it synthesizes everything from scratch. Every run. Same joins, same synthesis, same cost.

This works at current scale (notes are short, ~50 words each). It breaks when input volume grows — meeting transcripts (7k tokens each), email threads, research. At 5 transcripts per contact, the agent is blowing 35k+ tokens on raw data for one person, and has to choose what to load (i.e., it's doing bad RAG).

## The Proposal

Add a **per-entity markdown dossier layer** in Supabase Storage alongside the existing memory system:

```
{clientId}/contacts/sarah-chen.md
{clientId}/companies/blackrock.md
{clientId}/deals/blackrock-q3.md
```

The agent maintains these. After significant interactions, it reads the transcript + existing dossier, updates the dossier. Next run: one file read instead of 5 queries + re-synthesis.

## Postgres vs Markdown — When Each Wins

| Job | Winner | Why |
|-----|--------|-----|
| Filter, sort, aggregate, query across entities | Postgres | "Warm leads not contacted in 60 days" is one SQL query |
| Pipeline views, reporting, dashboards | Postgres | Aggregations require structured data |
| Discrete timestamped log entries | Postgres (`record_notes`) | "Sarah said X on March 3" — queryable, auditable |
| Pre-run context loading | Markdown dossier | One file read vs. 4-5 tool calls |
| Synthesized understanding | Markdown dossier | "Sarah uses formality as distance when uncertain" — no column holds this |
| Cross-entity narrative | Markdown dossier | "Deal stalling because Sarah (gatekeeper) is cautious and John lost internal capital" |

**They are complementary layers, not competing ones:**
- Postgres = structured spine (queryable, relational, reliable)
- Markdown = synthesis layer (narrative, nuanced, LLM-native)
- Notes feed the dossier. Postgres handles everything structural.

## When Postgres Alone Breaks

| Volume | Status |
|--------|--------|
| 50 contacts, notes only | Fine |
| 50 contacts + 1 transcript each | Getting expensive per query |
| 50 contacts + 5 transcripts each | Agent choosing what to load, missing things |
| 50 contacts + ongoing transcript/email feed | Broken — bad RAG over too much raw data |

The dossier solves this at **ingest time, not query time**. Synthesis cost is paid once when new data arrives. Every subsequent run is cheap.

## Tension With Existing Systems

**`record_notes` (just shipped):** Not competing. Notes are discrete log entries (good for querying, auditing). Dossiers are synthesized narratives (good for context loading). Notes are inputs; the dossier digests them.

**`MEMORY.md` / `memory/*.md`:** Current memory is per-practitioner, not per-entity. The dossier extends the storage layer into per-entity knowledge. Could live alongside or subsume parts of the memory system.

## Open Questions

1. **When to build the dossier?** After every interaction? End of each run? Background job?
2. **What triggers an update?** New note, new interaction, new transcript, deal stage change?
3. **Storage budget?** How many dossier files per client before Storage costs matter?
4. **Staleness?** How to handle dossiers that reference outdated CRM fields (deal closed, contact left company)?
5. **Does volume justify it yet?** With thin note history, the 5-call synthesis is fine. The dossier pays for itself once transcripts/emails flow in (Granola pattern, email integration).
6. **Bootstrapping?** When a new contact is created, does the dossier start empty or pre-populate from CRM fields?

## Related

- Karpathy's LLM Wiki pattern (raw sources → wiki → schema)
- Current memory system: `src/lib/memory/templates.ts`, `src/lib/memory/loader.ts`
- Record notes: `supabase/migrations/20260405000001_create_record_notes.sql`
- CRM search tool: `src/lib/runner/tools/crm/search.ts`

## Also in This Session

SOUL.md template was rewritten (`src/lib/memory/templates.ts`). More opinionated, less corporate. Separate concern but shipped in the same conversation.
