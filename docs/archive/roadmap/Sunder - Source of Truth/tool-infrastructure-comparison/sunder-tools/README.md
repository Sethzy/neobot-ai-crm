# Sunder AI Agent Tools (ARCHIVED — Phase 1 snapshot)

> **STALE:** These docs describe the pre-consolidation 14-tool layout from Phase 1.
> The per-entity CRM tools (`search_contacts`, `create_deal`, etc.) no longer exist.
> For the current tool inventory (35 tools), see:
> **`docs/product/tooling/agent-tools-inventory-v2.md`**

This folder contains explicit, labeled Markdown docs for all 14 Sunder AI-agent tools as of Phase 1.

- Tool registry: `00-tool-registry.md`
- Runner entrypoint: `00-runner-entrypoint.md`
- System prompt: `00-system-prompt.md`
- Shared utilities: `00-shared-utilities.md`
- CRM tools: `01–10`
- Storage tools: `11–12`
- Web tools: `13–14`

## CRM Tools (10)

| # | Tool | Type | Source |
|---|------|------|--------|
| 1 | [search_contacts](01-search_contacts.md) | Read | `src/lib/runner/tools/crm/contacts.ts` |
| 2 | [create_contact](02-create_contact.md) | Write | `src/lib/runner/tools/crm/contacts.ts` |
| 3 | [update_contact](03-update_contact.md) | Write | `src/lib/runner/tools/crm/contacts.ts` |
| 4 | [search_deals](04-search_deals.md) | Read | `src/lib/runner/tools/crm/deals.ts` |
| 5 | [create_deal](05-create_deal.md) | Write | `src/lib/runner/tools/crm/deals.ts` |
| 6 | [update_deal](06-update_deal.md) | Write | `src/lib/runner/tools/crm/deals.ts` |
| 7 | [search_tasks](07-search_tasks.md) | Read | `src/lib/runner/tools/crm/tasks.ts` |
| 8 | [create_task](08-create_task.md) | Write | `src/lib/runner/tools/crm/tasks.ts` |
| 9 | [update_task](09-update_task.md) | Write | `src/lib/runner/tools/crm/tasks.ts` |
| 10 | [create_interaction](10-create_interaction.md) | Write | `src/lib/runner/tools/crm/interactions.ts` |

## Storage Tools (2)

| # | Tool | Type | Source |
|---|------|------|--------|
| 11 | [read_file](11-read_file.md) | Read | `src/lib/runner/tools/storage/index.ts` |
| 12 | [write_file](12-write_file.md) | Write | `src/lib/runner/tools/storage/index.ts` |

## Web Tools (2)

| # | Tool | Type | Source |
|---|------|------|--------|
| 13 | [web_search](13-web_search.md) | Read | `src/lib/runner/tools/web/search.ts` |
| 14 | [web_scrape](14-web_scrape.md) | Read | `src/lib/runner/tools/web/scrape.ts` |

## Architecture

- **SDK:** Vercel AI SDK v6 `tool()` function
- **Schema validation:** Zod 4
- **Factory pattern:** Each category exports a factory that closes over `(supabase, clientId)` for tenant isolation
- **Write gating:** CRM write tools controlled by `allowWriteTools` flag (env: `RUNNER_ENABLE_CRM_WRITE_TOOLS=1`)
- **RLS double-lock:** Supabase RLS enforces `client_id` match on all tables; tools also inject `client_id` via closure
- **Result shape:** `{ success: true, [entity] } | { success: false, error: string }`
- **Max steps:** 8 (via AI SDK `stopWhen: stepCountIs(8)`)
- **Model:** Gemini Flash 3 via Vercel AI Gateway (Tier 1)
