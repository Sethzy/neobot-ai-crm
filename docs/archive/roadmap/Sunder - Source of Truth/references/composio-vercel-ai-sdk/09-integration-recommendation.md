# Integration Recommendation: Composio + Sunder

> Author: Claude Code
> Date: 2026-03-07
> Context: PR 25 (Composio connections + OAuth) planning

---

## TL;DR

**Use the Direct pattern (`composio.tools.get()`) with `@composio/vercel` VercelProvider.** Don't use the Session/MCP pattern. Keep our own `connections` table as a lightweight sync/tracking layer. Let Composio handle OAuth token management; let our DB handle what the agent can see in system-reminder.

---

## Decision: Direct vs Session Pattern

### Why Direct (`composio.tools.get()`), not Session (`composio.create()`)

| Factor | Direct | Session |
|--------|--------|---------|
| **Our runner architecture** | Fits perfectly — tools are objects spread into `streamText()` | Requires MCP client setup per run, extra latency |
| **Tool control** | We decide exactly which tools to load per run | Session meta-tools add 5 tools the agent may misuse |
| **OAuth flow** | We control via our callback route + DB tracking | In-chat auth via meta-tool — not how Sunder works |
| **System-reminder** | We show `<active_connections>` from our DB | No integration with our system-reminder |
| **Safety model** | We gate external-facing tools via approval | Meta-tools bypass our approval model |
| **Dependency** | `@composio/core` + `@composio/vercel` | Also needs `@ai-sdk/mcp` for MCP client |
| **Complexity** | Simple, matches existing tool factory pattern | Session lifecycle management, MCP transport |

**Key reasons:**
1. Our runner already has a well-defined tool assembly pattern (`createRunnerTools()`). Composio tools should be one more category, not a replacement.
2. Session meta-tools include `COMPOSIO_REMOTE_WORKBENCH` (Python sandbox) and `COMPOSIO_REMOTE_BASH_TOOL` — we absolutely don't want these in Sunder's agent.
3. `COMPOSIO_MANAGE_CONNECTIONS` does in-chat OAuth, but Sunder should handle this via the settings/connections page with user approval, not ad-hoc in chat.
4. Our system-reminder needs to show connection status from our DB, not from Composio's session state.

---

## Architecture: How It Fits

### Current Runner Flow

```
createRunnerTools() → { ...crmTools, ...storageTools, ...webTools, ...utilityTools, ...triggerTools }
                                    ↓
streamText({ tools, system, messages })
```

### Proposed Runner Flow

```
createRunnerTools() → { ...crmTools, ...storageTools, ...webTools, ...utilityTools, ...triggerTools }
loadComposioTools() → { ...composioTools }  // Gmail, Calendar, etc.
                                    ↓
streamText({ tools: { ...runnerTools, ...composioTools }, system, messages })
```

### New Module: `src/lib/composio/`

```
src/lib/composio/
├── client.ts           # Composio singleton + VercelProvider initialization
├── tools.ts            # loadComposioTools(userId, activeToolkits) → ToolSet
└── __tests__/
    ├── client.test.ts
    └── tools.test.ts
```

### Connection Management: Our DB + Composio API

```
connections table (our DB)     ←→     Composio connectedAccounts (their API)
─────────────────────────             ───────────────────────────────────
id, client_id, provider,              OAuth token storage, refresh,
composio_connected_account_id,        credential encryption
status, toolkit_slug,
enabled_tools (jsonb),
created_at, updated_at
```

- **Our DB**: Tracks which connections exist, for system-reminder and RLS
- **Composio API**: Manages actual OAuth tokens, refresh, credentials
- **Sync**: OAuth callback route writes to both; connection tools read from both

---

## Recommended Implementation

### 1. Dependencies

```bash
pnpm add @composio/core @composio/vercel
```

No `@ai-sdk/mcp` needed (we use direct pattern, not session/MCP).

### 2. Environment Variables

```env
COMPOSIO_API_KEY=sk-...          # From Composio dashboard
```

Auth configs (one per toolkit) are created in Composio dashboard, not in code.

### 3. Composio Client Singleton

```typescript
// src/lib/composio/client.ts
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";

let _composio: Composio<VercelProvider> | null = null;

export function getComposio(): Composio<VercelProvider> {
  if (!_composio) {
    _composio = new Composio({
      apiKey: process.env.COMPOSIO_API_KEY,
      provider: new VercelProvider(),
      allowTracking: false,
    });
  }
  return _composio;
}
```

### 4. Loading Tools for a Run

```typescript
// src/lib/composio/tools.ts
import type { ToolSet } from "ai";
import { getComposio } from "./client";

/**
 * Loads Composio tools for active connections.
 * Returns empty object if no connections or COMPOSIO_API_KEY not set.
 */
export async function loadComposioTools(
  composioUserId: string,
  activeToolkits: string[],
): Promise<ToolSet> {
  if (!process.env.COMPOSIO_API_KEY || activeToolkits.length === 0) {
    return {};
  }

  const composio = getComposio();
  return await composio.tools.get(composioUserId, {
    toolkits: activeToolkits,
  });
}
```

### 5. Wiring into Runner

```typescript
// In createRunnerTools() or runAgent()
const activeToolkits = await getActiveToolkits(supabase, clientId);
const composioTools = await loadComposioTools(clientId, activeToolkits);

const streamResult = streamText({
  model: gateway(modelId),
  system,
  messages,
  tools: { ...runnerTools, ...composioTools },
  // ...
});
```

### 6. OAuth Flow

```
User clicks "Connect Gmail" in settings
→ Frontend calls POST /api/connections/initiate { toolkit: "gmail" }
→ Backend calls composio.toolkits.authorize(clientId, "gmail")
→ Returns redirectUrl to frontend
→ User completes OAuth in popup/redirect
→ Composio calls our callback URL
→ Callback route:
  1. composio.connectedAccounts.get(id) → verify ACTIVE
  2. INSERT into connections table (client_id, toolkit_slug, composio_account_id, status)
  3. Redirect to success page
```

### 7. Connection-First Behavior (CONN-03)

In system prompt instructions:
```
Before using any external service tool, check <active_connections> in your context.
If the needed connection doesn't exist, tell the user to connect it in Settings.
Do NOT attempt to use tools for unconnected services.
```

### 8. System-Reminder Slot

```xml
<active_connections>
  gmail (connected), google_calendar (connected)
</active_connections>
```

Populated from our `connections` table, not from Composio API (faster, no external call in hot path).

---

## What Changes vs Original Tasklist

### Removed (7 custom connection tools → 0)
- ~~list-connections tool~~ → Composio meta-tool handles discovery internally; system-reminder shows connected services
- ~~get-connection-details tool~~ → Not needed; agent doesn't need connection internals
- ~~search-integrations tool~~ → Not needed; we control which toolkits are available
- ~~create-connection tool~~ → OAuth is user-initiated from settings, not agent-initiated
- ~~manage-activated-tools tool~~ → We load tools based on DB state, not agent-managed
- ~~reauthorize-connection tool~~ → Composio handles token refresh automatically
- ~~delete-connection tool~~ → User-managed from settings page

### Kept (simplified)
- `connections` migration (our tracking table)
- Zod schemas for connections table
- CRUD queries for connections table
- Composio client wrapper (`src/lib/composio/client.ts`)
- OAuth callback API route
- System-reminder `<active_connections>` slot
- System prompt connection instructions
- Tool loading in runner (`loadComposioTools()`)

### Added
- `@composio/core` + `@composio/vercel` dependencies
- `loadComposioTools()` function
- Settings page "Connect" buttons (deferred to PR 26+ if not in PR 25 scope)

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Composio API down → tools unavailable | Graceful fallback: if `loadComposioTools()` fails, run continues without external tools |
| Composio SDK version drift | Pin `@composio/core` version; use `toolkitVersions` for toolkit pinning |
| Tool schema changes break agent | Version pinning per toolkit |
| OAuth tokens expire | Composio handles refresh automatically |
| Composio userId mapping | Use our `clientId` as Composio's `userId` (1:1 mapping) |

---

## Composio userId Strategy

Use Sunder's `client_id` (UUID) as Composio's `userId`. This gives us:
- 1:1 mapping between Sunder clients and Composio users
- Composio automatically scopes connections per user
- No extra mapping table needed

---

## Summary

The Direct pattern with `@composio/vercel` is the right choice because:
1. **Minimal drift** from Composio's official examples
2. **Fits our existing architecture** (tool factory pattern, `streamText()`)
3. **Maintains our safety model** (no rogue meta-tools)
4. **Simple** — ~100 lines of new code for the integration layer
5. **Production-ready** — version pinning, graceful fallback, no MCP complexity
