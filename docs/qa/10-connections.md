# QA Surface 10: Connections (OAuth)

> **PRs covered:** 25 (Composio + OAuth), 26 (connection tools), 26a (system skill files)
> **Dogfoodable:** Partial (UI elements yes, OAuth flow requires real credentials)
> **Time estimate:** 20-25 min manual

---

## Prerequisites

- Logged in with working chat
- Composio account configured with API key in env
- A test OAuth app to connect (Gmail is the primary target)
- Supabase dashboard open to check `connections` table
- Access to a real Gmail account for OAuth testing

---

## Dogfood Checklist (automated browser pass)

- [ ] Chat input works for connection-related prompts
- [ ] No connection-related console errors on page load
- [ ] If a connections page exists — it loads
- [ ] Agent can list connections (even if empty list)

---

## Manual QA Scenarios

### 10.1 List connections (empty state)

1. In chat: "What services am I connected to?"
2. **Expected:** Agent calls `list_users_connections`
3. **Expected:** Returns empty list / "No connections yet" message
4. Agent might proactively suggest connecting something

**Notes / failures:**

---

### 10.2 Search for available integrations

1. "What integrations can I connect?"
2. **Expected:** Agent calls `search_for_integrations`
3. **Expected:** Returns list from Composio catalog (Gmail, Google Calendar, Slack, etc.)
4. "Can I connect Gmail?"
5. **Expected:** Agent confirms Gmail is available

**Notes / failures:**

---

### 10.3 Create a connection — Gmail OAuth (happy path)

1. "Connect my Gmail"
2. **Expected:** Agent calls `create_new_connections` for Gmail
3. **Expected:** Agent returns an OAuth URL for you to click
4. Click the OAuth URL
5. **Expected:** Google OAuth consent screen appears
6. Complete the OAuth flow
7. **Expected:** Redirected back to app, connection created
8. **Verify in Supabase:** `connections` row exists with Gmail integration, active status
9. In chat: "Is Gmail connected now?"
10. **Expected:** `list_users_connections` shows Gmail as active

**Notes / failures:**

---

### 10.4 Connection details

1. "Show me details about my Gmail connection"
2. **Expected:** Agent calls `get_details_for_connections`
3. **Expected:** Returns connection status, available tools, last activity

**Notes / failures:**

---

### 10.5 Manage activated tools

1. "What Gmail tools are available?"
2. **Expected:** Agent calls `manage_activated_tools_for_connections` (list action)
3. **Expected:** Shows list of available Composio actions for Gmail (read email, send email, etc.)
4. "Activate the read email and search email tools"
5. **Expected:** `manage_activated_tools_for_connections` activates specific tools
6. "How many tools are active on Gmail?"
7. **Expected:** Accurate count

**Notes / failures:**

---

### 10.6 Connection-first behavior (CONN-03)

1. "Read my latest emails"
2. If Gmail is connected: **Expected:** Agent uses the Composio Gmail action
3. If Gmail is NOT connected: **Expected:** Agent suggests connecting Gmail first (not an error)

**Notes / failures:**

---

### 10.7 System-reminder connection state (PR 26)

1. After connecting Gmail with tools activated
2. Start a new thread
3. The system-reminder should include connection state
4. **Verify (indirectly):** Agent knows about Gmail connection without being told
5. "What connections do I have?"
6. **Expected:** Agent can answer from system-reminder context (may not need a tool call)

**Notes / failures:**

---

### 10.8 Connection skill files (PR 26)

1. After creating a Gmail connection
2. **Verify in Supabase Storage:** `/{clientId}/skills/connections/gmail.md` (or similar) exists
3. The skill file should contain service-specific instructions/quirks
4. In chat: agent should reference skill file when helping with Gmail

**Notes / failures:**

---

### 10.9 System skill files — bundled fallback (PR 26a)

1. In chat: "Read the file at /agent/skills/system/creating-connections/SKILL.md"
2. **Expected:** Agent calls `read_file`, gets bundled creating-connections skill content
3. **Expected:** Content is the Tasklet-verbatim connection creation guide
4. "Read /agent/skills/system/creating-connections/create-direct-api-connection.md"
5. **Expected:** Returns the direct API connection guide
6. "Read /agent/skills/connections/nonexistent.md"
7. **Expected:** Falls through to Supabase Storage (not the bundled fallback) — returns not found

**Notes / failures:**

---

### 10.10 Reauthorize connection

1. "Reauthorize my Gmail connection"
2. **Expected:** Agent calls `reauthorize_connection`
3. **Expected:** Returns new OAuth URL
4. Complete the reauth flow
5. **Expected:** Connection refreshed, still active

**Notes / failures:**

---

### 10.11 Delete connection

1. "Delete my Gmail connection"
2. **Expected:** Agent calls `delete_connection`
3. **Expected:** Connection removed
4. **Verify in Supabase:** `connections` row deleted or marked inactive
5. "What services am I connected to?"
6. **Expected:** Gmail no longer listed

**Notes / failures:**

---

## Edge Cases

- [ ] OAuth popup blocked — agent provides direct URL as fallback
- [ ] OAuth cancelled (user denies consent) — graceful error, no dangling connection row
- [ ] Token refresh — after hours, connection still works (Composio handles refresh)
- [ ] Activate a tool that doesn't exist — error handled
- [ ] Deactivate all tools on a connection — connection still exists but no tools
- [ ] System skill file path outside skills/system/ — does NOT use bundled fallback
- [ ] Connect same service twice — handled (error or replaces existing)
- [ ] Delete connection while agent is using it — graceful failure on next use

---

## Pass / Fail Criteria

- **Pass:** Can search integrations, create OAuth connection, activate/deactivate tools, use connected service via agent, skill files are created. System-reminder shows connection state. Bundled system skills serve correctly. Can reauth and delete connections.
- **Fail:** OAuth flow breaks, connection not persisted, tools can't be activated, skill files missing, system-reminder doesn't reflect connections, bundled skills return 404.
