# Viktor Isolation & Multi-Tenancy

Source: Direct Q&A with Viktor instance (2026-03-16)

## Workspace Isolation

Each team gets its own **persistent Modal volume**.

- Viktor's entire `/work` directory (skills, files, logs, Slack mirrors, SDK) lives on that volume
- **Separate volume = separate filesystem = can't see other teams' data**
- Container is spun up **per-execution** and mounts that team's volume
- Container is ephemeral; volume is persistent

```
Team A volume (/work) ←→ Container (ephemeral, per-execution)
Team B volume (/work) ←→ Container (ephemeral, per-execution)
     ↑ completely isolated ↑
```

## Shared Context Across Team Members

- All team members share the **same Viktor instance**
- Same skills, same crons, same workspace
- If one person teaches Viktor something (creates a skill), **everyone benefits**
- Slack history is per-channel — Viktor sees what the team sees

### DM Privacy
- DMs are stored in **separate directories** per user
- Viktor is instructed **never to share DM content** in channels or with other users
- Privacy is enforced by **instruction** (system prompt), not by filesystem isolation

## Credential & Secret Management

### Per-Execution Token
- `TOOL_TOKEN` JWT in environment — **short-lived, per-execution**
- Used for authenticated requests to the tool gateway

### OAuth Tokens — Server-Side Only
- OAuth tokens for integrations are **NOT in the sandbox environment**
- Managed server-side by the tool gateway
- When Viktor calls an integration tool, the SDK makes an authenticated request to the **tool gateway**, which handles the OAuth token on the backend
- **Viktor never sees** Slack tokens, Google tokens, etc.

```
Viktor sandbox → tool SDK call → Tool Gateway (has OAuth tokens) → External API
                                      ↑
                           Viktor never sees these tokens
```

## Comparison to Tasklet Isolation

| Dimension | Tasklet | Viktor |
|---|---|---|
| Isolation unit | Per-agent (filesystem + SQL + triggers) | Per-workspace (Modal volume) |
| Multi-user | User owns multiple agents, each isolated | Team shares one workspace |
| Filesystem | `/agent/home/` (persistent) + sandbox (ephemeral) | `/work` (all persistent) |
| Credential handling | Not documented as separated | Server-side via tool gateway |
| Privacy between users | N/A (single user) | DM privacy by instruction, not filesystem |
| Shared resources | Connections (user-level, shared across agents) | Everything (skills, crons, files) |

## Comparison to Sunder Isolation

| Dimension | Sunder | Viktor |
|---|---|---|
| Isolation unit | Per-client (`clientId` + RLS) | Per-workspace (Modal volume) |
| Multi-tenant | Yes (many clients, one database) | No (one workspace per team) |
| Enforcement | Database-level (RLS policies) | Filesystem-level (separate volumes) |
| Credential handling | Supabase Auth + Composio OAuth (server-side) | Tool gateway (server-side) |
| Team sharing | Not applicable (solo agent per client) | Full sharing (skills, crons, files) |

## Key Insight

Viktor's isolation is **physical** (separate volumes) rather than **logical** (RLS policies on shared tables). This is simpler but doesn't scale to true multi-tenancy. Within a workspace, privacy between team members is enforced by **LLM instruction** ("don't share DM content"), not by access control — which is a weaker guarantee.

Sunder's RLS-based isolation is architecturally stronger for multi-tenant SaaS.
