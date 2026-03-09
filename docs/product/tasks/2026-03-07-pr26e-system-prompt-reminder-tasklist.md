# PR 26e: System Prompt + Reminder + Skill Files

**Parent PR:** PR 26 (Connection tools)
**Decisions:** TOOL-04, SKILL-05
**Depends on:** PR 26a (schema), PR 26c/26d (tools exist to reference in prompt)
**Blocks:** Nothing — final PR in the 26 series

**Goal:** Rewrite the system prompt's `<connections>` section to Tasklet-faithful `<external-connections>` with 3 sub-sections, enrich the system-reminder with per-connection tool counts and skill file pointers, and create the connection-scoped skill file lookup helper. After this PR, the agent receives Tasklet-aligned instructions for connection lifecycle management every turn.

---

## Tasklet Reference Files

| File | What it tells you |
|------|-------------------|
| `.../system-prompt-wholesale/01-v2-system-prompt-verbatim.md` | `<external-connections>` section with 3 sub-sections |
| `.../skills-deep-dive-connection-generation-trace.md` | How skill files work. System-reminder injects skill pointer every turn. Gmail example |

All paths abbreviated from `roadmap docs/Sunder - Source of Truth/references/tasklet/`.

---

## SKILL-05 Scope in v1

Per architecture decision SKILL-05: "Conditional copy-on-OAuth-completion" is deferred to post-v1.

**What IS in scope for this PR:**
- Connection-scoped storage path convention: `/{clientId}/skills/connections/{connectionId}/SKILL.md`
- Skill file lookup helper that returns content or null
- System-reminder includes skill pointer for each connection that has a skill file
- System prompt includes "MUST read connection skill file" instruction

**What is NOT in scope:**
- Auto-generation of skill files on OAuth completion
- Skill file templates or content
- The "creating-connections" system skill file itself

The plumbing is in place — when SKILL-05 is implemented post-v1, the lookup + pointer + prompt instructions are already wired.

**Path convention (Finding 14 — explicit v1 decision):** All skill paths in prompt text, reminder text, and tool responses use **workspace-relative** paths (e.g. `skills/connections/{connId}/SKILL.md`, `skills/system/creating-connections/SKILL.md`). Tasklet uses absolute paths with an `/agent/` root — Sunder omits this because `resolveStoragePath` in `agent-files.ts` already prepends `{clientId}/`. The agent passes workspace-relative paths to `read_file`/`write_file` and the storage layer resolves them.

**Skill file writing (Finding 6 — truly deferred):** PR26-8 (SKILL-05 skill file writing on connection creation) is truly deferred post-v1. In v1, most clients will not have connection skill files because nothing auto-generates or auto-copies them yet. `getConnectionSkillContent` must still perform a real lookup and return content when a file has been manually seeded, so the pointer plumbing is real rather than dead code.

**Skills read-only protection (Finding 9):** The `assertWritable` guard in `agent-files.ts` currently only protects `SOUL.md`. Since the prompt instructs the agent to trust and follow skill files, `skills/**` paths should also be read-only to prevent the agent from overwriting trusted instructions. Add `skills/` prefix check to `assertWritable` in this PR.

---

## Relevant Files

### Create
- `src/lib/storage/skill-files.ts` — connection-scoped skill file lookup
- `src/lib/storage/__tests__/skill-files.test.ts`

### Modify
- `src/lib/ai/system-prompt.ts` — rewrite `<connections>` -> `<external-connections>`
- `src/lib/ai/__tests__/system-prompt.test.ts`
- `src/lib/runner/system-reminder.ts` — enrich with per-connection detail
- `src/lib/runner/__tests__/system-reminder.test.ts`
- `src/lib/storage/agent-files.ts` — extend `assertWritable` to reject `skills/` (Finding 9)
- `src/lib/storage/__tests__/agent-files.test.ts`

---

## Task 1: Connection-scoped skill file lookup

**Files:**
- Create: `src/lib/storage/skill-files.ts`
- Create: `src/lib/storage/__tests__/skill-files.test.ts`

### Path convention

`/{clientId}/skills/connections/{connectionId}/SKILL.md`

This matches Tasklet's connection-scoped pattern (`/agent/skills/connections/{id}/SKILL.md`), NOT toolkit-scoped. Uses the `agent-files` bucket (same as all other client-scoped storage in `src/lib/storage/agent-files.ts`).

**v1 note:** No connection skill files are auto-generated in v1, so `getConnectionSkillContent` will usually return null. It must still do a real storage lookup so manually seeded files can surface in the system-reminder and tool responses.

### Step 1: Write failing test — `getConnectionSkillPath` returns correct path

Create `src/lib/storage/__tests__/skill-files.test.ts`:

```typescript
/**
 * Tests for connection-scoped skill file lookup.
 * @module lib/storage/__tests__/skill-files
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getConnectionSkillContent, getConnectionSkillPath } from "../skill-files";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const CONNECTION_ID = "conn-abc-123";

describe("getConnectionSkillPath", () => {
  it("returns {clientId}/skills/connections/{connectionId}/SKILL.md", () => {
    const result = getConnectionSkillPath(CLIENT_ID, CONNECTION_ID);

    expect(result).toBe(
      `${CLIENT_ID}/skills/connections/${CONNECTION_ID}/SKILL.md`,
    );
  });
});
```

### Step 2: Run test to verify it fails

Run:
```bash
npx vitest run src/lib/storage/__tests__/skill-files.test.ts -- -t "getConnectionSkillPath"
```
Expected: FAIL — `getConnectionSkillPath` is not exported (file does not exist).

### Step 3: Implement `getConnectionSkillPath`

Create `src/lib/storage/skill-files.ts`:

```typescript
/**
 * Connection-scoped skill file lookup for Supabase Storage.
 *
 * Path convention: `/{clientId}/skills/connections/{connectionId}/SKILL.md`
 * Matches Tasklet's connection-scoped pattern (SKILL-05).
 *
 * v1: getConnectionSkillContent always returns null (no skill files auto-generated).
 * Post-v1: SKILL-05 "conditional copy-on-OAuth-completion" will populate these files.
 *
 * @module lib/storage/skill-files
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

const BUCKET_ID = "agent-files";

/**
 * Returns the Supabase Storage path for a connection's skill file.
 *
 * @param clientId - Tenant identifier used as root prefix.
 * @param connectionId - The connection's unique identifier.
 */
export function getConnectionSkillPath(
  clientId: string,
  connectionId: string,
): string {
  return `${clientId}/skills/connections/${connectionId}/SKILL.md`;
}
```

### Step 4: Run test to verify it passes

Run:
```bash
npx vitest run src/lib/storage/__tests__/skill-files.test.ts -- -t "getConnectionSkillPath"
```
Expected: PASS.

### Step 5: Write failing test — `getConnectionSkillContent` returns null on download error

Add to the test file:

```typescript
function createMockStorageSupabase() {
  const mockDownload = vi.fn();

  const mockFrom = vi.fn(() => ({
    download: mockDownload,
  }));

  return {
    client: {
      storage: { from: mockFrom },
    } as unknown as SupabaseClient<Database>,
    mockFrom,
    mockDownload,
  };
}

describe("getConnectionSkillContent", () => {
  let supabase: ReturnType<typeof createMockStorageSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = createMockStorageSupabase();
  });

  it("returns null when download fails (file does not exist)", async () => {
    supabase.mockDownload.mockResolvedValue({
      data: null,
      error: { message: "Object not found" },
    });

    const result = await getConnectionSkillContent(
      supabase.client,
      CLIENT_ID,
      CONNECTION_ID,
    );

    expect(result).toBeNull();
    expect(supabase.mockFrom).toHaveBeenCalledWith("agent-files");
    expect(supabase.mockDownload).toHaveBeenCalledWith(
      `${CLIENT_ID}/skills/connections/${CONNECTION_ID}/SKILL.md`,
    );
  });
});
```

### Step 6: Run test to verify it fails

Run:
```bash
npx vitest run src/lib/storage/__tests__/skill-files.test.ts -- -t "returns null when download fails"
```
Expected: FAIL — `getConnectionSkillContent` is not exported.

### Step 7: Write failing test — `getConnectionSkillContent` returns content on success

Add to the `getConnectionSkillContent` describe block:

```typescript
  it("returns file content when skill file exists", async () => {
    supabase.mockDownload.mockResolvedValue({
      data: { text: vi.fn().mockResolvedValue("# Gmail Skills\n\nUse threads.") },
      error: null,
    });

    const result = await getConnectionSkillContent(
      supabase.client,
      CLIENT_ID,
      CONNECTION_ID,
    );

    expect(result).toBe("# Gmail Skills\n\nUse threads.");
  });

  it("returns null when data is present but error is also set", async () => {
    supabase.mockDownload.mockResolvedValue({
      data: { text: vi.fn().mockResolvedValue("content") },
      error: { message: "partial error" },
    });

    const result = await getConnectionSkillContent(
      supabase.client,
      CLIENT_ID,
      CONNECTION_ID,
    );

    expect(result).toBeNull();
  });
```

### Step 8: Implement `getConnectionSkillContent`

Add to `src/lib/storage/skill-files.ts`:

```typescript
/**
 * Reads a connection's skill file content from Supabase Storage.
 * Returns null if no skill file exists (expected in v1 -- SKILL-05 deferred).
 *
 * @param supabase - Authenticated Supabase client.
 * @param clientId - Tenant identifier used as root prefix.
 * @param connectionId - The connection's unique identifier.
 */
export async function getConnectionSkillContent(
  supabase: SupabaseClient<Database>,
  clientId: string,
  connectionId: string,
): Promise<string | null> {
  const path = getConnectionSkillPath(clientId, connectionId);

  const { data, error } = await supabase.storage
    .from(BUCKET_ID)
    .download(path);

  if (error || !data) return null;
  return await (data as { text: () => Promise<string> }).text();
}
```

### Step 9: Run all tests to verify they pass

Run:
```bash
npx vitest run src/lib/storage/__tests__/skill-files.test.ts
```
Expected: ALL PASS.

### Step 10: Commit

```bash
git add src/lib/storage/skill-files.ts src/lib/storage/__tests__/skill-files.test.ts
git commit -m "feat(pr26e): connection-scoped skill file lookup helper"
```

---

## Task 1b: Extend `assertWritable` to protect `skills/` directory (Finding 9)

**Files:**
- Modify: `src/lib/storage/agent-files.ts`
- Modify: `src/lib/storage/__tests__/agent-files.test.ts` (or add test inline)

### Context

The prompt tells the agent to trust and follow skill files. To prevent the agent from overwriting trusted instructions via `write_file`, `assertWritable` must reject paths under `skills/`.

Currently `assertWritable` only checks `path === "SOUL.md"`. This task adds a prefix check for `skills/`.

> **Finding 9 (round 3):** `assertWritable` is a private function — NOT exported. The existing test file only imports `createAgentFileClient`. Tests must go through the public API (`client.writeFile()`), not call `assertWritable` directly.

### Step 1: Write failing test

Add to the existing `agent-files.test.ts` describe block, testing through `writeFile`:

```typescript
describe("skills/ read-only protection (Finding 9)", () => {
  it("rejects writes to skills/ directory", async () => {
    const client = createAgentFileClient(mockSupabase, "client-123");

    await expect(
      client.writeFile("skills/connections/conn-1/SKILL.md", "overwrite"),
    ).rejects.toThrow("read-only");

    await expect(
      client.writeFile("skills/system/creating-connections/SKILL.md", "overwrite"),
    ).rejects.toThrow("read-only");
  });

  it("still rejects writes to SOUL.md", async () => {
    const client = createAgentFileClient(mockSupabase, "client-123");

    await expect(
      client.writeFile("SOUL.md", "overwrite"),
    ).rejects.toThrow("read-only");
  });

  it("allows writes to other paths", async () => {
    const client = createAgentFileClient(mockSupabase, "client-123");

    // These should not throw (mock Supabase will handle the actual upload)
    await expect(
      client.writeFile("MEMORY.md", "content"),
    ).resolves.not.toThrow();
  });
});
```

### Step 2: Run tests to verify they fail

```bash
npx vitest run src/lib/storage/__tests__/agent-files.test.ts -- -t "rejects writes to skills"
```
Expected: FAIL — `skills/` paths are not rejected (assertWritable only checks `SOUL.md`).

### Step 3: Implement

In `assertWritable` (private function inside `agent-files.ts`), add a prefix check:

```typescript
function assertWritable(inputPath: string): void {
  if (inputPath === "SOUL.md" || inputPath.startsWith("skills/")) {
    throw new Error(`Path "${inputPath}" is read-only`);
  }
}
```

Note: Keep `assertWritable` private — no need to export it. The guard is tested through the public `writeFile` API.

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/lib/storage/__tests__/agent-files.test.ts
```
Expected: ALL PASS.

### Step 5: Commit

```bash
git add src/lib/storage/agent-files.ts src/lib/storage/__tests__/agent-files.test.ts
git commit -m "feat(pr26e): protect skills/ directory from agent writes (Finding 9)"
```

---

## Task 2: System prompt rewrite — `<external-connections>`

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`
- Modify: `src/lib/ai/__tests__/system-prompt.test.ts`

### Current state (lines 70-75 of `system-prompt.ts`)

```
<connections>
Before using any external service tool (Gmail, Calendar, Slack, etc.), check the "Active connections:" line in your system reminder.
- If the needed service is connected: proceed with the tool call.
- If the needed service is not connected: tell the user to connect it in Settings. Do not attempt to use tools for unconnected services.
- Never try to create or manage connections yourself. Connections are managed by the user in Settings.
</connections>
```

### Target state (Tasklet-faithful)

Replace entire `<connections>` section with `<external-connections>` containing 3 sub-sections:
- `<using-existing-connections>` — prefer existing, MUST use `list_users_connections` first
- `<creating-new-connections>` — MUST read creating-connections skill file first
- `<using-connection-tools>` — MUST activate tools first, connection-ID-prefixed naming

### Key Tasklet fidelity points

- `<external-connections>` replaces `<connections>` -- outer tag name matches Tasklet
- 3 sub-sections matching Tasklet structure
- "MUST read creating-connections skill file before creating connections" -- preserved from Tasklet
- "MUST activate tools before using them" -- preserved
- Connection-ID-prefixed tool naming example -- `conn_1234__search_for_info` -- preserved
- "MUST read connection skills file before using tools" -- preserved
- Removed: "Never try to create or manage connections yourself" -- **directly contradicts** the new agent-driven connection lifecycle

### Step 1: Write failing tests for `<external-connections>` section

Add to `src/lib/ai/__tests__/system-prompt.test.ts`, inside the `describe("SYSTEM_PROMPT")` block:

```typescript
  it("includes external-connections section with 3 sub-sections", () => {
    expect(SYSTEM_PROMPT).toContain("<external-connections>");
    expect(SYSTEM_PROMPT).toContain("</external-connections>");
    expect(SYSTEM_PROMPT).toContain("<using-existing-connections>");
    expect(SYSTEM_PROMPT).toContain("</using-existing-connections>");
    expect(SYSTEM_PROMPT).toContain("<creating-new-connections>");
    expect(SYSTEM_PROMPT).toContain("</creating-new-connections>");
    expect(SYSTEM_PROMPT).toContain("<using-connection-tools>");
    expect(SYSTEM_PROMPT).toContain("</using-connection-tools>");
  });

  it("instructs agent to read creating-connections skill file if it exists (Findings 3+5)", () => {
    expect(SYSTEM_PROMPT).toContain(
      "If skills/system/creating-connections/SKILL.md exists",
    );
    expect(SYSTEM_PROMPT).toContain("MUST read it");
  });

  it("includes connection-ID-prefixed tool naming example", () => {
    expect(SYSTEM_PROMPT).toContain("conn_1234__search_for_info");
  });

  it("instructs agent to read connection skills file before using tools", () => {
    expect(SYSTEM_PROMPT).toContain(
      "MUST read and follow the instructions in the skills file",
    );
  });

  it("qualifies non-integration connection types as not yet available (Finding 7)", () => {
    expect(SYSTEM_PROMPT).toContain("not yet available");
    expect(SYSTEM_PROMPT).toContain("only Composio OAuth integrations are supported");
  });

  it("does not contain old passive connections guidance", () => {
    expect(SYSTEM_PROMPT).not.toContain(
      "Never try to create or manage connections yourself",
    );
  });
```

### Step 2: Run tests to verify they fail

Run:
```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts
```
Expected: FAIL — `<external-connections>` not found (old `<connections>` still present). The "does not contain old passive connections guidance" test also fails because the old text is still there.

### Step 3: Replace `<connections>` section with `<external-connections>` in system prompt

In `src/lib/ai/system-prompt.ts`, replace lines 70-75 (the entire `<connections>` block) with:

```
<external-connections>
You have the ability to connect to any external service using connections. Connections allow you to activate new tools to use in your work.
You are responsible for ensuring you have the right tools to accomplish the user's task. You MUST find, create, and activate connections as needed to get access to the services the user wants to use.

<using-existing-connections>
Your users may already have existing connections they want you to use.
ALWAYS prefer to use existing connections over creating new connections if the existing connection will work (for example, if it is tied to the correct account).
You MUST use the list_users_connections tool to check the users' existing connections first before creating new connections.
</using-existing-connections>

<creating-new-connections>
You can use the create_new_connections tool to create new connections to external services.
You can create connections to almost any external service using thousands of pre-built integrations. Custom MCP servers, HTTP APIs, and browser-control connections are not yet available (v1 — only Composio OAuth integrations are supported).

If skills/system/creating-connections/SKILL.md exists, you MUST read it for full instructions before creating connections.
</creating-new-connections>

<using-connection-tools>
You MUST activate the tools you want to use from your connections before using them by calling manage_activated_tools_for_connections.
This will prompt the user to grant permissions to use the specified tools.
Activated connection tools will appear in your prompt prefixed with their connection ID. For example, the search_for_info tool on connection Id conn_1234 will appear as conn_1234__search_for_info in your prompt. If you don't see the tool you need try activating it first.
To discover the full set of tools that are available for each connection before activating them call get_details_for_connections.

If your connection has an associated skills file (shown in the system-reminder), you MUST read and follow its instructions before using any tools from that connection.
</using-connection-tools>
</external-connections>
```

### Step 4: Update existing connection test

Replace the existing test at lines 89-94 of the test file:

```typescript
  // OLD:
  it("includes connection-first guidance for external tools", () => {
    expect(SYSTEM_PROMPT).toContain("<connections>");
    expect(SYSTEM_PROMPT).toContain("Active connections:");
    expect(SYSTEM_PROMPT).toContain("Settings");
    expect(SYSTEM_PROMPT).toContain("Never try to create or manage connections yourself");
  });
```

with:

```typescript
  it("includes agent-driven connection lifecycle guidance", () => {
    expect(SYSTEM_PROMPT).toContain("<external-connections>");
    expect(SYSTEM_PROMPT).toContain("list_users_connections");
    expect(SYSTEM_PROMPT).toContain("create_new_connections");
    expect(SYSTEM_PROMPT).toContain("manage_activated_tools_for_connections");
  });
```

### Step 5: Run all tests to verify they pass

Run:
```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts
```
Expected: ALL PASS.

### Step 6: Commit

```bash
git add src/lib/ai/system-prompt.ts src/lib/ai/__tests__/system-prompt.test.ts
git commit -m "feat(pr26e): system prompt rewrite to Tasklet-faithful external-connections"
```

---

## Task 3: System-reminder enrichment

**Files:**
- Modify: `src/lib/runner/system-reminder.ts`
- Modify: `src/lib/runner/__tests__/system-reminder.test.ts`

### Current format (lines 101-106 of `system-reminder.ts`)

```
Active connections: gmail, googlecalendar
```

### Target format

```
Active connections:
  gmail (conn-abc): 3/45 tools active (skill: skills/connections/conn-abc/SKILL.md)
  googlecalendar (conn-def): 2/20 tools active
Inactive connections: 1
```

When no active connections: `Active connections: none`
When no inactive connections: omit the inactive line.
When a skill file exists: include `(skill: skills/connections/{connId}/SKILL.md)` pointer (Finding 13 — must include `skills/` prefix).
When no skill file: omit the skill pointer.
Pending connections excluded from inactive count (pending = in-progress setup, not truly inactive).

### Implementation approach

The current `get_system_reminder_context` RPC returns `active_connection_toolkits: string[]`. Rather than modify the RPC, add a separate query via `getAllConnections` in the TS layer (simpler, avoids SQL changes). The `active_connection_toolkits` field remains in the RPC schema but is no longer used for the connections line.

### Step 1: Add module mocks and connection fixtures to test file

At the top of `src/lib/runner/__tests__/system-reminder.test.ts`, add module mocks (before all other imports except vitest):

```typescript
vi.mock("@/lib/connections/queries", () => ({
  getAllConnections: vi.fn(),
}));
vi.mock("@/lib/storage/skill-files", () => ({
  getConnectionSkillContent: vi.fn(),
}));
```

Add imports after the mock declarations:

```typescript
import { getAllConnections } from "@/lib/connections/queries";
import { getConnectionSkillContent } from "@/lib/storage/skill-files";
```

Add typed mock references and connection fixture after the existing `BASE_CONTEXT` constant:

```typescript
const mockGetAllConnections = vi.mocked(getAllConnections);
const mockGetSkillContent = vi.mocked(getConnectionSkillContent);

const MOCK_GMAIL_CONNECTION = {
  id: "conn-abc",
  client_id: CLIENT_ID,
  toolkit_slug: "gmail",
  display_name: "Gmail",
  status: "active" as const,
  composio_connected_account_id: "composio-gmail-123",
  account_identifier: "user@gmail.com",
  activated_tools: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL", "GMAIL_LIST_EMAILS"],
  tool_count: 45,
  created_at: "2026-03-05T00:00:00Z",
  updated_at: "2026-03-05T00:00:00Z",
};

const MOCK_CALENDAR_CONNECTION = {
  id: "conn-def",
  client_id: CLIENT_ID,
  toolkit_slug: "googlecalendar",
  display_name: "Google Calendar",
  status: "active" as const,
  composio_connected_account_id: "composio-cal-456",
  account_identifier: "user@gmail.com",
  activated_tools: ["GOOGLECALENDAR_LIST_EVENTS", "GOOGLECALENDAR_CREATE_EVENT"],
  tool_count: 20,
  created_at: "2026-03-05T00:00:00Z",
  updated_at: "2026-03-05T00:00:00Z",
};
```

In the existing `beforeEach`, add default mock returns:

```typescript
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-05T14:30:00Z"));
    mockGetAllConnections.mockResolvedValue([]);
    mockGetSkillContent.mockResolvedValue(null);
  });
```

### Step 2: Write failing test — per-connection format with tool counts

Add inside the `describe("buildSystemReminder")` block:

```typescript
  it("shows per-connection format with tool counts for active connections", async () => {
    const supabase = createReminderSupabase();
    mockGetAllConnections.mockResolvedValue([
      MOCK_GMAIL_CONNECTION,
      MOCK_CALENDAR_CONNECTION,
    ]);

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Active connections:");
    expect(result).toContain("gmail (conn-abc): 3/45 tools active");
    expect(result).toContain("googlecalendar (conn-def): 2/20 tools active");
  });
```

### Step 3: Run test to verify it fails

Run:
```bash
npx vitest run src/lib/runner/__tests__/system-reminder.test.ts -- -t "shows per-connection format"
```
Expected: FAIL — output still shows old flat format `Active connections: none` (from the RPC-based code, since `active_connection_toolkits` defaults to `[]`).

### Step 4: Implement connection enrichment in `buildSystemReminder`

In `src/lib/runner/system-reminder.ts`:

**Add imports** at the top (after existing imports):

```typescript
import { getAllConnections } from "@/lib/connections/queries";
import { getConnectionSkillContent } from "@/lib/storage/skill-files";
```

**Replace lines 101-107** (the existing `Active connections:` block):

```typescript
  reminderLines.push(`Active connections: ${
    context.active_connection_toolkits.length > 0
      ? context.active_connection_toolkits.map((toolkitSlug) => escapeXml(toolkitSlug)).join(", ")
      : "none"
  }`);
```

with:

```typescript
  const connections = await getAllConnections(supabase, clientId);
  const activeConns = connections.filter((c) => c.status === "active");

  if (activeConns.length > 0) {
    const connLines = await Promise.all(
      activeConns.map(async (conn) => {
        const activatedCount = conn.activated_tools.length;
        const totalCount = conn.tool_count;
        const skillContent = await getConnectionSkillContent(
          supabase,
          clientId,
          conn.id,
        );
        // Finding 13: Must include skills/ prefix so read_file resolves to
        // {clientId}/skills/connections/{connId}/SKILL.md in the agent-files bucket.
        const skillPointer = skillContent
          ? ` (skill: skills/connections/${conn.id}/SKILL.md)`
          : "";
        return `  ${escapeXml(conn.toolkit_slug)} (${conn.id}): ${activatedCount}/${totalCount} tools active${skillPointer}`;
      }),
    );
    reminderLines.push(`Active connections:\n${connLines.join("\n")}`);
  } else {
    reminderLines.push("Active connections: none");
  }

  const inactiveCount = connections.filter(
    (c) => c.status !== "active" && c.status !== "pending",
  ).length;

  if (inactiveCount > 0) {
    reminderLines.push(`Inactive connections: ${inactiveCount}`);
  }
```

### Step 5: Update existing connection tests to use new mocks

Replace the existing test "includes active connection toolkits when present" (lines 98-106 of the test file):

```typescript
  // OLD:
  it("includes active connection toolkits when present", async () => {
    const supabase = createReminderSupabase({
      active_connection_toolkits: ["gmail", "googlecalendar"],
    });

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Active connections: gmail, googlecalendar");
  });
```

with:

```typescript
  it("includes active connection toolkits when present", async () => {
    const supabase = createReminderSupabase();
    mockGetAllConnections.mockResolvedValue([
      MOCK_GMAIL_CONNECTION,
      MOCK_CALENDAR_CONNECTION,
    ]);

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Active connections:");
    expect(result).toContain("gmail (conn-abc):");
    expect(result).toContain("googlecalendar (conn-def):");
  });
```

Replace the existing test "renders active connections as none when there are no active toolkits" (lines 108-116):

```typescript
  // OLD:
  it("renders active connections as none when there are no active toolkits", async () => {
    const supabase = createReminderSupabase({
      active_connection_toolkits: [],
    });

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Active connections: none");
  });
```

with:

```typescript
  it("renders active connections as none when there are no active connections", async () => {
    const supabase = createReminderSupabase();
    mockGetAllConnections.mockResolvedValue([]);

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Active connections: none");
  });
```

### Step 6: Run all tests to verify they pass

Run:
```bash
npx vitest run src/lib/runner/__tests__/system-reminder.test.ts
```
Expected: ALL PASS.

### Step 7: Write failing test — skill file pointer present when skill exists

Add to the test file:

```typescript
  it("includes skill pointer when connection has a skill file", async () => {
    const supabase = createReminderSupabase();
    mockGetAllConnections.mockResolvedValue([MOCK_GMAIL_CONNECTION]);
    mockGetSkillContent.mockResolvedValue("# Gmail Skills\n\nUse threads.");

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain(
      "gmail (conn-abc): 3/45 tools active (skill: skills/connections/conn-abc/SKILL.md)",
    );
  });

  it("omits skill pointer when connection has no skill file", async () => {
    const supabase = createReminderSupabase();
    mockGetAllConnections.mockResolvedValue([MOCK_GMAIL_CONNECTION]);
    mockGetSkillContent.mockResolvedValue(null);

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("gmail (conn-abc): 3/45 tools active");
    expect(result).not.toContain("(skill:");
  });
```

### Step 8: Run tests to verify they pass

These tests should pass immediately because the implementation from Step 4 already includes the skill pointer logic.

Run:
```bash
npx vitest run src/lib/runner/__tests__/system-reminder.test.ts -- -t "skill pointer"
```
Expected: ALL PASS (skill pointer logic already implemented in Step 4).

### Step 9: Write failing test — inactive connection count

Add to the test file:

```typescript
  it("shows inactive connection count when inactive connections exist", async () => {
    const supabase = createReminderSupabase();
    mockGetAllConnections.mockResolvedValue([
      MOCK_GMAIL_CONNECTION,
      { ...MOCK_CALENDAR_CONNECTION, status: "inactive" },
    ]);

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Inactive connections: 1");
  });

  it("omits inactive line when all connections are active", async () => {
    const supabase = createReminderSupabase();
    mockGetAllConnections.mockResolvedValue([
      MOCK_GMAIL_CONNECTION,
      MOCK_CALENDAR_CONNECTION,
    ]);

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).not.toContain("Inactive connections:");
  });
```

### Step 10: Run tests to verify they pass

These tests should pass immediately because the implementation from Step 4 already includes the inactive count logic.

Run:
```bash
npx vitest run src/lib/runner/__tests__/system-reminder.test.ts -- -t "inactive"
```
Expected: ALL PASS (inactive count logic already implemented in Step 4).

### Step 11: Write test — pending connections excluded from inactive count

Add to the test file:

```typescript
  it("excludes pending connections from inactive count", async () => {
    const supabase = createReminderSupabase();
    mockGetAllConnections.mockResolvedValue([
      MOCK_GMAIL_CONNECTION,
      { ...MOCK_CALENDAR_CONNECTION, status: "pending" },
      {
        ...MOCK_GMAIL_CONNECTION,
        id: "conn-ghi",
        toolkit_slug: "slack",
        status: "error",
      },
    ]);

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    // Only "error" counts as inactive (not "pending")
    expect(result).toContain("Inactive connections: 1");
  });

  it("counts error status connections as inactive", async () => {
    const supabase = createReminderSupabase();
    mockGetAllConnections.mockResolvedValue([
      { ...MOCK_GMAIL_CONNECTION, status: "error" },
      { ...MOCK_CALENDAR_CONNECTION, status: "inactive" },
    ]);

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Inactive connections: 2");
    expect(result).toContain("Active connections: none");
  });
```

### Step 12: Run tests to verify they pass

Run:
```bash
npx vitest run src/lib/runner/__tests__/system-reminder.test.ts -- -t "pending connections|error status"
```
Expected: ALL PASS (pending exclusion already handled by `c.status !== "pending"` filter in Step 4).

### Step 13: Run full test suite to verify nothing is broken

Run:
```bash
npx vitest run src/lib/runner/__tests__/system-reminder.test.ts
```
Expected: ALL PASS.

### Step 14: Commit

```bash
git add src/lib/runner/system-reminder.ts src/lib/runner/__tests__/system-reminder.test.ts
git commit -m "feat(pr26e): enrich system-reminder with per-connection tool counts and skill pointers"
```

---

## Verification Checklist

- [ ] `getConnectionSkillPath` returns `"{clientId}/skills/connections/{connectionId}/SKILL.md"`
- [ ] `getConnectionSkillContent` returns null when no file exists
- [ ] `getConnectionSkillContent` returns content when file exists
- [ ] `getConnectionSkillContent` uses `agent-files` bucket (matches `agent-files.ts` convention)
- [ ] System prompt contains `<external-connections>` (not `<connections>`)
- [ ] System prompt contains 3 sub-sections: `<using-existing-connections>`, `<creating-new-connections>`, `<using-connection-tools>`
- [ ] System prompt includes "If skills/system/creating-connections/SKILL.md exists, MUST read it" (Findings 3+5 — conditional on file existence since skill files are deferred to PR26-8)
- [ ] System prompt includes "MUST activate tools before using them" instruction
- [ ] System prompt includes connection-ID-prefixed tool naming example (`conn_1234__search_for_info`)
- [ ] System prompt includes "MUST read and follow the instructions in the skills file" instruction
- [ ] System prompt does NOT contain "Never try to create or manage connections yourself"
- [ ] System-reminder shows per-connection format: `toolkit (connId): N/M tools active`
- [ ] System-reminder includes `(skill: skills/connections/{connId}/SKILL.md)` pointer when skill file exists (Finding 13 — must include `skills/` prefix for `resolveStoragePath`)
- [ ] System-reminder omits skill pointer when no skill file exists
- [ ] System-reminder shows `Inactive connections: N` when inactive connections exist
- [ ] System-reminder omits inactive line when all connections are active
- [ ] System-reminder excludes pending connections from inactive count
- [ ] System-reminder counts error and inactive statuses as inactive
- [ ] System-reminder shows `Active connections: none` when no active connections
- [ ] System prompt qualifies non-integration types as "not yet available" (Finding 7 — only Composio OAuth integrations in v1)
- [ ] `assertWritable` rejects writes to `skills/**` paths (Finding 9 — prevents agent from overwriting trusted skill files)
- [ ] `assertWritable` still rejects `SOUL.md` (existing behavior preserved)
- [ ] Existing system-prompt tests still pass (trigger tests, memory tests, etc.)
- [ ] Existing system-reminder tests still pass (time, user, todos, triggers, XML escaping, fallback)
- [ ] All tests pass: `npx vitest run src/lib/storage/__tests__/skill-files src/lib/storage/__tests__/agent-files src/lib/ai/__tests__/system-prompt src/lib/runner/__tests__/system-reminder`
