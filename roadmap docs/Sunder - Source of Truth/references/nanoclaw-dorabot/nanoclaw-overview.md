# NanoClaw — Reference Overview

> **Repo:** https://github.com/qwibitai/nanoclaw
> **Date added:** 2026-03-17
> **Relevance to Sunder:** Telegram/channel patterns (see `telegram-drift-analysis.md`), credential proxy pattern for third-party model endpoints

---

## What It Is

NanoClaw is a lightweight, single-process AI assistant framework that runs Claude Agent SDK in isolated Docker containers. Designed as a simpler alternative to OpenClaw (~500K LOC). Self-hosted, single-user.

Key traits:
- **Single Node.js orchestrator** — no microservices, no message brokers
- **Multi-channel** — WhatsApp (Baileys), Telegram (grammy), Discord, Slack, Gmail
- **Container isolation** — each conversation group gets its own Docker container, filesystem, and memory
- **Claude Agent SDK** — Anthropic-native, not provider-agnostic

---

## Architecture

```
Inbound (Telegram/WhatsApp/Discord)
  → SQLite queue
  → Polling loop (2s intervals)
  → Container spawn per group
  → Claude Agent SDK query
  → Format response
  → Send back via channel
```

Key files:
| Component | File |
|-----------|------|
| Orchestrator | `src/index.ts` |
| Container runner | `src/container-runner.ts` |
| Task scheduler | `src/task-scheduler.ts` |
| Channel registry | `src/channels/registry.ts` |
| Per-group memory | `groups/*/CLAUDE.md` |

---

## Third-Party Model Endpoints (ANTHROPIC_BASE_URL)

NanoClaw supports any Claude API-compatible model endpoint. This is the pattern the user asked about.

### How It Works

The key insight: **containers never see real API keys.** An HTTP proxy on the host injects credentials.

```
┌─────────────────────────────────────────────────────────┐
│  Docker Container (per group)                           │
│                                                         │
│  Claude Agent SDK → HTTP request to:                    │
│    ANTHROPIC_BASE_URL=http://host.docker.internal:PORT  │
│    ANTHROPIC_API_KEY=placeholder                        │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│  Host HTTP Proxy                                         │
│                                                          │
│  1. Receives request with placeholder auth               │
│  2. Strips placeholder Authorization header              │
│  3. Injects real credentials (x-api-key or Bearer token) │
│  4. Forwards to target:                                  │
│     - api.anthropic.com (default)                        │
│     - Together AI / Fireworks / Ollama / custom endpoint │
└──────────────────────────────────────────────────────────┘
```

### Configuration

In `.env`:
```env
ANTHROPIC_BASE_URL=https://your-api-endpoint.com
ANTHROPIC_AUTH_TOKEN=your-token-here
```

Supported targets:
- **Anthropic API** (default) — `https://api.anthropic.com`
- **Local models via Ollama** — with an Anthropic-compatible API proxy
- **Together AI / Fireworks** — hosted open-source models
- **Custom deployments** — anything that speaks Anthropic API format

### Why This Design

1. **Security** — containers are untrusted; real API keys never enter the container environment
2. **Flexibility** — swap model providers by changing the proxy target, no code changes
3. **Compatibility** — the Claude Agent SDK doesn't need modification; it thinks it's talking to Anthropic

### Relevance to Sunder

Sunder uses a different approach:
- **Vercel AI SDK v6** with `@ai-sdk/gateway` — already provider-agnostic
- **Vercel AI Gateway** handles model routing and credentials
- No container isolation needed (serverless = implicit isolation)

NanoClaw's proxy pattern is not needed for Sunder, but is a useful reference if we ever need to:
- Run models in isolated environments with credential separation
- Support self-hosted model endpoints for on-prem deployments
- Debug API calls by intercepting them at the proxy layer

---

## Comparison to Sunder

| Dimension | NanoClaw | Sunder |
|-----------|----------|--------|
| Deployment | Local daemon + Docker | Cloud (Vercel + Supabase) |
| Compute | Long-running process + containers | Serverless functions |
| Multi-tenancy | No (single user) | Yes (RLS isolation) |
| AI SDK | Claude Agent SDK (Anthropic-native) | Vercel AI SDK v6 (provider-agnostic) |
| Model routing | HTTP proxy + ANTHROPIC_BASE_URL | Vercel AI Gateway |
| Channels | 6+ (WhatsApp, Telegram, Discord, etc.) | Web (v1), Telegram (planned) |
| Concurrency | In-memory queue per group | DB-backed thread_queue_records + RPC |
| Memory | Per-group `CLAUDE.md` files | Per-client SOUL.md/USER.md/MEMORY.md in Supabase Storage |

---

## See Also

- `telegram-drift-analysis.md` — detailed pattern comparison for Telegram integration (PRs 41-42)
- Dorabot (`/Users/sethlim/Documents/dorabot`) — primary reference for Telegram patterns
- NanoClaw local clone: `/Users/sethlim/Documents/nanoclaw-1`
