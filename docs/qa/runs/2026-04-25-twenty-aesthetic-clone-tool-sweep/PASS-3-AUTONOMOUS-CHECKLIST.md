# Pass 3 — Autonomous Tool Sweep (no user needed)

**Driver:** Claude via agent-browser
**Model under test:** `claude-haiku-4-5` (Basic — Haiku 4.5 in UI)
**Dev server:** http://localhost:3000
**Screenshots:** /tmp/sunder-qa/pass3/
**Issues:** /tmp/sunder-qa/issues/

Run top-to-bottom in one continuous browser session. Mark `[x]` when (a) chat tool card returns success, (b) side-effect check passes, (c) no console errors.

---

## Block A — Browser-side & public web (no auth)

- [ ] **T43 askUserQuestion**
  - Prompt: "Ask me which CRM stage to use for a new lead."
  - Expect: agent renders the askUserQuestion UI; I (as user) reply; agent continues.
  - Side-effect check: tool card shows the answer in transcript.

- [ ] **T28 browseWebsite**
  - Prompt: "Browse https://example.com and tell me the H1."
  - Expect: embedded browser renders; agent reads "Example Domain".

- [ ] **T29 search99co**
  - Prompt: "Search 99.co for 3-bedroom condos in Tanjong Pagar under $2M."
  - Expect: structured listing results; no auth wall.

- [ ] **T30 searchPropertyGuru**
  - Prompt: "Search PropertyGuru for 2-bedroom rentals in Bukit Timah under $5k/mo."
  - Expect: structured listing results; no auth wall.

## Block B — Triggers (DB-only, no external auth)

- [ ] **T39 setupTrigger**
  - Prompt: "Create a cron trigger that runs every minute to summarise my open tasks."
  - Side-effect check: row in `agent_triggers` with correct `client_id`, cron expression, and active=true.

- [ ] **T40 searchTriggers**
  - Prompt: "List all my active triggers."
  - Expect: includes the T39 row.

- [ ] **T41 manageActiveTriggers**
  - Prompt: "Pause the trigger you just created."
  - Side-effect check: row updates to active=false.
  - Then: "Delete it." → row removed.

## Block C — Composio reads & connection-state ops (no OAuth)

- [ ] **T31 listConnections**
  - Prompt: "List my connected integrations."
  - Expect: card lists current state (may be empty — that's still pass).

- [ ] **T32 getIntegrationCapabilities**
  - Prompt: "What can the Google Drive integration do?"
  - Expect: capability list returned from Composio catalog.

- [ ] **T33 listComposioTools**
  - Prompt: "List the available Composio tools for Gmail."
  - Expect: tool catalog returned.

- [ ] **T34 manageActivatedTools** *(gated: requires ≥1 existing connection on test client)*
  - Pre-check: T31 returned at least one connection. If none, mark **deferred** and stop.
  - Prompt: "Activate the Gmail send-email tool." → "Deactivate it."
  - Side-effect check: activation flags toggle in agent's tool list on next turn.

- [ ] **T38 deleteConnection** *(gated: requires a stale/test connection to delete)*
  - Pre-check: T31 shows a disposable connection. If none, mark **deferred** and route to handhold checklist.
  - Prompt: "Delete the [stale] connection."
  - Side-effect check: connection gone from T31 re-run.

---

## Stop conditions

- Console error on any step → screenshot + write repro to `issues_dir`, mark `fail`, continue.
- Tool card stays in "running" >30s → mark `blocked`, capture network log, continue.
- Any Composio gated step lands on a Google/MS/Slack consent screen → stop, route to handhold checklist.

## Tally

Block A: 0/4
Block B: 0/3
Block C: 0/5
**Total autonomous: 0/12**
