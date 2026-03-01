# Per-Agent Data Model: Filesystem + SQL Database

> **Source:** Live Tasklet session trace (February 24, 2026)
> **Scope:** Two storage systems per agent, isolation model, decision matrix, Sunder mapping
> **Correction (v1.1):** Connections are user-level, not agent-level. One OAuth token shared across all agents. Agents choose which tools to activate from the shared connection. The tool `list_users_connections` (not `list_agent_connections`) confirms this.

---

## The Core Concept: "Per-Agent"

Every agent in Tasklet gets **isolated** storage. One agent's storage is completely separate from any other agent on the platform. A new agent starts with:

- Its own empty filesystem (`/agent/home/`)
- Its own empty SQL database (zero tables)
- Its own empty subagents folder
- Its own skills folder (populated for connections whose APIs have quirks needing documentation — not all connections get skill files)

**Connections are shared at the user level** (see below). Everything else is per-agent isolated.

---

## User vs Agent Relationship

A user is **not** an agent. A user **owns** agents. One user can have many agents:

```
Seth Lim (user/owner)
  |
  +-- CONNECTIONS (user-level, shared across all agents)
  |     +-- Gmail (conn_7ydrcj6nwqbr8sd2zbrs) -- one OAuth token
  |     +-- HubSpot (conn_xyz...) -- one OAuth token
  |     +-- LinkedIn (conn_abc...) -- one OAuth token
  |
  +-- Agent 1: "Email Briefing Bot"
  |     +-- own /agent/home/ filesystem          <- ISOLATED
  |     +-- own SQL database                     <- ISOLATED
  |     +-- own triggers (daily 9am cron)        <- ISOLATED
  |     +-- own subagents (research helper)      <- ISOLATED
  |     +-- Gmail: 2 of 16 tools activated       <- agent picks which tools from shared connection
  |
  +-- Agent 2: "Lead Research Assistant"
  |     +-- own /agent/home/ filesystem          <- ISOLATED
  |     +-- own SQL database                     <- ISOLATED
  |     +-- own triggers (webhook from CRM)      <- ISOLATED
  |     +-- own subagents (company profiler)     <- ISOLATED
  |     +-- HubSpot: 5 of 12 tools activated     <- different tool selection
  |     +-- Gmail: 8 of 16 tools activated       <- same connection, different activated tools
  |
  +-- Agent 3: "Content Scheduler"
        +-- own /agent/home/ filesystem          <- ISOLATED
        +-- own SQL database                     <- ISOLATED
        +-- own triggers (weekly cron)           <- ISOLATED
        +-- own subagents (none)                 <- ISOLATED
        +-- (no tools activated from any connection)
```

Creating a new agent spins up a fresh one — empty desk, empty filing cabinet, no memory of anything. But it can immediately activate tools from existing user-level connections without re-authenticating.

### What's Shared vs What's Isolated

**Shared (user-level):**
- Connections and their OAuth tokens — `list_users_connections` (not `list_agent_connections`) confirms this
- If Agent 2 needs Gmail, it doesn't re-authenticate. It activates tools from the same connection.
- The Settings page shows connections because they belong to the user, not any specific agent.

**Isolated (per-agent):**
- Filesystem (`/agent/home/`)
- SQL database
- Triggers
- Subagent instructions
- Which tools from each connection are activated (each agent picks its own subset)
- Skill files (generated per agent for connections with API quirks — not all connections get skill files)

Agent 1 **cannot** read Agent 2's files or query Agent 2's database. The user is the **only bridge** between agents — no inter-agent communication exists.

---

## Storage System 1: The Filesystem (`/agent/`)

Complete filesystem layout for a single agent:

```
/agent/
+-- home/                          <- READ-WRITE: Persistent agent storage
|   +-- calendly-briefing-execution-trace.md    <- Files created during conversations
|   +-- csv-cleaning-execution-trace.md
|   +-- gmail-sender-chart.png
|   +-- gmail-week-data.csv
|   +-- scripts/                   <- Common convention (not required)
|   +-- configs/                   <- Common convention (not required)
|   +-- outputs/                   <- Common convention (not required)
|
+-- skills/                        <- READ-ONLY: Platform-managed instructions
|   +-- connections/
|   |   +-- conn_7ydrcj6nwqbr8sd2zbrs/
|   |       +-- SKILL.md           <- Auto-generated when user connected Gmail
|   +-- system/
|       +-- building-instant-apps/
|       |   +-- SKILL.md           <- Shipped with the platform
|       +-- creating-connections/
|           +-- SKILL.md           <- Shipped with the platform
|           +-- create-direct-api-connection.md
|
+-- subagents/                     <- READ-WRITE: Subagent instruction files
|   +-- (empty)                    <- None created yet
|
+-- toolcalls/                     <- READ-ONLY: Tool call history (system-managed)
|   +-- {blockId}/
|       +-- args.json
|       +-- result.json
|
+-- uploads/                       <- READ-ONLY: Files manually uploaded by user
    +-- (empty)
```

### What goes in the filesystem

| Content | Example | Why filesystem, not DB |
|---|---|---|
| Documents & reports | `gmail-sender-chart.png` | Binary files, human-readable, need download links |
| Subagent instructions | `subagents/calendly-briefing.md` | Markdown files, read by `read_file`, not queried |
| Scripts | `home/scripts/clean_leads.py` | Code files run by sandbox |
| Exports | `gmail-week-data.csv` | User-facing downloads |
| Config files | `home/config.json` | Key-value config, not relational |

### Key properties

- **Persistent** — survives across sessions, trigger fires, restarts
- **Cloud-backed** — stored in cloud storage, accessed via FUSE in sandbox or `read_file`/`write_file` tools
- **Per-agent isolated** — no other agent can see `/agent/home/`
- **Slow for bulk operations** — FUSE adds ~10-100ms per file operation. Fine for reading a config file, not great for iterating 10,000 files

---

## Storage System 2: The SQL Database

SQLite database per agent. Starts empty — zero tables. Agent creates schema as needed.

### Example schema

```sql
CREATE TABLE example_lead_tracker (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  source TEXT,
  status TEXT DEFAULT 'new',
  last_contacted_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Example data:
-- | id | email             | source   | status    | last_contacted_at | created_at          |
-- |----|-------------------|----------|-----------|-------------------|---------------------|
-- | 1  | alice@acme.com    | calendly | contacted | NULL              | 2026-02-24 05:15:00 |
-- | 2  | bob@startup.io    | website  | new       | NULL              | 2026-02-24 05:15:00 |
-- | 3  | carol@bigcorp.com | calendly | new       | NULL              | 2026-02-24 05:15:00 |
```

### What goes in the database

| Content | Example | Why DB, not filesystem |
|---|---|---|
| State tracking | `last_processed_email_id` | Need to query "what did I already process?" |
| Structured records | Lead tracker, contact log | Need SQL filtering, sorting, aggregation |
| Cross-run state | Trigger execution log | "Did I already send Monday's briefing?" |
| Counters & metrics | `emails_processed_this_week: 47` | Need atomic updates, not file overwrites |
| Deduplication | `processed_webhook_ids` | Need fast lookup "have I seen this before?" |

### Key properties

- **Persistent** — survives across sessions, just like the filesystem
- **Per-agent isolated** — no other agent can access this database
- **SQL-powered** — full SQLite: joins, aggregations, indexes, transactions
- **Accessed only via tools** — `run_agent_memory_sql` and `get_agent_db_schema`. NOT accessible via the sandbox CLI
- **No schema by default** — agent creates tables as needed. Platform gives an empty database

### How state is surfaced to the LLM

The `<system-reminder>` (injected every turn) tells the LLM its DB tables exist:

```xml
<system-reminder>
Agent state summary:
- DB tables: 3
</system-reminder>
```

The LLM then calls `get_agent_db_schema()` to discover table structures and `run_agent_memory_sql()` to query data. The filesystem is NOT summarized in the system-reminder — the LLM must actively browse it via `read_file("/agent/home", mode="tree")`.

---

## The Recurring Trigger Pattern: Database as Continuity Between Amnesiac Workers

This is the most important pattern for understanding why the database exists.

```
MONDAY 9 AM -- Trigger fires, fresh LLM wakes up

  1. LLM sees <system-reminder>: "DB tables: 1" (knows tables exist)

  2. LLM calls get_agent_db_schema()
     -> Sees: example_lead_tracker with 3 rows

  3. LLM calls run_agent_memory_sql(
       "SELECT * FROM example_lead_tracker WHERE status = 'new'"
     )
     -> Gets: bob@startup.io, carol@bigcorp.com

  4. LLM does work (sends emails, runs research)

  5. LLM calls run_agent_memory_sql(
       "UPDATE example_lead_tracker SET status = 'contacted',
        last_contacted_at = datetime('now')
        WHERE email = 'bob@startup.io'"
     )

TUESDAY 9 AM -- Trigger fires again, COMPLETELY NEW fresh LLM wakes up

  1. Same query: "SELECT * WHERE status = 'new'"
     -> Now only gets: carol@bigcorp.com
     -> Bob was already handled yesterday -- the DB remembers, the LLM doesn't
```

**The database is the continuity between amnesiac workers.** Monday's LLM processes Bob, marks him `status = 'contacted'`. Tuesday's LLM (completely fresh, zero memory) queries for `status = 'new'` and Bob doesn't come back.

---

## Decision Matrix: Filesystem vs Database

```
"Should I use the filesystem or the database?"

                    +-------------------------+
                    | Do I need to query it?  |
                    +-----------+-------------+
                                |
                    +-----------+-----------+
                    |                       |
                   YES                      NO
                    |                       |
                    v                       v
              +----------+          +--------------+
              | DATABASE |          |  FILESYSTEM   |
              |          |          |               |
              | Leads    |          | Reports       |
              | Logs     |          | Charts        |
              | State    |          | Scripts       |
              | Counters |          | Configs       |
              | History  |          | Subagents     |
              +----------+          | CSVs          |
                                    +--------------+
```

**If you need to filter, count, sort, or deduplicate — database. Everything else — filesystem.**

---

## Why Full Agent Isolation (Design Reasoning)

### Pros

1. **No cross-contamination.** One buggy SQL query can't corrupt another agent's tables.
2. **Clean context.** Each agent's `<system-reminder>` only shows its own state. No noise from other agents.
3. **Independent lifecycles.** Delete one agent, nothing happens to others. No orphaned files, no broken references.
4. **Security boundary.** If one agent's connection token is compromised, blast radius is one agent.

### Cons

1. **No shared knowledge.** If Agent 1 already researched a company, Agent 2 can't access those findings. Must copy-paste or redo work.
2. **No collaboration.** Agent 1 can't say "hey Agent 2, go do this." No inter-agent communication. User is the only bridge.
3. **Duplicate state.** If both agents track the same leads, two copies of the data exist with no shared source of truth.

Note: ~~Duplicate connections~~ is NOT a con. Connections are user-level — both agents share the same Gmail OAuth token. No duplicate authentication needed.

### Why Tasklet chose this

Shared state between agents creates coordination nightmares — locking, permissions, schema conflicts, race conditions when two agents write the same row simultaneously. Isolation eliminates all of that at the cost of some redundancy.

Most users don't need agents talking to each other. They need one agent doing one job well.

---

## Sunder Mapping

| Tasklet | Sunder Equivalent | Notes |
|---|---|---|
| `/agent/home/` filesystem | **Supabase Storage** bucket per agent | One bucket per agent. Store files, configs, scripts, outputs |
| Per-agent SQL database | **Supabase Postgres** with row-level security | One schema or table prefix per agent. `agent_123_leads`, `agent_123_state` |
| `/agent/skills/` | System prompt fragments in backend | Store skill templates in Supabase Storage, inject relevant ones into prompt |
| `/agent/subagents/` | Instruction files in Supabase Storage | `/{agent_id}/subagents/briefing.md` |
| `/agent/uploads/` | Supabase Storage upload path | `/{agent_id}/uploads/` |
| `<system-reminder>` DB table count | Backend queries Postgres before each LLM call | "This agent has tables: leads (47 rows), state (3 rows)" |
| User-level connections | **Composio connections** scoped to `user_id` | One OAuth token per service per user. Agents activate tools from shared connections. |
| Per-agent tool activation | Agent config in Supabase | Each agent records which tools from each connection it uses |
| Full agent isolation (storage) | **Supabase Row-Level Security** | RLS policies scope storage/DB to `agent_id`. Connections stay at `user_id` level. |
| User-to-agent relationship | Supabase `agents` table with `user_id` FK | One user owns many agents. Each agent has its own storage paths and RLS-scoped DB rows |

### Key Sunder design decision

Supabase gives both storage systems in one product:
- **Supabase Storage** = the filesystem
- **Supabase Postgres** = the SQL database
- **Row-level security** = per-agent isolation

Tasklet's model: **connections shared at user level, everything else isolated per agent.** This is a smart split — OAuth tokens are expensive to set up (user goes through auth flow), so sharing them eliminates friction. But storage/DB/triggers are cheap to create, so isolating them prevents coordination bugs.

Sunder could further choose a **middle ground** for storage — isolated filesystems but a shared database per user, so agents can read (but not write) each other's tables. The choice depends on whether users need agents that collaborate vs agents that work independently.
