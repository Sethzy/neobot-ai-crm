# Tasklet Task List System — Live Trace and Architecture

> **Source:** Live API calls on Tasklet platform, 24 Feb 2026.
> **Tools traced:** `manage_tasks` (create/update/delete), `list_tasks` (read), system-reminder injection.

---

## 1. What the System-Reminder Shows

The platform injects a task count into every `<system-reminder>`:

```
- Open tasks: 3
```

That's it. Just the count. Not the titles. Not the IDs. Not the payloads.

**A fresh LLM waking up from a trigger fire sees "Open tasks: 3" and must call `list_tasks()` to discover what they are.**

---

## 2. Live Trace: Full CRUD Lifecycle

### Create

```
LLM calls: manage_tasks(action: "create", tasks: [
  { title: "Write weekly briefing summary" },
  { title: "Clean up stale research cache entries" },
  { title: "Disconnect expired Shopify test connection" }
])

Platform returns:
  { id: "at_bzg87...", title: "Write weekly briefing summary" }
  { id: "at_kxc73...", title: "Clean up stale research cache entries" }
  { id: "at_23gkn...", title: "Disconnect expired Shopify test connection" }
```

Each task gets an opaque platform-generated ID (`at_` prefix).

### Read

```
LLM calls: list_tasks()

Platform returns:
  [
    { id: "at_bzg87...", title: "Write weekly briefing summary" },
    { id: "at_kxc73...", title: "Clean up stale research cache entries" },
    { id: "at_23gkn...", title: "Disconnect expired Shopify test connection" }
  ]
```

Next turn's system-reminder now says: `Open tasks: 3`

### Complete (= Delete)

```
LLM calls: manage_tasks(action: "delete", taskId: "at_bzg87...")

Platform returns: success
```

System-reminder on next turn: `Open tasks: 2`

### Delete Remaining

```
LLM calls: manage_tasks(action: "delete", taskId: "at_kxc73...")
LLM calls: manage_tasks(action: "delete", taskId: "at_23gkn...")
```

System-reminder on next turn: `Open tasks: 0`

---

## 3. Architecture: What the Task List Actually Is

```
+-------------------------------------------------+
|              PLATFORM (server)                   |
|                                                  |
|   Task Store (database table)                    |
|   +--------------------------------------+       |
|   | id          | title         | payload|       |
|   | at_bzg87... | Write ...     | null   |       |
|   | at_kxc73... | Clean ...     | null   |       |
|   | at_23gkn... | Discon...     | null   |       |
|   +--------------------------------------+       |
|                                                  |
|   On each turn, platform counts rows:            |
|   -> "Open tasks: 3"                             |
|   -> Injects into <system-reminder>              |
+-------------------------------------------------+
                    |
                    v
+-------------------------------------------------+
|              LLM (agent)                         |
|                                                  |
|   "I see 3 open tasks."                          |
|   Calls list_tasks() to get details.             |
|   Decides what to do next.                       |
|                                                  |
|   Nothing happens automatically.                 |
|   I am the scheduler.                            |
+-------------------------------------------------+
```

---

## 4. Why "Not a Queue" Matters

A real job queue (like Trigger.dev, SQS, or BullMQ) has execution semantics:

```
Job enters queue -> Worker picks it up -> Job runs -> Job marked complete
         ^ automatic                ^ automatic
```

The task list has **zero execution semantics:**

```
Task exists -> nothing happens
Task exists -> LLM wakes up for some reason (user message, trigger)
           -> LLM calls list_tasks()
           -> LLM reads the titles
           -> LLM decides whether to work on them
           -> LLM might ignore them entirely
           -> LLM calls manage_tasks(delete) when it feels done
```

No worker picks up tasks. No timeout. No retry. No ordering guarantees.

---

## 5. The Critical Pattern: Trigger + Task Combo

This is where tasks become essential. Say a daily cron trigger fires and the LLM is processing 50 leads. It gets through 30 and hits a rate limit:

```
DAY 1: Trigger fires, LLM processing leads

  1. LLM processes lead 1-30, sends emails
  2. Rate limit hit on lead 31
  3. LLM creates task:
     manage_tasks(create, {
       title: "Process remaining 20 leads (starting from row 31)"
     })
  4. LLM stops execution
  5. Context discarded

DAY 2: Same trigger fires again

  1. Fresh LLM wakes up (zero memory of Day 1)
  2. System-reminder says: "Open tasks: 1"
  3. LLM calls list_tasks()
     -> "Process remaining 20 leads (starting from row 31)"
  4. LLM finishes leads 31-50
  5. LLM deletes the task
  6. LLM starts the new day's batch
```

**The task is a note-to-future-self.** It's how an amnesiac worker remembers unfinished business. The trigger provides the wake-up call. The task provides the context. Neither one does anything alone — the LLM is the only thing that reads, interprets, and acts.

---

## 6. Key Properties (Observed)

| Property | Observed behavior |
|---|---|
| **Task state** | Binary: exists (open) or deleted (done). No `in_progress`, `blocked`, etc. |
| **Completion action** | `delete` — there is no "mark complete" status. Open or gone. |
| **System-reminder** | Count only (`Open tasks: N`). No titles, no IDs. |
| **Execution** | Zero. Tasks don't run. LLM reads them and decides. |
| **Ordering** | None guaranteed. `list_tasks()` returns whatever order the platform chooses. |
| **Payload** | Tasks have a `title` field. No observed structured payload/metadata beyond title. |
| **ID format** | Opaque platform-generated: `at_` prefix + random string. |
| **Scope** | Per-agent. Each agent has its own task list. |
| **Persistence** | Durable. Tasks survive across sessions, trigger runs, everything. |
| **Visibility** | User can see tasks in the Tasklet web UI (Mission Control). |

---

## 7. What Tasks Are NOT

| Not this | Why |
|---|---|
| **Not a job queue** | No automatic execution. No workers. No retry. |
| **Not a scheduler** | Tasks don't have `run_at` times. Triggers handle scheduling. |
| **Not a state machine** | No status transitions. Binary: open or deleted. |
| **Not CRM tasks** | These are agent-internal work tracking, not user-facing CRM task records. |
| **Not persistent memory** | Tasks are ephemeral notes. SQL database and filesystem are the real memory. |

---

## 8. For Sunder: Implementation Mapping

### What we need (minimal)

A `tasks` table in Supabase:

```sql
CREATE TABLE agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES clients(id),
  title TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_isolation" ON agent_tasks
  USING (client_id = current_setting('app.client_id'));
```

### Tools (Tasklet parity)

```
manage_tasks(action: "create", tasks: [{ title, payload? }])
manage_tasks(action: "delete", taskId: string)
list_tasks() -> [{ id, title, payload, created_at }]
```

### System-reminder injection

Before each LLM call, runner queries:

```sql
SELECT count(*) FROM agent_tasks WHERE client_id = $1;
```

Injects into state block: `Open tasks: {count}`

### The full system is ~20 lines of code

1. One database table (5 lines of SQL)
2. Three tool handlers: create, delete, list (10 lines each)
3. One query in the system-reminder assembly (2 lines)

That's it. The "task system" is a database table and an LLM that's instructed to check it.

### Sunder extension: Beyond Tasklet parity

Tasklet's task list is intentionally minimal (binary state, title-only). Our V1 App Spec extends this with:

- **Dual model:** CRM tasks (user-visible tracking) + Agent Tasks (executable work items)
- **Status lifecycle:** `planning` -> `planned` -> `in_progress` -> `review` -> `done` / `cancelled`
- **Flags:** `needs_approval`, `is_blocked` (badges, not statuses)
- **Unified UI:** Single Tasks page merges both types

This is a **deliberate enrichment** of Tasklet's pattern. The core mechanic (LLM reads tasks on wake-up, acts on them, marks done) remains identical. We add richer state for user visibility and approval gating.
