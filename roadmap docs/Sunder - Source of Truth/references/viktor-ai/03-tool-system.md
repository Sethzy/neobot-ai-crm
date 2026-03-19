# Viktor Tool System

Source: Direct Q&A with Viktor instance (2026-03-16)

## Full Tool Inventory — 48 Tools Across 8 Modules

### browser_tools (3)
- `browser_create_session` — Create a Playwright browser session on Browserbase
- `browser_download_files` — Download files from browser session
- `browser_close_session` — Close browser session

### default_tools (16)
- `bash` — Shell execution
- `file_edit` — Edit files
- `file_read` — Read files
- `file_write` — Write files
- `glob` — Find files by pattern
- `grep` — Search file contents
- `view_image` — View image files
- `coworker_slack_history` — Read Slack history
- `coworker_send_slack_message` — Send Slack message
- `coworker_slack_react` — React to Slack message
- `coworker_delete_slack_message` — Delete Slack message
- `coworker_upload_to_slack` — Upload file to Slack
- `coworker_download_from_slack` — Download file from Slack
- `create_thread` — Spawn child thread (subagent)
- `send_message_to_thread` — Send message to child thread
- `wait_for_paths` — Wait for child threads to complete

### docs_tools (2)
- `resolve_library_id` — Resolve library name to ID
- `query_library_docs` — Query library documentation

### email_tools (2)
- `coworker_send_email` — Send email
- `coworker_get_attachment` — Get email attachment

### scheduled_crons (4)
- `create_agent_cron` — Create cron that triggers an agent conversation
- `create_script_cron` — Create cron that runs a script directly
- `delete_cron` — Delete a cron job
- `trigger_cron` — Manually trigger a cron

### slack_admin_tools (8)
- `coworker_list_slack_channels` — List Slack channels
- `coworker_join_slack_channels` — Join Slack channels
- `coworker_open_slack_conversation` — Open DM conversation
- `coworker_leave_slack_channels` — Leave Slack channels
- `coworker_list_slack_users` — List Slack users
- `coworker_invite_slack_user_to_team` — Invite user to Slack team
- `coworker_get_slack_reactions` — Get reactions on a message
- `coworker_report_issue` — Report issue (to Viktor support?)

### thread_orchestration (2)
- `list_running_paths` — List currently running threads
- `get_path_info` — Get info about a specific thread

### utils_tools (5)
- `file_to_markdown` — Convert file to markdown
- `ai_structured_output` — Use AI for structured data extraction
- `coworker_text2im` — Generate images from text
- `create_custom_api_integration` — Create custom API integration
- `quick_ai_search` — Quick web search

### viktor_spaces_tools (6)
- `init_app_project` — Initialize a web app project
- `deploy_app` — Deploy a web app
- `list_apps` — List deployed apps
- `get_app_status` — Get app deployment status
- `query_app_database` — Query app's database
- `delete_app_project` — Delete app project

### Other
- `submit_draft` — For approval workflows (human-in-the-loop)

### Dynamic Integration Tools
When integrations are connected, additional tool modules appear:
- `mcp_linear.py` — Linear integration tools
- `pd_attio.py` — Attio (via Pipedream) tools
- Pattern: `pd_<slug>.py` for Pipedream integrations, `mcp_<slug>.py` for MCP-style integrations

## Integration Architecture — 3,142 Total

| Type | Count | Auth Methods |
|---|---|---|
| **Pipedream** | 3,114 | API key (2,452), OAuth (632), other (30) |
| **Native** | 28 | First-party (GitHub, Google Drive, Notion, Slack, etc.) |

- Pipedream handles the OAuth/auth layer for thousands of SaaS APIs
- When connected, a new tool file is **auto-generated** into the SDK
- 28 native integrations have deeper, first-party support
- `create_custom_api_integration` tool for anything not in the catalog

## Sandbox Pre-installed Software

**Installed:**
- Python 3.13.12 (with `uv` 0.9.30 for package management)
- curl 7.88.1
- jq 1.6
- git 2.39.5
- OS: Debian 12 (bookworm)

**NOT pre-installed:**
- ffmpeg, ImageMagick, Pandoc, Node.js, LaTeX

**But:** Full `apt-get` and `uv add` available. Viktor regularly installs on the fly:
- `openpyxl` (Excel)
- `matplotlib` (charts)
- `python-pptx` (PowerPoint)
- `weasyprint` (PDF generation)

## Browser Automation

- **Playwright** running on **Browserbase** (cloud browser infrastructure)
- NOT a local headless browser
- Sessions created via SDK → CDP connect URL → full Playwright API
- Sessions are **recorded** and have **live view URLs**
- Capabilities: scrape, fill forms, take screenshots, download files

## Comparison to Tasklet Tools

| Category | Tasklet (31 tools) | Viktor (48 tools) |
|---|---|---|
| File I/O | `read_file`, `write_file` | `file_read`, `file_write`, `file_edit`, `glob`, `grep` |
| Execution | `run_command` | `bash` |
| Messaging | `send_message`, `reply_message` | 7 Slack tools + `coworker_send_email` |
| Subagents | `run_subagent` | `create_thread`, `send_message_to_thread`, `wait_for_paths` |
| Scheduling | `setup_trigger`, `manage_active_triggers` | `create_agent_cron`, `create_script_cron`, `delete_cron`, `trigger_cron` |
| Integrations | `search_for_integrations`, `get_integrations_capabilities` | Auto-generated `pd_*.py` / `mcp_*.py` modules |
| Browser | Via sandbox + Playwright | Browserbase + Playwright |
| Web app deployment | `create_instant_app` | `init_app_project`, `deploy_app`, `list_apps`, etc. |
| Database | `run_agent_memory_sql`, `get_agent_db_schema` | None (files only) |
| UI preview | `show_user_preview`, `close_user_preview` | N/A (Slack-only) |

## Comparison to Sunder Tools

| Category | Sunder | Viktor |
|---|---|---|
| CRM | Full CRM tools (deals, contacts, tasks, properties) | None native (via Pipedream HubSpot/Attio) |
| Memory | `read_file`, `write_file` (Supabase Storage) | `file_read`, `file_write` (persistent volume) |
| Messaging | Via Composio (Gmail, WhatsApp) | Native Slack + email tools |
| Code execution | None | Core feature (bash + Python) |
| Subagents | `createSubagentTool()` | `create_thread` + `wait_for_paths` |
| Scheduling | Agent triggers + cron scanner | `create_agent_cron` + `create_script_cron` |
| Integrations | Composio OAuth | Pipedream (3,114) + Native (28) |
| Browser | None | Browserbase + Playwright |
| Approvals | Two-tier safety model (gate external actions) | `submit_draft` tool |
