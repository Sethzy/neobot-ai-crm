# Viktor Runtime & Architecture

Source: Direct Q&A with Viktor instance (2026-03-16)

## Execution Model

```
Slack @mention → thread spawned → agent loop (LLM ↔ tools) → Slack reply → thread ends
```

- Each message spawns an **independent thread** with a unique path (e.g. `/slack/Seth Lim/1773626946_525789`)
- Within each thread: **agentic loop** — think → call tools → observe results → think again → repeat until done
- Single agent loop per thread, not one-shot

## Subagents / Fan-Out

- Complex tasks use `create_thread` to spawn **child threads** (each with their own agent loop)
- Orchestrator can `wait_for_paths` for child threads to finish, then compile results
- An "orchestration skill" handles the fan-out/fan-in pattern
- Example: "pull HubSpot data, analyze it, email the result" → could be one thread or multiple parallel threads

## LLM

- **Claude (Anthropic)** — Viktor self-identifies as Claude
- No self-visibility into model routing — "I experience the world as one continuous reasoning process"
- Possible the platform does routing/selection above the agent level, but unconfirmed

## Sandbox Environment

Viktor inspected its own environment and reported:

```
OS:     Debian 12 (bookworm)
Kernel: Linux modal 4.4.0 (custom)
Infra:  Modal (modal.com) — the /work volume is mounted at /__modal/volumes
CPU:    AMD, 17 siblings visible
RAM:    ~448 GB allocated
Disk:   382 GB persistent volume
```

**Key: The workspace at `/work` is a persistent volume — survives across all threads and conversations.**

This is a significant difference from Tasklet (ephemeral sandbox) and NanoClaw (ephemeral Docker containers). Viktor's sandbox is more like a persistent VM.

## Repo Structure

Full workspace tree at `/work/` (excluding Slack logs, git internals, node_modules):

```
/work/
├── company/
│   └── SKILL.md                    # What Viktor knows about the client company
├── team/
│   └── SKILL.md                    # Team members & preferences
│
├── skills/                          # Long-term memory (SKILL.md files)
│   ├── browser/SKILL.md
│   ├── codebase_engineering/SKILL.md
│   ├── docx_editing/SKILL.md
│   ├── excel_editing/SKILL.md + scripts/
│   ├── general_tools/SKILL.md
│   ├── integrations/SKILL.md + references/
│   ├── pdf_creation/SKILL.md + scripts/
│   ├── pdf_form_filling/SKILL.md
│   ├── pdf_signing/SKILL.md
│   ├── pptx_editing/SKILL.md
│   ├── remotion_video/SKILL.md + references/
│   ├── scheduled_crons/SKILL.md
│   ├── skill_creation/SKILL.md + references/
│   ├── slack_admin/SKILL.md
│   ├── thread_orchestration/SKILL.md
│   ├── viktor_account/SKILL.md + references/
│   ├── viktor_spaces_dev/SKILL.md
│   ├── workflow_discovery/SKILL.md + references/
│   └── users/                       # Per-user preferences
│       ├── u0alpfrpwpq/
│       └── u0amkrsdw6l/
│
├── crons/                           # Scheduled jobs
│   ├── flow_discovery/
│   ├── heartbeat/
│   └── workflow_discovery/
│
├── sdk/                             # Tooling SDK
│   ├── docs/
│   │   ├── available_integrations.json
│   │   └── tools.md
│   ├── tools/                       # Browser, email, Slack, etc.
│   └── utils/                       # Helpers
│
├── viktor-spaces/                   # Deployed web apps
│   └── sales-pipeline/              # React + Convex app
│       ├── src/
│       ├── convex/
│       └── ...
│
├── slack/                           # Synced Slack logs (searchable)
├── logs/                            # Action logs by date
├── downloads/                       # Files from Slack/web
├── repos/                           # Cloned git repos
├── temp/                            # Scratch space (disposable)
│
├── pyproject.toml                   # Python project config
└── uv.lock                         # Dependency lock
```

Key directories: `skills/` (persistent memory/brain), `company/` + `team/` (client context), `crons/` (recurring jobs). Everything else is tooling or transient.

## Architecture Diagram

```
You (Slack) → Viktor Agent Run → Claude reasons + writes code
                                      │
                          ┌───────────┴────────────┐
                          │                        │
                   Sandbox (execute)        Integrations (query)
                   ┌────────────┐       ┌─────────────┐
                   │ Python     │       │ GitHub      │
                   │ Bash       │       │ Stripe      │
                   │ Browser    │       │ Notion      │
                   │ Files      │       │ 1000+ more  │
                   └────────────┘       └─────────────┘
                          │                        │
                          └───────────┬────────────┘
                                      │
                              Reply via Slack
                          (messages, files, apps)
```

### Component Breakdown

| Component | Description |
|-----------|-------------|
| **Brain** | Claude (Anthropic) — multi-step agent runs, not single prompt→response |
| **Sandbox** | Persistent Linux VM at `/work` — survives across all conversations |
| **Interface** | Slack only — all workspace messages synced as searchable log files |
| **Skills** | SKILL.md files as persistent knowledge — read before tasks, updated after learning |
| **Crons** | Scheduled recurring agent runs or scripts, with optional condition gates |
| **Threads** | Child agent threads for parallelism — fan-out work, collect results |
| **Integrations** | Native: GitHub, Drive, Notion, Stripe, Salesforce, Jira, Linear, HubSpot, PostHog, QuickBooks, Google Ads, Meta Ads + ~1000 via Pipedream |
| **Viktor Spaces** | Full-stack deployed apps — React + Convex + Vercel + auth, `*.viktor.space` subdomains |

## Implications for Sunder

- The **persistent volume** model means Viktor doesn't need a database for state — files are the database. Sunder uses Supabase for this.
- The **Modal infrastructure** means Viktor gets fast container spin-up with persistent storage. This is a managed service — no Docker orchestration needed.
- The **fan-out threads** pattern is similar to Sunder's subagent system but with parallelism built in.
- The **thread-per-message** model maps to Sunder's thread queue / run locking, but Viktor doesn't appear to have the "one run at a time per thread" constraint.
