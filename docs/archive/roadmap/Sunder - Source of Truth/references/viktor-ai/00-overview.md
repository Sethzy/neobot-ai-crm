# Viktor AI Reference

**Product:** Viktor (getviktor.com)
**Company:** Zeta Labs
**Category:** AI coworker that lives in Slack / Teams
**Pricing:** From $50/month (credits-based)
**Comparable to:** Tasklet, Junior.so, Sunder

## What Viktor Is

An AI coworker that executes real work — writes and runs code, connects to 3000+ integrations, generates files (PDF, Excel, PowerPoint), deploys web apps, opens PRs. Lives in Slack/Teams. "Not a chatbot — a colleague that does real work."

## Key Differentiators

- **Has its own computer** — Modal sandbox with persistent volume (not ephemeral)
- **Code execution is the core primitive** — writes Python scripts, runs them, iterates on errors
- **Persistent memory via Skills** — plain markdown files that survive across all conversations
- **Fan-out threads** — can spawn child threads for parallel complex work
- **3000+ integrations** — broad but shallow coverage

## Architecture Summary (From Viktor Itself)

- **LLM:** Claude (Anthropic). No visibility into whether platform does model routing.
- **Sandbox:** Modal (modal.com) container. Debian 12, Linux kernel 4.4.0 (custom modal kernel). AMD CPU, ~448GB RAM allocated, 382GB persistent volume.
- **State:** All files on persistent `/work` volume. No database. No vector store. Plain markdown skills files.
- **Execution:** Single agent loop per thread. Fan-out via `create_thread` for complex tasks.
- **Memory:** System prompt injection (skill names) → file reads (SKILL.md) → Slack history grep.

## How It Compares to Tasklet

| Dimension | Tasklet | Viktor |
|---|---|---|
| Sandbox | Ephemeral (per run) | Persistent volume |
| Database | SQLite per agent | None — files only |
| Memory | `/agent/home/` + SQL + Skills | `/work/skills/` (markdown) |
| Subagents | Sequential, context-reduced | Fan-out threads (`create_thread`) |
| Integrations | Pipedream (3000+) | Unknown platform (3000+) |
| System prompt | 7-layer context assembly | Skill names injected + file reads |
| Amnesia strategy | "Engineer for rediscovery" via DB | File reads + Slack history grep |

## How It Compares to Sunder

| Dimension | Sunder | Viktor |
|---|---|---|
| Interface | Web app (chat + CRM + dashboards) | Slack / Teams |
| Vertical | Real estate agents (deep) | General business (wide) |
| LLM | Gemini Flash via Vercel AI Gateway | Claude |
| Database | Supabase Postgres + RLS | None (files only) |
| Memory | SOUL.md / USER.md / MEMORY.md in Supabase Storage | Skills markdown on persistent volume |
| Code execution | None (structured tools only) | Core feature (Python in Modal sandbox) |
| Isolation | `clientId` + RLS (multi-tenant) | Workspace-level (single process per workspace) |
| Deployment | Vercel Functions + Supabase | Modal containers |
