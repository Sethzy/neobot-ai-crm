# Agent Tools Inventory — v2

**Total: 36 tools** | Read-only: 16 | Write/Mutating: 16 | Approval-gated: 4

**Previous version:** [agent-tools-inventory.md](agent-tools-inventory.md) (v1, 53 tools)

**What changed (v1 → v2):**
- CRM tools consolidated: 28 per-entity tools → 8 unified tools (search_crm, create_record, update_record, delete_records, link_records, create_interaction, create_task, update_task)
- `crm_sql` merged into `run_sql` (single read-only SQL tool for all tables)
- Added: `calculate` (PR 8b), `show_view` (PR 42a), `run_subagent` (PR 30)
- Net: 53 → 36 (counting only tools present at v1 snapshot; 56 → 36 including post-v1 additions)

---

## Web (3 tools)

| # | Tool | File | Description |
|---|------|------|-------------|
| 1 | `web_search` | `tools/web/search.ts` | Search the web for current information via Brave Search |
| 2 | `web_scrape` | `tools/web/scrape.ts` | Extract markdown content from a webpage via Exa |
| 3 | `calculate_drive_time` | `tools/web/drive-time.ts` | Calculate traffic-aware driving time/distance via Google Maps Routes |

## Storage (3 tools)

| # | Tool | File | Description |
|---|------|------|-------------|
| 4 | `read_file` | `tools/storage/index.ts` | Read file content or list a directory tree |
| 5 | `write_file` | `tools/storage/index.ts` | Write, edit, or delete files in the client workspace |
| 6 | `search_knowledge` | `tools/storage/index.ts` | Search Knowledge Base files by keyword |

## CRM — Read (1 tool)

| # | Tool | File | Description |
|---|------|------|-------------|
| 7 | `search_crm` | `tools/crm/search.ts` | Search any CRM entity (contacts, companies, deals, interactions, tasks, deal_contacts) with free-text query and key-value filters |

## CRM — Write (6 tools)

| # | Tool | File | Description |
|---|------|------|-------------|
| 8 | `create_record` | `tools/crm/create-record.ts` | Create contacts, companies, or deals. Built-in duplicate detection, batch support (up to 50). |
| 9 | `update_record` | `tools/crm/update-record.ts` | Update contacts, companies, or deals by ID. Partial patches, custom field deep-merge, deal stage analytics. Batch support. |
| 10 | `link_records` | `tools/crm/link-records.ts` | Link or unlink CRM records. contact↔deal (junction table with role), contact→company (FK), deal→company (FK). |
| 11 | `create_interaction` | `tools/crm/interactions.ts` | Record a CRM interaction (call, email, meeting, etc.) linked to a contact and optionally a deal |
| 12 | `create_task` | `tools/crm/tasks.ts` | Create a new CRM follow-up task with optional contact/deal linkage and custom fields |
| 13 | `update_task` | `tools/crm/tasks.ts` | Update an existing CRM task by ID. Partial patches, custom field deep-merge. |

## CRM — Delete (1 tool, approval-gated)

| # | Tool | File | Approval | Description |
|---|------|------|----------|-------------|
| 14 | `delete_records` | `tools/crm/delete-records.ts` | **Yes** | Delete CRM records by ID. All 5 entity types. Requires reason for audit trail. Batch support with partial failure. |

## CRM — Setup (1 tool, setup mode only)

| # | Tool | File | Description |
|---|------|------|-------------|
| 15 | `configure_crm` | `tools/crm/configure-crm.ts` | Configure CRM vocabulary (contact types, deal stages, interaction types, custom fields, etc.) |

## Utility (8 tools)

| # | Tool | File | Description |
|---|------|------|-------------|
| 16 | `ask_user_question` | `tools/utility/ask-user-question.ts` | Ask the user a structured question with 2-4 options |
| 17 | `manage_todo` | `tools/utility/todo.ts` | Manage agent todos (add/update/delete) — internal scratchpad |
| 18 | `list_todo` | `tools/utility/todo.ts` | List all agent todos for the current thread |
| 19 | `rename_chat` | `tools/utility/rename-chat.ts` | Rename the current conversation thread |
| 20 | `send_message` | `tools/utility/send-message.ts` | Send a message to the user (stub — delivery not yet implemented) |
| 21 | `calculate` | `tools/utility/calculate.ts` | Evaluate scalar math expressions (arithmetic, trig, unit conversion) |
| 22 | `run_sql` | `tools/utility/sql.ts` | Run a read-only SQL query against all client-accessible tables (CRM, vault_files, agent_triggers, etc.). Optional purpose field for audit. |
| 23 | `get_agent_db_schema` | `tools/utility/sql.ts` | Get available tables, columns, and row counts |

## Triggers (3 tools)

| # | Tool | File | Approval | Description |
|---|------|------|----------|-------------|
| 24 | `search_triggers` | `tools/triggers/search-triggers.ts` | No | Search available trigger types by keywords |
| 25 | `setup_trigger` | `tools/triggers/setup-trigger.ts` | No | Create a new trigger instance (schedule/webhook/RSS) |
| 26 | `manage_active_triggers` | `tools/triggers/manage-triggers.ts` | **Delete only** | List, view, delete, simulate, or edit active triggers |

## Connections (8 tools)

| # | Tool | File | Approval | Description |
|---|------|------|----------|-------------|
| 27 | `list_users_connections` | `tools/connections/list-connections.ts` | No | List all user's connections with status and tool counts |
| 28 | `search_for_integrations` | `tools/connections/search-integrations.ts` | No | Search Composio integration catalog by keywords |
| 29 | `get_integrations_capabilities` | `tools/connections/get-integration-capabilities.ts` | No | List capabilities for given integrations |
| 30 | `get_details_for_connections` | `tools/connections/get-connection-details.ts` | No | Get detailed info + available tools for connections |
| 31 | `create_new_connections` | `tools/connections/create-connection.ts` | No | Create a new connection (OAuth integrations in v1) |
| 32 | `manage_activated_tools_for_connections` | `tools/connections/manage-tools.ts` | **Yes** | Activate/deactivate tools for connections |
| 33 | `reauthorize_connection` | `tools/connections/reauthorize-connection.ts` | No | Re-authorize an expired connection |
| 34 | `delete_connection` | `tools/connections/delete-connection.ts` | **Yes** | Permanently delete a connection |

## Views (1 tool)

| # | Tool | File | Description |
|---|------|------|-------------|
| 35 | `show_view` | `tools/views/show-view.ts` | Generate inline structured UI views (charts, panels, tables) in chat |

## Subagents (1 tool)

| # | Tool | File | Description |
|---|------|------|-------------|
| 36 | `run_subagent` | `tools/subagents/run-subagent.ts` | Run a subagent from a markdown instruction file with optional payload. Max 9 steps, 120s timeout. |

---

## Access Control

| Gate | Controls |
|------|----------|
| `crmMode: "setup"` | Swaps all CRM tools for `configure_crm` only |
| `allowWriteTools` | Gates CRM write tools (#8-13) and delete (#14) |
| `allowDeleteTools` | Additionally gates `delete_records` (#14) |
| `allowMutations` | Gates trigger writes and connection writes |

## Approval-Gated Tools

| Tool | Trigger |
|------|---------|
| `delete_records` | Always — destructive CRM operation |
| `manage_active_triggers` | Delete action only |
| `manage_activated_tools_for_connections` | Always — permission changes |
| `delete_connection` | Always — destructive account operation |

## CRM Consolidation Map (v1 → v2)

| v1 Tool(s) | v2 Tool | Notes |
|------------|---------|-------|
| `search_contacts`, `search_companies`, `search_deals`, `search_interactions`, `search_tasks`, `get_deal_contacts`, `get_contact_deals`, `get_company_contacts`, `get_company_deals` | `search_crm` | Entity param routes to correct table. deal_contacts uses join-based routing. |
| `describe_crm_schema` | *(removed)* | CRM schema now injected passively via `<crm-vocabulary>` in system-reminder |
| `create_contact`, `create_company`, `create_deal`, `batch_create_contacts`, `batch_create_companies`, `batch_create_deals` | `create_record` | Entity routing + built-in dedup + batch support |
| `update_contact`, `update_company`, `update_deal` | `update_record` | Entity routing + custom field merge + deal stage analytics |
| `delete_contact`, `delete_company`, `delete_deal`, `delete_interaction`, `delete_task` | `delete_records` | Unified delete with reason field + approval gate |
| `link_contact_to_deal`, `unlink_contact_from_deal`, `link_contact_to_company`, `unlink_contact_from_company`, `link_deal_to_company`, `unlink_deal_from_company` | `link_records` | Action + relationship routing (junction vs FK) |
| `create_interaction` | `create_interaction` | Kept standalone — config-driven type validation |
| `create_task`, `update_task` | `create_task`, `update_task` | Kept standalone — config-driven custom field validation |

## SQL Tool Merge (v2 audit)

`crm_sql` and `run_agent_memory_sql` were merged into `run_sql`. Both called the same `run_readonly_sql` RPC with identical validation logic. The `purpose` audit field from `crm_sql` is preserved as an optional parameter on `run_sql`.

All tool files live under `src/lib/runner/tools/`.
