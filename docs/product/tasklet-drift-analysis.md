# Tasklet Reference → Sunder Drift Analysis

**Date:** 2026-03-07
**Scope:** All patterns from `roadmap docs/Sunder - Source of Truth/references/tasklet/` vs current Sunder implementation.

---

## Part I: Tasklet Reference Patterns (Summary)

### 1. System Prompt Structure
Six XML-tagged sections: `<contacting-the-user>`, `<context-management>`, `<filesystem>`, `<sql-db>`, `<subagents>`, `<sandbox>`. Personality: concise, skip preambles, one follow-up question at a time. Two autonomy modes: interactive chat vs autonomous trigger.

### 2. System-Reminder (Per-Turn Injection)
~150 tokens. Lazy-load hints (counts only, agent fetches details on demand):
- Current time (user timezone)
- User name + email
- Intelligence level
- Active triggers count
- Open tasks count
- DB tables count
- Active connections (with tool counts + skill file pointers)
- Inactive connections count
- Contact methods count

### 3. Tool Catalog (31 v2 Tools)
- **File I/O:** `read_file`, `write_file` (write/edit/delete ops)
- **Web:** `web_scrape_website`, `web_search_web`
- **Compute:** `run_command` (sandbox shell), `run_subagent` (fresh LLM from markdown)
- **Tasks:** `manage_tasks` (batch add/update/delete), `list_tasks` — binary state (exists or deleted), agent-global scope
- **SQL:** `run_agent_memory_sql`, `get_agent_db_schema`
- **Messaging:** `send_message`, `reply_message`, `list_contact_methods`, `add_contact_method`
- **Triggers:** `search_triggers`, `setup_trigger`, `manage_active_triggers` (list/view/delete/simulate/edit)
- **Connections:** 7 tools (list, get details, search integrations, capabilities, manage activated, reauthorize, delete, create)
- **UI/Preview:** `show_user_preview`, `close_user_preview`, `create_instant_app`, `toggle_pin_app`, `suggest_intelligence_level_change`, `rename_chat`

### 4. Task/Todo Model
- Database-backed, NOT a queue or scheduler
- Binary lifecycle: exists (open) → deleted (done). No status field.
- Purpose: notes-to-future-self for resumable work across amnesiac invocations
- Critical pattern: trigger fires → finds open tasks → resumes interrupted work

### 5. Context Recovery
- Oversized tool results replaced with `<context-removed blockId="...">` markers
- Full data recoverable at `/agent/blocks/{blockId}/args` and `/agent/blocks/{blockId}/result`
- Agent recovers via `read_file()` when needed

### 6. Trigger System
Types: schedule (cron), webhook (unique URL), rss (feed monitoring), text message, email replies, gmail.
Setup order: understand intent → provision connections → create subagents → create configs → create DB schema → register trigger LAST → offer simulate test.

### 7. Subagent System
Fresh LLM invocation from markdown instruction file. Sequential (parent blocks). Returns only final message. Cannot use UI-only tools. Must be fully self-contained instructions.

### 8. Persistence Principle
> "If behavior is not encoded into artifacts, future runs will not reliably reproduce it."

Filesystem for documents/scripts/configs. SQL database for queryable cross-run state. Both explicit — no implicit memory.

### 9. Safety / Autonomy Model
- **Interactive:** handle issues conversationally
- **Autonomous:** on persistent error → `send_message` once → create task with resume details → do NOT modify/delete triggers → do NOT send more than one notification for same issue

### 10. Skills (Lazy-Loaded)
Markdown files loaded via `read_file()` on demand. Two types: connection skills (per-connection API quirks) and system skills (always-available guides). ~500–1500 tokens per skill, loaded only when relevant.

### 11. Determinism Ladder
Lowest (trigger name only) → highest (trigger + detailed subagent + config + deterministic script). Artifact quality directly determines behavioral reliability.

### 12. Connection Model
Connections are **user-level** (shared OAuth tokens). Each agent independently activates a subset of tools from shared connections. Tool names prefixed with `connectionId__toolName`.

---

## Part II: Drift Analysis

### Legend
- **ALIGNED** — Sunder matches the Tasklet pattern
- **JUSTIFIED DRIFT** — Different from Tasklet, but by design (v2 plan scope cut or architectural decision)
- **UNJUSTIFIED DRIFT** — Different from Tasklet with no clear reason; should close the gap
- **PARTIAL** — Partly aligned, needs work on gaps

---

### 1. System Prompt Structure — PARTIAL

| Tasklet Section | Sunder Equivalent | Status |
|---|---|---|
| Identity/personality | `<your-personality>` in `SYSTEM_PROMPT` | ALIGNED — concise, skip preambles, Singapore English |
| `<contacting-the-user>` | `send_message` tool stub | JUSTIFIED DRIFT — messaging deferred to PR 28/29 |
| `<context-management>` | `<context-removed>` markers in toolcall-artifacts | ALIGNED in mechanism, different path format |
| `<filesystem>` | `<tool-usage>` File Storage section | PARTIAL — describes Supabase Storage layout, but less explicit than Tasklet's full directory map |
| `<sql-db>` | `<sql-db>` in `PLATFORM_INSTRUCTIONS` | ALIGNED |
| `<subagents>` | — | JUSTIFIED DRIFT — subagents cut from v2 plan |
| `<sandbox>` | — | JUSTIFIED DRIFT — sandbox cut from v2 plan |
| Two autonomy modes | Not in system prompt | **UNJUSTIFIED DRIFT** — we have triggers + autopilot but don't instruct the agent on interactive vs autonomous behavior differences |

**Action needed:**
- Add autonomous-mode instructions to system prompt: when running from a trigger (not chat), the agent should notify once on persistent error, create a task with resume details, and never modify/delete the trigger.

---

### 2. System-Reminder — PARTIAL

| Tasklet Field | Sunder Field | Status |
|---|---|---|
| Current time (user TZ) | Current time (UTC) | **UNJUSTIFIED DRIFT** — should use user timezone when available |
| User name + email | User display_name (email) | ALIGNED |
| Intelligence level | — | JUSTIFIED DRIFT — single model in v1, no levels |
| Active triggers count | Active triggers count | ALIGNED |
| Open tasks count | Open todos count | ALIGNED (different name, same pattern) |
| DB tables count | — | **UNJUSTIFIED DRIFT** — missing. Agent needs this hint to know when to call `get_agent_db_schema` |
| Active connections (with counts + skill pointers) | — | JUSTIFIED DRIFT — connections not yet built (PR 26) |
| Inactive connections count | — | JUSTIFIED DRIFT — connections not yet built |
| Contact methods count | — | JUSTIFIED DRIFT — messaging not yet built (PR 28/29) |
| Memory files count | Memory files count | SUNDER-SPECIFIC (Tasklet has no equivalent — different memory model) |
| Days since signup | Days since signup | SUNDER-SPECIFIC |

**Action needed:**
- Add DB tables count to system-reminder (agent has `run_agent_memory_sql` and `get_agent_db_schema` tools — needs the lazy-load hint)
- Use user timezone when available (fall back to UTC)

---

### 3. Tool Catalog — PARTIAL

| Tasklet Tool Category | Sunder Equivalent | Status |
|---|---|---|
| `read_file` / `write_file` | `read_file` / `write_file` | ALIGNED — same ops (write/edit/delete) |
| `web_search_web` / `web_scrape_website` | `web_search` / `web_scrape` | ALIGNED |
| `run_command` (sandbox) | — | JUSTIFIED DRIFT — sandbox cut |
| `run_subagent` | — | JUSTIFIED DRIFT — subagents cut |
| `manage_tasks` / `list_tasks` | `manage_todo` / `list_todo` | ALIGNED in pattern, different scope (see §4) |
| `run_agent_memory_sql` / `get_agent_db_schema` | `run_agent_memory_sql` / `get_agent_db_schema` | ALIGNED |
| `send_message` / `reply_message` | `send_message` (stub) | JUSTIFIED DRIFT — real messaging deferred |
| `list_contact_methods` / `add_contact_method` | — | JUSTIFIED DRIFT — deferred |
| `search_triggers` / `setup_trigger` / `manage_active_triggers` | Same three tools | ALIGNED |
| 7 connection tools | — | JUSTIFIED DRIFT — connections deferred to PR 26 |
| UI/preview tools | — | JUSTIFIED DRIFT — preview system cut |
| `rename_chat` | `rename_chat` | ALIGNED |
| CRM tools (15) | Sunder-specific | SUNDER-SPECIFIC — Tasklet has no CRM; this is our domain layer |

**No action needed** — all gaps are intentional scope cuts with clear PR numbers for future delivery.

---

### 4. Task/Todo Model — PARTIAL

| Aspect | Tasklet | Sunder | Status |
|---|---|---|
| Naming | `manage_tasks` / `list_tasks` | `manage_todo` / `list_todo` | JUSTIFIED DRIFT — avoids confusion with CRM `crm_tasks` |
| Scope | Agent-global | Per-thread | **REVIEW NEEDED** |
| Lifecycle | Binary (exists → deleted) | Binary (exists → deleted) | ALIGNED |
| Purpose | Notes-to-future-self, resumable work | Scratchpad, notes-to-future-self | ALIGNED |
| System-reminder | `Open tasks: N` | `Open todos: N` (per thread) | ALIGNED in pattern |
| Schema | id, title, payload JSONB | id, client_id, thread_id, title, payload JSONB | ALIGNED + thread_id |

**Thread-scoping review:**

Tasklet todos are agent-global because a trigger fires into a fresh context and needs to find all open work. Sunder's thread-scoping means:
- Autopilot pulse on its dedicated thread only sees todos created in that thread
- A trigger firing into thread X only sees thread X's todos
- Agent cannot leave a note in one thread and find it from another

This is **intentionally different** for v1 — our autopilot pulse prompt calls both `list_todo()` (thread-scoped) and `search_tasks()` (global CRM tasks). Cross-thread state goes into CRM tasks or memory files, not todos.

**Verdict: JUSTIFIED DRIFT** — documented reason: avoids cross-thread data leaks and keeps thread scratchpad isolated. If we later need agent-global todos, we can add an optional `scope: "global"` parameter.

---

### 5. Context Recovery / Toolcall Artifacts — ALIGNED

| Aspect | Tasklet | Sunder |
|---|---|---|
| Marker format | `<context-removed blockId="...">` | `<context-removed path="..." reason="...">` |
| Recovery path | `/agent/blocks/{blockId}/result` | `toolcalls/{toolCallId}/result.json` |
| Recovery mechanism | `read_file()` | `read_file()` |
| Storage | Block filesystem | Supabase Storage bucket |

Same pattern, different path scheme. The `reason` attribute in Sunder's marker is a nice addition — tells the agent what happened without needing to read the file. **No action needed.**

---

### 6. Trigger System — PARTIAL

| Aspect | Tasklet | Sunder | Status |
|---|---|---|---|
| Types: schedule | ✓ | ✓ | ALIGNED |
| Types: webhook | ✓ | ✓ | ALIGNED |
| Types: rss | ✓ | ✓ | ALIGNED |
| Types: pulse | — | ✓ | SUNDER-SPECIFIC (autopilot) |
| Types: text/email/gmail | ✓ | — | JUSTIFIED DRIFT — deferred to PR 28/29 |
| Setup order enforcement | Prompt-level ("set up trigger LAST") | Prompt-level (`<triggers>` section) | ALIGNED |
| `simulate` action | ✓ | ✓ | ALIGNED |
| `edit` action | ✓ | ✓ | ALIGNED |
| Retry policy | Not specified per type | 2 retries for user-created, 0 for pulse | SUNDER-SPECIFIC (good) |
| Claim lock | Implied | `current_run_id` column, atomic UPDATE | ALIGNED |
| Stale claim reaping | Implied | 15-min stale threshold | ALIGNED |

**Autonomous failure handling:**

Tasklet specifies: on persistent error during autonomous trigger execution → `send_message` once → create task with resume details → do NOT modify/delete triggers → do NOT send more notifications for same issue.

Sunder: No equivalent instruction in system prompt. Trigger executor catches errors and marks runs failed, but the agent itself has no guidance on what to do when a tool fails during a trigger-dispatched run.

**Action needed:**
- Add autonomous-mode failure instructions to system prompt (same as §1 action item)
- Consider adding failure counter / notification dedup logic when `send_message` becomes real (PR 28/29)

---

### 7. Subagent System — JUSTIFIED DRIFT

Entire system cut from v2 plan. Tasklet uses subagents for:
- Recurring/large/repeated work
- Context isolation (prevent context bloat)
- Deterministic workflows via detailed instruction files

Sunder handles these differently:
- Memory files serve long-term context persistence
- Compaction handles context bloat
- Single-agent model for v1 simplicity

**No action needed** — subagents are a v2+ consideration if/when we need multi-step autonomous workflows that exceed single-context capacity.

---

### 8. Persistence Model — ALIGNED

| Aspect | Tasklet | Sunder |
|---|---|---|
| Principle | Explicit persistence, not implicit | Same — memory files + DB |
| Filesystem | `/agent/home/` (FUSE) | Supabase Storage (`{clientId}/`) |
| SQL | Per-agent SQLite | Supabase Postgres with RLS |
| Decision matrix | DB for queryable; FS for documents | Same pattern |

**No action needed.**

---

### 9. Safety / Autonomy Model — PARTIAL

| Aspect | Tasklet | Sunder | Status |
|---|---|---|---|
| Interactive: user present | Conversational error handling | Same (prompt-level) | ALIGNED |
| Approval for external actions | UI-level approval cards | Prompt-level "describe and confirm" | JUSTIFIED DRIFT — mechanical gate deferred to PR 33 |
| Autonomous: persistent error | Notify once → create task → don't touch trigger | **Not instructed** | **UNJUSTIFIED DRIFT** |
| Trigger mutation gating | Subagents can't use trigger tools | Autopilot + cron runs have `allowTriggerMutations: false` | ALIGNED |

**Action needed:**
- Add autonomous failure pattern to system prompt (third mention — this is the key gap)

---

### 10. Skills System — JUSTIFIED DRIFT

Cut from v2 plan. Tasklet's lazy-loaded skill files serve two purposes:
1. **Connection skills** — API quirks per integration (e.g., Gmail label IDs vs names)
2. **System skills** — guides for creating connections, instant apps

Sunder equivalent when needed:
- Connection skills → will be needed when Composio ships (PR 26). Can implement as files in `{clientId}/skills/connections/{connId}/SKILL.md`
- System skills → can be baked into platform instructions or loaded from storage

**No action needed now** — track for PR 26 (connections).

---

### 11. Compaction — ALIGNED (different mechanism)

| Aspect | Tasklet | Sunder |
|---|---|---|
| Problem | Context truncation loses data | Same |
| Mechanism | Truncation + block-based recovery | Summarization + toolcall artifact recovery |
| Recovery | `read_file("/agent/blocks/{blockId}/...")` | `read_file("toolcalls/{toolCallId}/result.json")` |
| Trigger | Implicit (platform-managed) | Post-run, threshold-based (200 msgs) |

Sunder's summarization-based compaction is arguably better for long-running threads — instead of just truncating, it produces a summary that preserves CRM-relevant context. **No action needed.**

---

### 12. Memory System — SUNDER-SPECIFIC

Tasklet has no equivalent to Sunder's SOUL.md / USER.md / MEMORY.md / topic files system. Tasklet relies on:
- Filesystem (`/agent/home/`) for configs and artifacts
- SQL for cross-run queryable state
- Subagent instruction files for behavioral persistence

Sunder's memory system is our primary differentiation — compounding memory is the key long-term value driver. **No drift concern — this is additive.**

---

### 13. First-Run / Rediscovery Pattern — PARTIAL

Tasklet's rediscovery sequence on trigger-fired runs:
1. Inspect subagents
2. Read primary subagent for task semantics
3. Read config for user parameters
4. Query SQL for cache/history
5. Execute workflow

Sunder's equivalent:
1. Load memory files (SOUL/USER/MEMORY) into system context
2. System-reminder provides counts (triggers, todos, memory files)
3. Agent reads additional context on demand

**Key difference:** Tasklet's rediscovery is procedural (agent actively explores artifacts). Sunder's is contextual (memory injected into system prompt, counts as lazy-load hints). Both work, but Sunder should ensure trigger-dispatched runs have enough context to rediscover intent.

**Current state:** Trigger events include `instruction_path` and `invocation_message`, and the agent's system prompt includes memory files. This is sufficient for v1.

**No action needed.**

---

## Part III: Action Items (Unjustified Drifts to Close)

### Priority 1: Autonomous-Mode Instructions in System Prompt
**Gap:** No guidance for agent behavior during trigger-dispatched (non-chat) runs when errors occur.
**Tasklet pattern:** Notify once → create task with resume details → do NOT modify/delete triggers → do NOT send more than one notification for same issue.
**Where:** Add `<autonomous-mode>` section to `SYSTEM_PROMPT` or `PLATFORM_INSTRUCTIONS`.
**Blocked by:** Partially blocked by `send_message` being a stub — but can instruct agent to create a todo with error details + use the stub for intent signaling.

### Priority 2: DB Tables Count in System-Reminder
**Gap:** Agent has `run_agent_memory_sql` and `get_agent_db_schema` tools but no lazy-load hint for when tables exist.
**Tasklet pattern:** `DB tables: N` in system-reminder.
**Where:** Add to `get_system_reminder_context` RPC and `buildSystemReminderBlock()` in `system-reminder.ts`.
**Effort:** Small — one additional count query.

### Priority 3: User Timezone in System-Reminder
**Gap:** System-reminder shows UTC time. Tasklet shows user's timezone.
**Where:** `clients` table may need a `timezone` column (or derive from user profile). Update `buildSystemReminderBlock()` to format in user TZ.
**Effort:** Small if timezone is stored; medium if needs UI to set.

---

## Part IV: Justified Drifts Registry

These are intentional differences from Tasklet. Documented here so future sessions don't re-question them.

| # | Drift | Reason | Revisit When |
|---|---|---|---|
| JD-1 | No subagent system | v2 plan cut. Single-agent model for v1. | If autonomous workflows exceed single-context capacity |
| JD-2 | No sandbox/compute (`run_command`) | v2 plan cut (EXEC-04 deferred). | PR 42b if catalog-based views prove insufficient |
| JD-3 | No skills system | v2 plan cut. Skills can be loaded from storage when needed. | PR 26 (connections — connection skills will be needed) |
| JD-4 | No connection management tools | Composio integration deferred to PR 26. | PR 26 |
| JD-5 | No real messaging (`send_message` is stub) | Deferred to PR 28/29. | PR 28/29 |
| JD-6 | No preview/instant-app system | Cut with sandbox. PR 42a uses catalog-based JSON views instead. | PR 42a |
| JD-7 | No intelligence levels / model routing | Single model (Gemini Flash) for v1. Multi-tier deferred. | When cost/quality tradeoffs demand it |
| JD-8 | Todo is thread-scoped (not agent-global) | Avoids cross-thread data leaks. Cross-thread state goes into CRM tasks or memory files. | If agent needs global scratchpad across threads |
| JD-9 | Todo named `manage_todo`/`list_todo` (not `tasks`) | Avoids confusion with CRM `crm_tasks`. | Never — naming is permanent |
| JD-10 | CRM tools (15 domain-specific) | Sunder is a real estate CRM product. Tasklet has no CRM. | N/A — product differentiation |
| JD-11 | Memory system (SOUL/USER/MEMORY) | Sunder-specific. Compounding memory is the primary value driver. | N/A — core feature |
| JD-12 | Pulse trigger type | Sunder-specific autopilot. Tasklet has no equivalent. | N/A |
| JD-13 | Prompt-level approval (not mechanical) | Interim until PR 33 approval gate. | PR 33 |
| JD-14 | Summarization-based compaction | Better for long CRM threads — preserves entity names and decisions. | N/A — arguably superior |
| JD-15 | Missing text/email/gmail trigger types | Deferred to PR 28/29 messaging infrastructure. | PR 28/29 |
