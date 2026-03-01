# Integrations: Static vs Pipedream

Tasklet's dual integration system — in-house static integrations for top services, Pipedream proxy for the long tail.

## Files

- `00-pipedream-integration-architecture-trace.md` — Architecture analysis: routing, auth flows, execution paths, credential storage, Sunder/Composio mapping
- `01-static-vs-pipedream-verbatim-comparison.md` — Verbatim API data: integration metadata, tool naming, description quality, argument quality, `builtBy` taxonomy, `additionalContext` field, tool counts

## Key Findings

1. **Two backends:** `static:*` (in-house, ~20-30 services, GREAT quality) vs `pipedream:*` (3000+ services, UNKNOWN quality)
2. **Four builder types:** `tasklet`, `official-mcp`, `direct-api-wrapper`, `pipedream`
3. **Static descriptions are LLM-optimized** — behavioral hints, guard rails, inline examples, XML strategy blocks
4. **Pipedream descriptions are API doc copy-paste** — external links, template syntax, no behavioral guidance
5. **Sunder's Composio = Tasklet's Pipedream** — same architectural position (long-tail proxy)
