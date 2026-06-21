# NeoBot Architecture

NeoBot is a Next.js app wrapped around an Anthropic Managed Agents runner. The
current runtime surface is intentionally small: routes and API handlers live in
`app/`, Managed Agent lifecycle code lives in `src/lib/managed-agents/`, and
domain helpers stay in focused `src/lib/*` modules.

## Canonical Runtime Surfaces

- `app/` - App Router pages and API routes. API entrypoints authenticate the
  user, resolve the active client, then delegate to domain libraries.
- `src/lib/managed-agents/` - Anthropic session lifecycle, SSE consumption,
  event translation, custom-tool dispatch, approvals, trigger finalization, and
  managed-agent cost helpers.
- `src/lib/runner/` - retained shared runner support and legacy-compatible
  helpers. Managed Agents and the `/skills` UI still import message utilities,
  run lifecycle helpers, safety gates, skill helpers, and selected tool helpers
  from this folder, so it is not dead code.
- `src/lib/crm/` - CRM schemas, navigation helpers, display helpers, and
  query/filter utilities.
- `src/lib/approvals/` - approval state, approval event persistence, and patch
  helpers.
- `src/lib/triggers/` - scheduled, webhook, RSS, and automation trigger
  helpers.
- `src/lib/channels/` - Telegram and outbound delivery formatting.
- `managed-agents/skills/` - runtime skill catalog uploaded to Anthropic.
- `scripts/managed-agents/` - Managed Agent registration, custom-skill upload,
  environment bootstrap, and migration utilities.

## Routes

`/customers/*` is the canonical CRM workspace:

- `/customers/people`
- `/customers/companies`
- `/customers/deals`

`/crm/*` routes are compatibility redirects kept for old links and tests. Do
not add new CRM product surfaces under `/crm/*`; add them under `/customers/*`
and keep redirects only where backward compatibility requires them.

## Agent Runtime

The main agent is registered by `scripts/managed-agents/create-agent.ts`. The
script bakes the system prompt, custom tool declarations, and managed skill
catalog into an Anthropic Managed Agent version. Runtime chat and automation
runs create sessions against that pinned version and handle local custom-tool
calls through `src/lib/managed-agents/dispatcher.ts`.

Dynamic per-run context is injected through the kickoff user message. The
runner should not rebuild the whole system prompt for every request.

## Legacy Names

NeoBot is the product name. Some `sunder-*` identifiers remain compatibility
names because changing them would touch persisted state, external integrations,
generated history, or backwards-compatible runtime contracts.

Allowed legacy names:

- `sunder-skill:*` Anthropic skill display titles and registry values.
- `sunder_web_search` and other published custom-tool aliases.
- CSS tokens/classes such as `--color-sunder-green` and `bg-sunder-green`.
- Persisted browser/local-storage keys such as `sunder:*`.
- Database migrations, historical fixtures, archived docs, and dated
  task/design/audit docs that preserve old implementation context.
- Webhook headers, deployment names, and older generated artifact paths.

New user-facing copy should say NeoBot unless it is documenting one of these
compatibility names.
