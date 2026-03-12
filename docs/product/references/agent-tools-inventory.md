# Agent Tools Inventory

**Total: 53 tools** | Read-only: 28 | Write/Mutating: 25

---

## Web (3 tools)

| # | Tool | File | Description |
|---|------|------|-------------|
| 1 | `web_search` | `tools/web/search.ts` | Search the web for current information |
| 2 | `web_scrape` | `tools/web/scrape.ts` | Read a webpage and extract its text content |
| 3 | `calculate_drive_time` | `tools/web/drive-time.ts` | Calculate traffic-aware driving time between two locations |

## Storage (3 tools)

| # | Tool | File | Description |
|---|------|------|-------------|
| 4 | `read_file` | `tools/storage/index.ts` | Read file content or list a directory tree |
| 5 | `write_file` | `tools/storage/index.ts` | Write, edit, or delete files in the client workspace |
| 6 | `search_knowledge` | `tools/storage/index.ts` | Search Knowledge Base files by keyword |

## CRM — Read (10 tools)

| # | Tool | File | Description |
|---|------|------|-------------|
| 7 | `search_companies` | `tools/crm/companies.ts` | Search companies by name, website, phone, email, address, or notes |
| 8 | `search_contacts` | `tools/crm/contacts.ts` | Search contacts by name, email, or phone |
| 9 | `search_deals` | `tools/crm/deals.ts` | Search deals by address or notes, optionally filter by stage |
| 10 | `search_interactions` | `tools/crm/interactions.ts` | Search CRM interaction history with filters |
| 11 | `search_tasks` | `tools/crm/tasks.ts` | Search CRM tasks, filter by status/contact/deal |
| 12 | `describe_crm_schema` | `tools/crm/schema.ts` | Returns the resolved CRM schema for this client |
| 13 | `get_deal_contacts` | `tools/crm/deal-contacts.ts` | List all contacts linked to a deal |
| 14 | `get_contact_deals` | `tools/crm/deal-contacts.ts` | List all deals linked to a contact |
| 15 | `get_company_contacts` | `tools/crm/company-links.ts` | List all contacts linked to a company |
| 16 | `get_company_deals` | `tools/crm/company-links.ts` | List all deals linked to a company |

## CRM — Write (18 tools)

| # | Tool | File | Description |
|---|------|------|-------------|
| 17 | `create_company` | `tools/crm/companies.ts` | Create a new company |
| 18 | `update_company` | `tools/crm/companies.ts` | Update an existing company by ID |
| 19 | `batch_create_companies` | `tools/crm/companies.ts` | Create multiple companies in a single call |
| 20 | `create_contact` | `tools/crm/contacts.ts` | Create a new contact |
| 21 | `update_contact` | `tools/crm/contacts.ts` | Update an existing contact by ID |
| 22 | `batch_create_contacts` | `tools/crm/contacts.ts` | Create multiple contacts in a single call |
| 23 | `create_deal` | `tools/crm/deals.ts` | Create a new deal |
| 24 | `update_deal` | `tools/crm/deals.ts` | Update an existing deal by ID |
| 25 | `batch_create_deals` | `tools/crm/deals.ts` | Create multiple deals in a single call |
| 26 | `create_interaction` | `tools/crm/interactions.ts` | Record a CRM interaction |
| 27 | `create_task` | `tools/crm/tasks.ts` | Create a new CRM task |
| 28 | `update_task` | `tools/crm/tasks.ts` | Update an existing CRM task by ID |
| 29 | `link_contact_to_deal` | `tools/crm/deal-contacts.ts` | Link a contact to a deal with a role |
| 30 | `unlink_contact_from_deal` | `tools/crm/deal-contacts.ts` | Remove a contact from a deal |
| 31 | `link_contact_to_company` | `tools/crm/company-links.ts` | Link a contact to a company |
| 32 | `unlink_contact_from_company` | `tools/crm/company-links.ts` | Remove the linked company from a contact |
| 33 | `link_deal_to_company` | `tools/crm/company-links.ts` | Link a deal to a company |
| 34 | `unlink_deal_from_company` | `tools/crm/company-links.ts` | Remove the linked company from a deal |

## CRM — Setup (1 tool)

| # | Tool | File | Description |
|---|------|------|-------------|
| 35 | `configure_crm` | `tools/crm/configure-crm.ts` | Configure CRM schema (stages, types, custom fields, etc.) |

## Utility (5 tools)

| # | Tool | File | Description |
|---|------|------|-------------|
| 36 | `ask_user_question` | `tools/utility/ask-user-question.ts` | Ask the user a question with structured options |
| 37 | `manage_todo` | `tools/utility/todo.ts` | Manage agent todos (add/update/delete) — scratchpad |
| 38 | `list_todo` | `tools/utility/todo.ts` | List all agent todos for the current thread |
| 39 | `rename_chat` | `tools/utility/rename-chat.ts` | Rename the current conversation thread |
| 40 | `send_message` | `tools/utility/send-message.ts` | Send a message to the user or contact (stub — logs only) |

## SQL (2 tools)

| # | Tool | File | Description |
|---|------|------|-------------|
| 41 | `run_agent_memory_sql` | `tools/utility/sql.ts` | Run a read-only SQL query against client tables |
| 42 | `get_agent_db_schema` | `tools/utility/sql.ts` | Get available tables, columns, and row counts |

## Triggers (3 tools)

| # | Tool | File | Description |
|---|------|------|-------------|
| 43 | `search_triggers` | `tools/triggers/search-triggers.ts` | Search available trigger types by keywords |
| 44 | `setup_trigger` | `tools/triggers/setup-trigger.ts` | Create a new trigger instance (schedule/webhook/RSS) |
| 45 | `manage_active_triggers` | `tools/triggers/manage-triggers.ts` | List, view, delete, simulate, or edit active triggers |

## Connections (8 tools)

| # | Tool | File | Description |
|---|------|------|-------------|
| 46 | `list_users_connections` | `tools/connections/list-connections.ts` | List all user's connections to external services |
| 47 | `search_for_integrations` | `tools/connections/search-integrations.ts` | Search integrations by keywords |
| 48 | `get_details_for_connections` | `tools/connections/get-connection-details.ts` | Get detailed info + tools for listed connections |
| 49 | `get_integrations_capabilities` | `tools/connections/get-integration-capabilities.ts` | List capabilities for given integrations |
| 50 | `create_new_connections` | `tools/connections/create-connection.ts` | Create a new connection (OAuth, MCP, API, etc.) |
| 51 | `manage_activated_tools_for_connections` | `tools/connections/manage-tools.ts` | Activate/deactivate tools for connections |
| 52 | `reauthorize_connection` | `tools/connections/reauthorize-connection.ts` | Re-authorize an expired connection |
| 53 | `delete_connection` | `tools/connections/delete-connection.ts` | Permanently delete a connection |

---

## Access Control

| Gate | Controls |
|------|----------|
| `crmMode: "setup"` | Swaps CRM read/write tools for `configure_crm` only |
| `allowWriteTools` / `RUNNER_ENABLE_CRM_WRITE_TOOLS` | Gates all CRM write tools (#16-33) |
| `allowMutations` | Gates trigger writes (#43-44) and connection writes (#49-52) |

All tool files live under `src/lib/runner/tools/`.
