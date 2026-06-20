# Pipedream Integration: Full Architecture Trace

## The Two Types of Integrations (Observed from Real Data)

The `search_for_integrations` call reveals two distinct integration systems living side by side. You can tell them apart instantly by the ID prefix:

```
static:gmail                    <- Built by Tasklet (or official MCP)
static:notion                   <- Built by Tasklet (or official MCP)
static:hubspot                  <- Built by Tasklet
static:airtable                 <- Built by Tasklet (direct-api-wrapper)

pipedream:twilio                <- Built by Pipedream
pipedream:shopify_developer_app <- Built by Pipedream
pipedream:sendgrid              <- Built by Pipedream
pipedream:shopify_partner       <- Built by Pipedream
```

The ID prefix (`static:` vs `pipedream:`) is the routing key. It tells the platform which backend to talk to when creating connections and executing tools.

---

## Structural Differences (Line-by-Line from Real API Responses)

### 1. Quality Scores

```json
{ "integrationId": "static:gmail",    "quality": "GREAT",   "builtBy": "tasklet" }
{ "integrationId": "static:hubspot",  "quality": "GREAT",   "builtBy": "tasklet" }
{ "integrationId": "static:notion",   "quality": "GREAT",   "builtBy": "official-mcp" }
{ "integrationId": "static:airtable", "quality": "GREAT",   "builtBy": "direct-api-wrapper" }

// Pipedream integrations
{ "integrationId": "pipedream:twilio",                 "quality": "UNKNOWN", "builtBy": "pipedream" }
{ "integrationId": "pipedream:shopify_developer_app",  "quality": "UNKNOWN", "builtBy": "pipedream" }
```

**Why "UNKNOWN"?** Tasklet hasn't tested or verified Pipedream tools. They're pulled from Pipedream's registry as-is. Static integrations are built and tested by the Tasklet team (or wrapped from official MCP servers), so they get a quality rating.

### 2. Tool Naming Conventions

```
STATIC (clean, short):
  gmail_search_threads
  gmail_send_message
  gmail_create_draft

PIPEDREAM (prefixed with app slug, hyphenated):
  twilio-send-message
  twilio-make-phone-call
  twilio-list-messages
  shopify_developer_app-search-orders
  shopify_developer_app-create-product
  shopify_developer_app-update-customer
```

The Pipedream tool names include the app slug as a prefix. This is Pipedream's namespacing -- if you had both Twilio and Vonage connected, `twilio-send-message` vs `vonage-send-message` avoids collisions.

### 3. Tool Description Quality

**Static (Gmail) -- rich inline instructions:**
```
"description": "Search Gmail threads using Gmail search syntax...
<search-strategy>
  Query Construction:
  - Keyword searches may be overly restrictive...
  - When keywords are needed, use OR operators...
  Search Iteration:
  - Be thorough with your searches...
  - Start broader, then narrow down...
  Completeness:
  - Remember to retrieve and use ALL relevant results...
</search-strategy>"
```

The Tasklet team embedded an entire search strategy guide directly in the tool description. This is LLM-optimized -- it tells the model *how to think* about using the tool, not just what parameters it takes.

**Pipedream (Twilio) -- basic with external doc links:**
```
"description": "Send an SMS text with optional media files.
[See the documentation](https://www.twilio.com/docs/sms/api/message-resource)

IMPORTANT: The arguments have specific formats.
Please follow the instructions below:
- mediaUrl: Return JSON in this format: string[]"
```

Pipedream descriptions are auto-generated from their component registry. They link to external docs (which the LLM can't browse during a tool call). The "IMPORTANT" formatting notes are Pipedream's generic type hints.

### 4. The `builtBy` Taxonomy

From the real data, there are four builders:

| `builtBy` | What it means | Example |
|---|---|---|
| `tasklet` | Custom-built by Tasklet engineering team | HubSpot, Gmail |
| `official-mcp` | Wrapped from an official MCP server | Notion |
| `direct-api-wrapper` | Tasklet wrapper around a raw HTTP API | Airtable |
| `pipedream` | Pulled from Pipedream's component registry | Twilio, Shopify |

This reveals Tasklet's integration strategy: build the most important ones in-house (`tasklet`), wrap official MCP servers where they exist (`official-mcp`), wrap raw APIs for specific needs (`direct-api-wrapper`), and use Pipedream as a catch-all for the long tail of 3000+ services.

---

## Connection Creation: Static vs Pipedream (The Fork)

When `create_new_connections` is called, the platform routes based on the ID prefix:

### Static Path (e.g., `static:gmail`)

```
1. LLM calls: create_new_connections({ integrations: [{ integrationId: "static:gmail" }] })

2. Platform sees prefix "static:" -> routes to INTERNAL auth system

3. Platform's internal auth flow:
   - Knows Gmail needs OAuth 2.0
   - Has Google client_id/client_secret pre-configured
   - Generates OAuth URL with correct scopes for the activated tools
   - Presents consent screen to user in UI

4. User authorizes with Google

5. Platform stores:
   - OAuth tokens (access + refresh) in its credential store
   - Connection record: { id: "conn_abc...", service: "gmail", type: "static" }

6. Platform auto-generates:
   /agent/skills/connections/conn_abc.../SKILL.md
   <- Written from a TEMPLATE specific to Gmail
   <- Contains readMask guidance, label rules, link format

7. Platform registers tools:
   - gmail_search_threads, gmail_send_message, etc.
   - Tool implementations are INTERNAL to the platform
   - When called, platform makes direct HTTP calls to Gmail API

8. Platform updates <system-reminder> for next turn:
   "conn_abc...: 2 of 16 tools activated. You MUST read..."
```

### Pipedream Path (e.g., `pipedream:twilio`)

```
1. LLM calls: create_new_connections({ integrations: [{ integrationId: "pipedream:twilio" }] })

2. Platform sees prefix "pipedream:" -> routes to PIPEDREAM auth system

3. Pipedream's auth flow:
   - Platform calls Pipedream's Connect API
   - Pipedream knows Twilio needs Account SID + Auth Token
   - Pipedream generates auth form / OAuth flow
   - Presents to user in UI (may be Pipedream-hosted or embedded)

4. User enters credentials / authorizes

5. Pipedream stores:
   - Credentials in PIPEDREAM'S vault (not Tasklet's)
   - Returns a Pipedream account reference to Tasklet

6. Platform stores locally:
   - Connection record: { id: "conn_xyz...", service: "twilio", type: "pipedream" }
   - Pipedream account reference (opaque token/ID)

7. Platform may or may not generate a skill file
   <- Pipedream integrations likely DON'T get custom skill files
   <- Because Tasklet hasn't hand-written templates for 3000+ services

8. Platform registers tools:
   - twilio-send-message, twilio-make-phone-call, etc.
   - Tool NAMES come from Pipedream's component registry
   - Tool DESCRIPTIONS come from Pipedream's component registry

9. Platform updates <system-reminder> for next turn:
   "conn_xyz...: N of M tools activated..."
```

### The Critical Difference: Tool Execution

```
STATIC TOOL CALL (Gmail):
  LLM generates: gmail_search_threads({ query: "newer_than:7d", readMask: [...] })
       |
       v
  Platform receives tool call
       |
       v
  Platform's INTERNAL code:
    - Retrieves OAuth token from its credential store
    - Constructs Gmail API HTTP request directly
    - Calls https://gmail.googleapis.com/...
    - Parses response
    - Formats result for LLM
       |
       v
  Result returned to LLM context


PIPEDREAM TOOL CALL (Twilio):
  LLM generates: twilio-send-message({ from: "+1...", to: "+1...", body: "Hello" })
       |
       v
  Platform receives tool call
       |
       v
  Platform calls PIPEDREAM'S execution API:
    - Sends tool name + arguments + Pipedream account reference
    - Pipedream's servers:
      1. Look up the Twilio component code
      2. Retrieve user's Twilio credentials from Pipedream's vault
      3. Execute the component (Node.js function that calls Twilio API)
      4. Return result to Tasklet
       |
       v
  Platform receives result from Pipedream
       |
       v
  Formats result for LLM
       |
       v
  Result returned to LLM context
```

---

## The Two Execution Paths (Visual)

```
+-----------------------------------------------------------+
|                    LLM (agent)                             |
|                                                            |
|  Doesn't know or care which path a tool takes.             |
|  Calls gmail_search_threads or twilio-send-message         |
|  the same way -- generate JSON args, get text back.        |
+-----------------------------+------------------------------+
                              |
                              v
+-----------------------------------------------------------+
|              TASKLET PLATFORM (router)                     |
|                                                            |
|  +------------------+    +-------------------------+       |
|  |  STATIC path     |    |  PIPEDREAM path         |      |
|  |  Own code         |    |  Proxy to Pipedream     |      |
|  |  Own tokens       |    |  Pipedream's tokens     |      |
|  |  Direct HTTP      |    |  Pipedream executes     |      |
|  |  to Gmail API     |    |  the component          |      |
|  +--------+----------+    +------------+------------+      |
|           |                            |                   |
+-----------+----------------------------+-------------------+
            |                            |
            v                            v
     +----------+              +------------------+
     | Gmail    |              | Pipedream Cloud  |
     | API      |              |       |          |
     +----------+              |       v          |
                               |  +-----------+   |
                               |  | Twilio    |   |
                               |  | API       |   |
                               |  +-----------+   |
                               +------------------+
```

---

## Summary Comparison Table

| Dimension | Static (`static:*`) | Pipedream (`pipedream:*`) |
|---|---|---|
| **Quality rating** | GREAT (tested) | UNKNOWN (untested) |
| **Tool naming** | Clean underscores (`gmail_search_threads`) | App-slug prefix with hyphens (`twilio-send-message`) |
| **Descriptions** | Rich, LLM-optimized with inline strategy guides | Basic, auto-generated with external doc links |
| **Skill files** | Yes -- custom templates with usage instructions | Likely none |
| **Credential storage** | Platform's vault only | Split between Platform + Pipedream's vault |
| **Execution hops** | One (platform -> API) | Two (platform -> Pipedream -> API) |
| **Latency** | Lower | Higher |
| **Coverage** | ~20-30 services | 3000+ services |
| **Maintenance** | Tasklet team maintains each one | Pipedream maintains components |
| **Cost** | Only platform costs | Platform costs + Pipedream API costs |

**The strategy:** Build the top ~30 integrations (Gmail, Slack, Notion, HubSpot, Calendar, etc.) as high-quality static integrations. For everything else -- the long tail of 3000+ services -- proxy through Pipedream. Users get broad coverage, and Tasklet doesn't have to build 3000 integrations.

---

## For Sunder: What This Maps To

Sunder plans to use **Composio** (or MCP) as the integration layer. This is architecturally the same as Tasklet's Pipedream path:

```
TASKLET:  LLM -> Tasklet platform -> Pipedream -> Twilio API
SUNDER:   LLM -> Sunder backend   -> Composio  -> Twilio API
```

The question is whether Sunder also builds a "static" path for the most critical integrations. Tasklet's data suggests that's worthwhile for the top 5-10 services users will hit most -- you get better descriptions, custom skill files, lower latency, and full control over credentials.

For everything else, Composio/MCP as a catch-all is the right call. Same strategy, different vendor for the long tail.
