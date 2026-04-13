# Native MCP Connections — Replace Composio with Managed Agents MCP

**Workstream:** ws-2 in `docs/product/plans/2026-04-13-sunder-next.json`
**Status:** pending (blocked on ws-1 managed agents official pattern)
**Goal:** Replace Composio middleware with native MCP server integrations. User completes OAuth → token stored in Anthropic vault → agent authenticates automatically when calling MCP tools. No middleware hop, no `execute_composio_tool` wrapper, real tool schemas.

---

## Context

### Current state (Composio)

```
User clicks "Connect Gmail"
  → /api/connections/initiate → Composio OAuth flow (Composio is the OAuth client)
  → Composio stores tokens
  → Agent calls execute_composio_tool(app: "gmail", action: "SEND_EMAIL", input: {...})
  → Our server calls Composio SDK → Composio calls Gmail API
  → Result returns through two middleware hops
```

**What this costs us:**
- Composio SDK dependency (`@composio/core`, `@composio/vercel`)
- ~7 custom tools on the agent: `list_connections`, `search_integrations`, `get_integration_capabilities`, `get_connection_details`, `manage_activated_tools`, `execute_composio_tool`, `delete_connection`
- Generic `execute_composio_tool` wrapper → agent sees opaque action slugs, not real tool schemas
- Composio rate limits, uptime dependency, API cost
- 170+ lines of tool loading code in `activated-tools.ts`

### Target state (native MCP)

```
User clicks "Connect Gmail"
  → Our OAuth flow → Google OAuth consent screen (we are the OAuth client)
  → We store access_token + refresh_token in Anthropic vault
  → Agent calls gmail_send_email(to, subject, body) directly via MCP
  → Anthropic's container calls Gmail MCP server with auto-refreshed token
  → Result returns directly
```

**What this gives us:**
- Real tool schemas — agent sees `gmail_send_email(to, subject, body)` not `execute_composio_tool({...})`
- One less middleware hop (no Composio in the middle)
- Token auto-refresh handled by Anthropic vaults
- No Composio dependency for migrated integrations
- ~7 fewer custom tools on the agent

### Migration strategy: hybrid

Start with Google suite (Gmail, Calendar, Drive) — they have mature hosted MCP servers and are our most-used integrations. Keep Composio as fallback for everything else. Deprecate per-integration as MCP servers become available.

---

## Known MCP servers

| Service | MCP Server URL | Auth type | Status |
|---|---|---|---|
| Gmail | `https://mcp.google.com/gmail/mcp` (TBC) | OAuth 2.0 | Verify URL |
| Google Calendar | `https://mcp.google.com/calendar/mcp` (TBC) | OAuth 2.0 | Verify URL |
| Google Drive | `https://mcp.google.com/drive/mcp` (TBC) | OAuth 2.0 | Verify URL |
| GitHub | `https://api.githubcopilot.com/mcp/` | OAuth 2.0 | Confirmed |
| Notion | `https://mcp.notion.com/mcp` | OAuth 2.0 | Verify URL |
| Linear | `https://mcp.linear.app/mcp` | OAuth 2.0 | Verify URL |
| Slack | TBD | OAuth 2.0 | Research needed |
| Attio | TBD | OAuth 2.0 | Research needed |

**First task:** verify actual MCP server URLs for Google suite. The URLs above are educated guesses — need to confirm from provider docs.

---

## Phase 1: Vault Infrastructure + OAuth Flow

**Goal:** Generic infrastructure for any MCP integration. No provider-specific code yet.

### Task 1.1: Research — verify MCP server URLs and auth requirements

- [ ] Verify Google Gmail MCP server URL and OAuth scope requirements
- [ ] Verify Google Calendar MCP server URL and OAuth scope requirements
- [ ] Verify Google Drive MCP server URL and OAuth scope requirements
- [ ] Document the exact OAuth scopes each MCP server needs
- [ ] Document the credential shape each vault entry needs (access_token, refresh_token, token_endpoint, client_id)
- [ ] Check if Google offers a single MCP server for all Workspace apps or separate per-service

**Output:** Update the "Known MCP servers" table above with confirmed URLs and auth details.

### Task 1.2: Google OAuth app registration

- [ ] Create a Google Cloud project for Sunder (or use existing)
- [ ] Register OAuth 2.0 credentials (client_id + client_secret)
- [ ] Configure OAuth consent screen (app name, scopes, redirect URI)
- [ ] Request the scopes needed for Gmail, Calendar, Drive
- [ ] Store client_id and client_secret in Vercel environment variables
- [ ] Test the OAuth flow manually (get an access_token + refresh_token)

**Env vars:** `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`

### Task 1.3: Anthropic vault management layer

New module: `src/lib/managed-agents/vaults.ts`

- [ ] `getOrCreateVaultForClient(clientId)` — one vault per client (maps to Composio's per-user model)
- [ ] `upsertMcpCredential(vaultId, mcpServerUrl, oauthTokens)` — create or update a credential in the vault
- [ ] `deleteMcpCredential(vaultId, credentialId)` — remove a credential
- [ ] `listMcpCredentials(vaultId)` — list credentials (metadata only — secrets are write-only)
- [ ] Store `vault_id` on the `clients` table (new nullable column)
- [ ] Migration SQL: `ALTER TABLE clients ADD COLUMN vault_id text;`

### Task 1.4: Generic OAuth callback for MCP providers

New route: `app/api/mcp-connections/callback/route.ts`

- [ ] Accept OAuth authorization code from provider redirect
- [ ] Exchange code for access_token + refresh_token via provider's token endpoint
- [ ] Store tokens in Anthropic vault via `upsertMcpCredential()`
- [ ] Persist connection record in `connections` table (reuse existing table, new `provider_type: 'mcp'` column to distinguish from Composio)
- [ ] Redirect user back to settings/chat with success indicator

New route: `app/api/mcp-connections/initiate/route.ts`

- [ ] Accept `provider` param (e.g., "gmail", "google-calendar", "google-drive")
- [ ] Look up provider config (OAuth authorize URL, scopes, client_id)
- [ ] Build OAuth authorization URL with state parameter (client_id + provider + redirect)
- [ ] Return redirect URL to frontend

Provider config registry: `src/lib/mcp-connections/providers.ts`

- [ ] Type-safe provider config: `{ id, name, mcpServerUrl, oauthAuthorizeUrl, oauthTokenUrl, scopes, icon }`
- [ ] Start with Google Gmail, Calendar, Drive entries
- [ ] Extensible — adding a new provider = adding an entry to the registry

### Task 1.5: Wire vault_ids into session creation

- [ ] In session creation code, look up the client's `vault_id`
- [ ] Pass `vault_ids: [vaultId]` to `sessions.create()` (skip if no vault)
- [ ] Ensure environment networking allows MCP server domains (if using restricted networking)

---

## Phase 2: First Integration — Gmail

**Goal:** Gmail works end-to-end via native MCP. Proves the full flow.

### Task 2.1: Update agent definition with Gmail MCP server

- [ ] Add Gmail MCP server to agent's `mcp_servers` array in `create-agent.ts`:
  ```ts
  mcp_servers: [
    { type: "url", name: "gmail", url: "<verified-gmail-mcp-url>" }
  ]
  ```
- [ ] Add `mcp_toolset` to agent's tools:
  ```ts
  { type: "mcp_toolset", mcp_server_name: "gmail" }
  ```
- [ ] Decide on permission policy: `always_ask` (default) is correct for email — user should approve sends

### Task 2.2: Connect Gmail button in settings

- [ ] Add "Connect Gmail" card to connections settings page
- [ ] On click: `POST /api/mcp-connections/initiate?provider=gmail`
- [ ] Handle OAuth redirect → callback → success state
- [ ] Show connected state with account email
- [ ] Disconnect button: removes vault credential + updates connection record

### Task 2.3: End-to-end test

- [ ] Connect Gmail via settings
- [ ] In chat: "Send an email to test@example.com saying hello"
- [ ] Agent should use Gmail MCP tools directly (not execute_composio_tool)
- [ ] Verify tool approval flow works (always_ask → user approves → email sent)
- [ ] Verify the agent sees real Gmail tool schemas (search, send, read, etc.)
- [ ] Disconnect Gmail, verify agent no longer has Gmail tools

---

## Phase 3: Remaining Google Suite

**Goal:** Google Calendar and Google Drive work via native MCP.

### Task 3.1: Google Calendar MCP

- [ ] Add Calendar MCP server to agent definition
- [ ] Add `mcp_toolset` entry
- [ ] "Connect Google Calendar" card in settings
- [ ] End-to-end test: "What's on my calendar tomorrow?"

### Task 3.2: Google Drive MCP

- [ ] Add Drive MCP server to agent definition
- [ ] Add `mcp_toolset` entry
- [ ] "Connect Google Drive" card in settings
- [ ] End-to-end test: "Find the Q4 report in my Drive"
- [ ] Verify this replaces the Composio googledrive/googledocs/googlesheets toolkits from PR 62

---

## Phase 4: Composio Deprecation (per integration)

**Goal:** For each integration migrated to native MCP, remove the Composio path.

### Task 4.1: Dual-mode connection UI

- [ ] Settings page shows both MCP-native and Composio connections
- [ ] MCP connections show "(Native)" badge
- [ ] Composio connections show "(Legacy)" badge with "Upgrade" prompt
- [ ] When user upgrades: create MCP connection → verify it works → delete Composio connection

### Task 4.2: Remove Composio Gmail/Calendar/Drive toolkits

- [ ] Stop loading Composio tools for migrated integrations
- [ ] Update `activated-tools.ts` to skip migrated toolkit slugs
- [ ] Remove Composio auth configs for migrated services
- [ ] Update system reminder to reference MCP connections instead of Composio connections

### Task 4.3: Clean up connection management tools

Once ALL integrations a user might need are on native MCP:

- [ ] Remove `execute_composio_tool` custom tool
- [ ] Remove `search_integrations` custom tool
- [ ] Remove `get_integration_capabilities` custom tool
- [ ] Remove `list_composio_tools` custom tool
- [ ] Simplify `list_connections` to only show MCP connections
- [ ] Simplify `get_connection_details` for MCP connections
- [ ] Remove `manage_activated_tools_for_connections` (MCP tools are all-or-nothing per server)
- [ ] Remove `@composio/core` and `@composio/vercel` from package.json

**Note:** This task only happens once we're confident Composio is fully replaced. Keep it as a long-tail cleanup.

---

## Key files to modify

| File | Change |
|---|---|
| `src/lib/managed-agents/tools/declarations.ts` | Add MCP server declarations to agent config |
| `scripts/managed-agents/create-agent.ts` | Add `mcp_servers` + `mcp_toolset` to agent definition |
| `src/lib/managed-agents/session-runner.ts` | Pass `vault_ids` on session create |
| `src/lib/managed-agents/session-kickoff.ts` | Pass `vault_ids` on session create |
| `app/api/mcp-connections/initiate/route.ts` | New — OAuth initiation |
| `app/api/mcp-connections/callback/route.ts` | New — OAuth callback |
| `src/lib/mcp-connections/providers.ts` | New — provider registry |
| `src/lib/managed-agents/vaults.ts` | New — vault management |
| `src/lib/composio/activated-tools.ts` | Skip migrated integrations |
| `src/components/settings/connections-*.tsx` | Dual-mode UI |

---

## Open questions

1. **Google MCP server URLs** — Are they actually at `mcp.google.com`? Need to verify. Claude.ai has Gmail/Calendar MCP but those might use different server URLs than what Managed Agents can connect to.
2. **Single vault or vault per provider?** — One vault per client seems right (matches Composio's per-user model). Multiple credentials in one vault.
3. **MCP tool permission policy** — `always_ask` for sends/deletes, `always_allow` for reads? Or just `always_ask` for everything to start?
4. **Composio create_connection tool** — The agent currently discovers and connects new integrations via chat. With native MCP, do we keep this? Or require connections to be set up in settings only?
5. **Agent-side tool discovery** — With Composio, the agent can search 3000+ integrations. With native MCP, the agent only has what's declared on the agent definition. Is this a regression or a simplification?
