# Tasklet Official Guide — Canonical Feature Reference

Source: Tasklet official product guide (verbatim from docs, Feb 2026).
Purpose: Fill gaps and correct contradictions vs our reverse-engineered docs.

---

## 1. Connections

Our docs cover this well. Key details from official guide for completeness:

- **3,000+ built-in integrations** via Pipedream
- **Connection types**: Pre-built integrations, Custom HTTP API, MCP servers, Computer Use
- **Auth model**: OAuth when available (user logs in directly), credentials encrypted — Tasklet never sees passwords
- **Permission model**: User authorizes connection → chooses which capabilities/tools to grant → per-agent tool activation
- **Revocation**: Settings → Connections, revoke anytime
- **Read-only option**: Can grant read-only access per connection

### Popular connections by category

| Category | Popular connections |
|---|---|
| Email & Calendar | Gmail, Outlook, Shortwave, Google Calendar, Outlook Calendar |
| Documents & Storage | Google Drive, Notion, Dropbox, Airtable, OneDrive |
| Communication | Slack, Discord, Telegram, Microsoft Teams, Twilio |
| Project Management | Linear, Asana, Jira, Google Tasks, ClickUp, Todoist |
| CRM & Sales | HubSpot, Salesforce, Attio, Pipedrive, Zoho |
| Finance & Billing | Stripe, QuickBooks, Xero |
| Marketing | ActiveCampaign, Klayvio, Mailchimp, Twilio, LinkedIn |
| Developer Tools | GitHub, Vercel, AWS |
| Custom | Any HTTP API, any MCP server |

### Custom APIs & Integrations

- Describe what you want to connect → Tasklet sets up a connection flow with credential input
- Internal company APIs supported — share reference files and Tasklet learns the endpoints

---

## 2. Triggers

**GAP: Our docs only cover schedule, webhook, and gmail triggers. Full list below.**

### All trigger types

| Trigger | How it works | Example |
|---|---|---|
| **Schedule** | Runs at times you choose — daily, weekly, or custom cron | Daily briefings, competitor monitoring, team recaps |
| **Webhook** | Runs when another app/service sends a request to your custom URL | App events, Apple Shortcuts/Siri, custom forms/code |
| **RSS Feed** | Runs when new content appears in any RSS feed | Podcasts, Substacks, newsfeeds, blogs, YouTube channels, subreddits |
| **Text Message** | Talk to agents via text (iMessage supported) | Quick questions, on-the-go tasks |
| **Email Replies** | Respond to email notifications from agents | Ask follow-ups, revise agent's work |
| **Gmail** | Runs on new emails or when you apply a specific label | Auto-draft replies, inbox categorization, deep research on label |

### Multiple triggers per agent

A single agent can handle multiple triggers simultaneously. Example inbox assistant:
- Schedule trigger: daily briefing every morning
- Gmail trigger: draft replies for incoming emails
- Gmail trigger: star important messages automatically

### Gmail filters

You can add filters to reduce processing and lower quota usage:
- Filter by attachments only
- Filter by specific senders
- Filter by emails marked as important
- Specify filter when creating: "When I get an email with an attachment..."

### Trigger management

- Test, delete, or view trigger details via chat or the trigger icon (⚡) in toolbar

---

## 3. Text & Email Messaging

**GAP: iMessage and two-way conversation lifecycle not in our docs.**

### Email anyone (with permission)

1. Add any email address as a contact method
2. Recipient clicks a verification link to opt in
3. Agent can then send them messages — reports, notifications, approval requests
4. Recipients don't need a Tasklet account

### iMessage

- Tasklet can send and receive iMessages
- Useful for time-sensitive alerts or mobile interaction
- Setup: ask agent to add phone number as contact method → recipient sends a text to verify

### Two-way conversations

- Recipients can reply to Tasklet's emails or texts
- Agent receives the response and can continue the conversation or take action
- Works across both email and iMessage channels

### Setup flow

1. Ask any agent to add a contact method (email or phone number)
2. Recipient verifies — clicking a link for email, or sending a text for iMessage
3. Once verified, agent can message them anytime

---

## 4. File Processing

**GAP: Our docs only cover basic read/write. Official guide positions file processing as a major capability.**

### Capabilities

| Capability | Examples |
|---|---|
| **Transfer** | Grab email attachments → file to Drive; download from web → upload to Slack |
| **Convert** | Batch resize images, transcode audio, turn documents into PDFs |
| **Create** | Generate spreadsheets, PDF reports, or videos with narration from scratch |
| **Edit** | Modify images, clean up data files |
| **Merge & Split** | Combine PDFs, extract pages, split large files |
| **Analyze** | Process a 10,000-row CSV → summary statistics and visualizations |

### Combining with triggers

File processing + triggers = automated recurring workflows:
- Every morning, pull CRM data → generate summary report
- When receipts arrive in inbox → extract data → add row to spreadsheet
- On schedule, check public dataset → alert if anything changes

### How it works (implementation detail)

File processing uses a combination of:
- Filesystem tools (`read_file`, `write_file`) for local operations
- Sandbox (`run_command`) for ffmpeg, ImageMagick, Pandoc, Python scripts
- Connection tools for cross-service transfers (Gmail → Drive, etc.)

---

## 5. Computer Use

**GAP: VM persistence contradicts our docs. Our docs say ephemeral; official guide says persistent.**

### What it is

A fully isolated virtual machine with:
- Browser
- File system
- Networking
- Software tools

Tasklet sees the screen, clicks buttons, fills forms, navigates pages — like a human would.

### Persistence (CONTRADICTS our reverse-engineered docs)

> "Each virtual computer you create is saved to your account, meaning your logins and downloads in the computer are persisted across sessions and your agents."

This means:
- Logins persist (no re-auth each session)
- Downloaded files persist
- Installed software persists
- Shared across the user's agents (not per-agent)

### When to use it

- No integration exists — old booking systems, internal dashboards, niche tools with no API
- Access is blocked — LinkedIn, X, etc. that restrict third-party API access
- GUI-only workflows — forms, dashboards, visual interactions

### Manual takeover

You can take control of the computer anytime via "fullscreen" on the VM:
- **Logging in** — enter credentials directly so you don't share passwords in chat
- **CAPTCHAs** — complete them when agent gets stuck
- **Debugging** — if something goes wrong

### Computer Use vs Sandbox

| | Sandbox | Computer Use |
|---|---|---|
| Purpose | Code execution, file processing | Browser/GUI interaction |
| Speed | Fast | Slower |
| Quota | Lower | Higher |
| Persistence | Packages don't persist | VMs persist |

### Troubleshooting

If computer gets stuck:
1. Settings → Connections
2. Find computer connection
3. Click 3 dots → "Restart"
4. If restart doesn't work → "Delete" and ask agent to create new computer

### Good to know

- **Persistent** — files, tabs, software stay between sessions
- **Slower than integrations** — computer use takes longer than API-based connections
- **Higher quota usage** — uses more quota than direct API calls

---

## 6. Filesystem

Our docs cover this comprehensively. Official guide summary for completeness:

### What lives there

| Location | Purpose |
|---|---|
| Your files | Uploads you share, documents Tasklet creates, reports, exports |
| Subagent instructions | Reusable playbooks for recurring work (e.g., "how to research a company") |
| Skills | Instructions that extend capabilities for specific connections/workflows |
| Processing workspace | Intermediate files during complex operations |

### Cross-connection file flow

Tasklet can:
- Download files from connections to the filesystem
- Upload files from the filesystem to connections

---

## 7. Sandbox (Code Execution)

**GAP: Pre-installed tools list and on-demand package install not in our docs.**

### Pre-installed tools

| Tool | Purpose |
|---|---|
| **ffmpeg** | Audio and video processing |
| **ImageMagick** | Image manipulation and conversion |
| **Pandoc** | Document format conversion |
| **curl** | Web requests |
| **jq** | JSON processing |
| **Python 3.12** | Full Python with access to any package (pandas, numpy, matplotlib, etc.) |

### On-demand package installation

The sandbox can install any additional package on demand. If a task requires a specific library or tool, Tasklet installs it and proceeds.

Note from our reverse-engineering: sandbox environments are ephemeral — installed packages do NOT persist between sessions. The sandbox must reinstall on each new session.

### Filesystem access

Code running in the sandbox can read and write to the agent's filesystem. Scripts can be saved and rerun later, or process files accumulated over multiple sessions.

---

## 8. Memory (SQL Database)

Our docs cover this comprehensively. Official guide summary:

- Every agent has its own persistent SQL database
- Survives across sessions
- Use cases: tracking progress, avoiding duplicates, storing config, building up data over time
- User can explicitly instruct: "Store all the contacts you find in your database"

---

## 9. Subagents

**NOTE: Official guide implies parallel/automatic creation. Our reverse-engineering shows sequential execution only.**

### Official guide claims

- Tasklet spins up focused subagents for specific parts of complex tasks
- "Tasklet often creates subagents automatically"
- Breaks big tasks into smaller, manageable steps
- Keeps costs down: each subagent works with only what it needs
- Processes long lists without losing track (e.g., reviewing 50 resumes one by one)

### What our reverse-engineering shows

- Subagents run **sequentially** — caller blocks until subagent completes
- Subagent creation is **manual** — parent writes instruction file then calls `run_subagent`
- No subagent-to-subagent communication (only parent sees results)
- The "automatic" creation is the LLM deciding to use subagents, not a framework feature

### Reconciliation

The official guide is marketing-facing. The implementation is:
1. LLM decides to break work into subagents (this is the "automatic" part)
2. Each subagent runs sequentially with its own context window
3. Parent collects results and continues

---

## 10. Webhooks (External API)

**GAP: Agent-to-agent communication not in our docs.**

### Receiving external data

- Tasklet creates a unique webhook URL
- Point external service at that URL
- When data arrives, Tasklet wakes up and processes it

### Agent-to-agent communication

> "Webhooks also enable agents to talk to each other. One agent can make a Direct API call to another agent's webhook URL to trigger it. This is useful for coordinating work between specialized agents."

This means:
- Agent A has a webhook trigger → gets a unique URL
- Agent B uses Direct API / HTTP tools to POST to Agent A's webhook URL
- Agent A wakes up and processes the payload
- This is the only supported inter-agent communication pattern

### Examples from official guide

- Stripe payment succeeds → Tasklet updates CRM + sends welcome email
- GitHub new issue → Tasklet triages and labels
- User signup webhook → Tasklet enriches profile + notifies sales
- Meeting transcription webhook → Tasklet creates tasks + emails recap

---

## Corrections to Our Reverse-Engineered Docs

| Topic | Our docs say | Official guide says | Resolution |
|---|---|---|---|
| Computer Use persistence | Ephemeral | Persistent across sessions | **Official guide is correct** — VMs persist, sandbox doesn't |
| Subagent parallelism | Sequential only | Implies parallel | **Our docs are correct** — implementation is sequential; guide is marketing language |
| Subagent auto-creation | Manual (write file + run_subagent) | "Often creates automatically" | **Both correct** — LLM decides to create them, but the mechanism is manual tool calls |
| Agent-to-agent comms | Not supported | Supported via webhooks | **Both correct** — not supported via subagents, but IS supported via webhook URLs |
| Installed packages persist | No | Not addressed | **Our docs are correct** — sandbox is ephemeral for packages |
