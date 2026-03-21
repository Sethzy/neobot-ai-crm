# WhatsApp Inbox as CRM Data Source Implementation Plan

**PR:** PR 45: WhatsApp inbox as CRM data source
**Decisions:** GAP-09, TOOL-03
**Depends on:** PR 43 (WhatsApp relay — Go bridge stores all messages in SQLite)
**Goal:** Agent can read the user's WhatsApp conversations. "What did Sarah say last week?"

**Architecture:** The whatsapp-mcp Go bridge (deployed as relay in PR 43) already stores ALL WhatsApp messages in SQLite — including history sync on first link. PR 45 adds: (1) a sync endpoint that ingests messages from the relay into Supabase, (2) three agent tools that query the synced data, (3) voice note transcription via Gemini multimodal. Pattern from [lharries/whatsapp-mcp](https://github.com/lharries/whatsapp-mcp) query model, adapted for Supabase + RLS.

**Tech Stack:** Supabase (Postgres + RLS + full-text search), Vitest, Next.js App Router, Vercel AI SDK (Gemini multimodal for voice transcription)

**Reference code:** `/Users/sethlim/Documents/whatsapp-mcp/whatsapp-mcp-server/whatsapp.py` — query patterns for list_messages, list_chats, search_contacts. Schema from `whatsapp-bridge/main.go`.

---

## Relevant Files

### Create
- `supabase/migrations/XXXXXXXX_create_whatsapp_inbox_tables.sql` — whatsapp_chats + whatsapp_messages tables
- `src/lib/channels/whatsapp/inbox.ts` — query functions for agent tools
- `src/lib/channels/whatsapp/inbox.test.ts`
- `src/lib/runner/tools/whatsapp-inbox.ts` — agent tool definitions
- `app/api/webhook/whatsapp/sync/route.ts` — bulk message sync endpoint

### Modify
- `src/lib/runner/tool-registry.ts` — register WhatsApp inbox tools
- `src/lib/ai/system-prompt.ts` — add WhatsApp tool descriptions
- `src/lib/channels/whatsapp/index.ts` — add inbox exports

### Reference
- `/Users/sethlim/Documents/whatsapp-mcp/whatsapp-mcp-server/whatsapp.py` — SQL query patterns
- `/Users/sethlim/Documents/whatsapp-mcp/whatsapp-bridge/main.go` — SQLite schema (lines 63-87)

---

## Task 1: Supabase migration — WhatsApp inbox tables

**Files:**
- Create: `supabase/migrations/XXXXXXXX_create_whatsapp_inbox_tables.sql`

**Step 1: Write the migration**

```sql
-- PR45: WhatsApp inbox tables for agent message search.
-- Synced from the Fly relay's SQLite store via /api/webhook/whatsapp/sync.
-- Schema adapted from whatsapp-mcp Go bridge.

CREATE TABLE public.whatsapp_chats (
  jid TEXT NOT NULL,
  client_id UUID NOT NULL
    REFERENCES public.clients(client_id) ON DELETE CASCADE,
  name TEXT,
  last_message_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, jid)
);

CREATE INDEX idx_whatsapp_chats_client_id
  ON public.whatsapp_chats(client_id);

CREATE INDEX idx_whatsapp_chats_last_message_time
  ON public.whatsapp_chats(client_id, last_message_time DESC);

COMMENT ON TABLE public.whatsapp_chats IS
  'WhatsApp chat metadata synced from relay. One row per chat per client.';

CREATE TABLE public.whatsapp_messages (
  message_id TEXT NOT NULL,
  chat_jid TEXT NOT NULL,
  client_id UUID NOT NULL
    REFERENCES public.clients(client_id) ON DELETE CASCADE,
  sender TEXT,
  content TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  is_from_me BOOLEAN NOT NULL DEFAULT false,
  media_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, message_id, chat_jid)
);

CREATE INDEX idx_whatsapp_messages_client_chat
  ON public.whatsapp_messages(client_id, chat_jid, timestamp DESC);

CREATE INDEX idx_whatsapp_messages_client_timestamp
  ON public.whatsapp_messages(client_id, timestamp DESC);

-- Full-text search index on message content
CREATE INDEX idx_whatsapp_messages_content_fts
  ON public.whatsapp_messages
  USING gin(to_tsvector('english', coalesce(content, '')));

COMMENT ON TABLE public.whatsapp_messages IS
  'WhatsApp message history synced from relay. Searchable by agent via tools.';

-- RLS
ALTER TABLE public.whatsapp_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_chats_select_own
  ON public.whatsapp_chats FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY whatsapp_chats_insert_own
  ON public.whatsapp_chats FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY whatsapp_chats_update_own
  ON public.whatsapp_chats FOR UPDATE
  USING (client_id = public.get_my_client_id());

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_messages_select_own
  ON public.whatsapp_messages FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY whatsapp_messages_insert_own
  ON public.whatsapp_messages FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());
```

**Step 2: Apply and regenerate types**

```bash
npx supabase db reset
npx supabase gen types typescript --local > src/types/database.ts
```

**Step 3: Commit**

```bash
git add supabase/migrations/*_create_whatsapp_inbox_tables.sql src/types/database.ts
git commit -m "feat(pr45): add whatsapp_chats and whatsapp_messages tables with FTS"
```

---

## Task 2: Message sync endpoint

The relay bulk-POSTs messages to Sunder. Called periodically by the relay (cron or on-connect) and on history sync completion.

**Files:**
- Create: `app/api/webhook/whatsapp/sync/route.ts`

**Step 1: Implement the sync endpoint**

```typescript
/**
 * POST /api/webhook/whatsapp/sync
 * Bulk ingests WhatsApp messages from the relay's SQLite store into Supabase.
 * Called by the relay on: (1) history sync completion, (2) periodic batch sync.
 * Idempotent — uses upsert on (client_id, message_id, chat_jid).
 * @module app/api/webhook/whatsapp/sync/route
 */
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 60;

interface SyncPayload {
  clientId: string;
  chats: Array<{
    jid: string;
    name: string | null;
    lastMessageTime: string | null;
  }>;
  messages: Array<{
    id: string;
    chatJid: string;
    sender: string | null;
    content: string | null;
    timestamp: string;
    isFromMe: boolean;
    mediaType: string | null;
  }>;
}

export async function POST(request: Request): Promise<Response> {
  // Verify relay secret
  const secret = (process.env.WHATSAPP_RELAY_SECRET ?? "").trim();
  if (secret) {
    const headerSecret = request.headers.get("X-Relay-Secret");
    if (headerSecret !== secret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let body: SyncPayload;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const supabase = await createAdminClient();

  // Upsert chats
  if (body.chats.length > 0) {
    const chatRows = body.chats.map((c) => ({
      client_id: body.clientId,
      jid: c.jid,
      name: c.name,
      last_message_time: c.lastMessageTime,
    }));

    await supabase
      .from("whatsapp_chats")
      .upsert(chatRows, { onConflict: "client_id,jid" });
  }

  // Upsert messages (batch in chunks of 500)
  if (body.messages.length > 0) {
    const msgRows = body.messages.map((m) => ({
      client_id: body.clientId,
      message_id: m.id,
      chat_jid: m.chatJid,
      sender: m.sender,
      content: m.content,
      timestamp: m.timestamp,
      is_from_me: m.isFromMe,
      media_type: m.mediaType,
    }));

    for (let i = 0; i < msgRows.length; i += 500) {
      const batch = msgRows.slice(i, i + 500);
      await supabase
        .from("whatsapp_messages")
        .upsert(batch, { onConflict: "client_id,message_id,chat_jid" });
    }
  }

  return Response.json({
    synced: { chats: body.chats.length, messages: body.messages.length },
  });
}
```

**Step 2: Commit**

```bash
git add app/api/webhook/whatsapp/sync/route.ts
git commit -m "feat(pr45): add WhatsApp message sync endpoint (bulk upsert from relay)"
```

---

## Task 3: Agent tools — WhatsApp inbox queries

**Files:**
- Create: `src/lib/channels/whatsapp/inbox.ts`
- Create: `src/lib/channels/whatsapp/inbox.test.ts`
- Create: `src/lib/runner/tools/whatsapp-inbox.ts`

**Step 1: Write failing tests for query functions**

```typescript
// src/lib/channels/whatsapp/inbox.test.ts
import { describe, expect, it } from "vitest";

import { buildMessageSearchQuery, formatMessageForAgent } from "./inbox";

describe("buildMessageSearchQuery", () => {
  it("builds base query with client_id", () => {
    const q = buildMessageSearchQuery({ clientId: "abc" });
    expect(q.filters).toContainEqual({ column: "client_id", value: "abc" });
  });

  it("adds contact filter when provided", () => {
    const q = buildMessageSearchQuery({
      clientId: "abc",
      contact: "6591234567",
    });
    expect(q.filters).toContainEqual({
      column: "chat_jid",
      value: "6591234567@s.whatsapp.net",
    });
  });

  it("adds date range when provided", () => {
    const q = buildMessageSearchQuery({
      clientId: "abc",
      after: "2026-03-01",
    });
    expect(q.filters.some((f) => f.column === "timestamp" && f.op === "gte")).toBe(true);
  });
});

describe("formatMessageForAgent", () => {
  it("formats a message as readable text", () => {
    const result = formatMessageForAgent({
      sender: "6591234567",
      content: "Hello",
      timestamp: "2026-03-15T10:00:00Z",
      is_from_me: false,
      chat_name: "Sarah",
    });
    expect(result).toContain("Sarah");
    expect(result).toContain("Hello");
  });

  it("labels outbound messages as 'You'", () => {
    const result = formatMessageForAgent({
      sender: "me",
      content: "Hi",
      timestamp: "2026-03-15T10:00:00Z",
      is_from_me: true,
      chat_name: null,
    });
    expect(result).toContain("You");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/channels/whatsapp/inbox.test.ts
```

**Step 3: Implement inbox.ts**

```typescript
/**
 * WhatsApp inbox query functions for agent tools.
 * Queries whatsapp_messages and whatsapp_chats in Supabase.
 * Pattern from whatsapp-mcp/whatsapp-mcp-server/whatsapp.py.
 * @module lib/channels/whatsapp/inbox
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type Filter = {
  column: string;
  value: string;
  op?: "eq" | "gte" | "lte" | "like";
};

export function buildMessageSearchQuery(params: {
  clientId: string;
  contact?: string;
  query?: string;
  after?: string;
  before?: string;
  limit?: number;
}): { filters: Filter[]; limit: number } {
  const filters: Filter[] = [
    { column: "client_id", value: params.clientId },
  ];

  if (params.contact) {
    const jid = params.contact.replace(/[\s\-\(\)+]/g, "");
    filters.push({
      column: "chat_jid",
      value: jid.includes("@") ? jid : `${jid}@s.whatsapp.net`,
    });
  }

  if (params.after) {
    filters.push({ column: "timestamp", value: params.after, op: "gte" });
  }

  if (params.before) {
    filters.push({ column: "timestamp", value: params.before, op: "lte" });
  }

  return { filters, limit: params.limit ?? 50 };
}

export function formatMessageForAgent(msg: {
  sender: string | null;
  content: string | null;
  timestamp: string;
  is_from_me: boolean;
  chat_name: string | null;
}): string {
  const time = new Date(msg.timestamp).toLocaleString("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const who = msg.is_from_me ? "You" : (msg.chat_name ?? msg.sender ?? "Unknown");
  return `[${time}] ${who}: ${msg.content ?? "(media)"}`;
}

/** Searches WhatsApp messages with optional filters. */
export async function searchWhatsAppMessages(
  supabase: SupabaseClient<Database>,
  clientId: string,
  params: { query?: string; contact?: string; after?: string; before?: string; limit?: number },
): Promise<{ success: true; messages: string[] } | { success: false; error: string }> {
  try {
    let q = supabase
      .from("whatsapp_messages")
      .select("message_id, chat_jid, sender, content, timestamp, is_from_me")
      .eq("client_id", clientId)
      .order("timestamp", { ascending: false })
      .limit(params.limit ?? 50);

    if (params.contact) {
      const jid = params.contact.replace(/[\s\-\(\)+]/g, "");
      q = q.eq("chat_jid", jid.includes("@") ? jid : `${jid}@s.whatsapp.net`);
    }

    if (params.after) q = q.gte("timestamp", params.after);
    if (params.before) q = q.lte("timestamp", params.before);
    if (params.query) q = q.ilike("content", `%${params.query}%`);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    // Enrich with chat names
    const chatJids = [...new Set((data ?? []).map((m) => m.chat_jid))];
    const { data: chats } = await supabase
      .from("whatsapp_chats")
      .select("jid, name")
      .eq("client_id", clientId)
      .in("jid", chatJids);

    const chatNameMap = new Map((chats ?? []).map((c) => [c.jid, c.name]));

    const messages = (data ?? []).map((m) =>
      formatMessageForAgent({
        sender: m.sender,
        content: m.content,
        timestamp: m.timestamp,
        is_from_me: m.is_from_me,
        chat_name: chatNameMap.get(m.chat_jid) ?? null,
      }),
    );

    return { success: true, messages };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/** Lists WhatsApp chats with last message preview. */
export async function listWhatsAppChats(
  supabase: SupabaseClient<Database>,
  clientId: string,
  params: { query?: string; limit?: number },
): Promise<{ success: true; chats: Array<{ jid: string; name: string | null; lastMessageTime: string | null }> } | { success: false; error: string }> {
  try {
    let q = supabase
      .from("whatsapp_chats")
      .select("jid, name, last_message_time")
      .eq("client_id", clientId)
      .order("last_message_time", { ascending: false })
      .limit(params.limit ?? 30);

    if (params.query) {
      q = q.or(`name.ilike.%${params.query}%,jid.ilike.%${params.query}%`);
    }

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    return {
      success: true,
      chats: (data ?? []).map((c) => ({
        jid: c.jid,
        name: c.name,
        lastMessageTime: c.last_message_time,
      })),
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/** Gets recent message history with a specific contact. */
export async function getWhatsAppContactHistory(
  supabase: SupabaseClient<Database>,
  clientId: string,
  phone: string,
  limit: number = 20,
): Promise<{ success: true; messages: string[] } | { success: false; error: string }> {
  return searchWhatsAppMessages(supabase, clientId, {
    contact: phone,
    limit,
  });
}
```

**Step 4: Run tests**

```bash
npx vitest run src/lib/channels/whatsapp/inbox.test.ts
```

**Step 5: Implement agent tool definitions**

```typescript
// src/lib/runner/tools/whatsapp-inbox.ts
/**
 * Agent tools for querying WhatsApp message history.
 * @module lib/runner/tools/whatsapp-inbox
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { tool } from "ai";

import type { Database } from "@/types/database";
import {
  searchWhatsAppMessages,
  listWhatsAppChats,
  getWhatsAppContactHistory,
} from "@/lib/channels/whatsapp/inbox";

export function createWhatsAppInboxTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  return {
    search_whatsapp_messages: tool({
      description:
        "Search the user's WhatsApp messages by keyword, contact, or date range. Use this when the user asks about their WhatsApp conversations.",
      parameters: z.object({
        query: z.string().optional().describe("Text to search for in message content"),
        contact: z.string().optional().describe("Phone number or name to filter by"),
        after: z.string().optional().describe("ISO date — only messages after this date"),
        before: z.string().optional().describe("ISO date — only messages before this date"),
        limit: z.number().optional().describe("Max results (default 50)"),
      }),
      execute: async (params) =>
        searchWhatsAppMessages(supabase, clientId, params),
    }),

    list_whatsapp_chats: tool({
      description:
        "List the user's WhatsApp conversations, sorted by most recent. Use this when the user asks 'who have I been chatting with?' or 'show my WhatsApp conversations'.",
      parameters: z.object({
        query: z.string().optional().describe("Filter chats by name or phone number"),
        limit: z.number().optional().describe("Max results (default 30)"),
      }),
      execute: async (params) =>
        listWhatsAppChats(supabase, clientId, params),
    }),

    get_whatsapp_contact_history: tool({
      description:
        "Get recent WhatsApp message history with a specific contact. Use this when the user asks 'what did X say?' or 'show my chat with X'.",
      parameters: z.object({
        phone: z.string().describe("Phone number (e.g., 6591234567) or WhatsApp JID"),
        limit: z.number().optional().describe("Number of recent messages (default 20)"),
      }),
      execute: async (params) =>
        getWhatsAppContactHistory(supabase, clientId, params.phone, params.limit),
    }),
  };
}
```

**Step 6: Commit**

```bash
git add src/lib/channels/whatsapp/inbox.ts src/lib/channels/whatsapp/inbox.test.ts src/lib/runner/tools/whatsapp-inbox.ts
git commit -m "feat(pr45): add WhatsApp inbox query tools (search, list chats, contact history)"
```

---

## Task 4: Wire tools into runner + system prompt

**Files:**
- Modify: `src/lib/runner/tool-registry.ts` — add `createWhatsAppInboxTools`
- Modify: `src/lib/ai/system-prompt.ts` — add tool descriptions

**Step 1: Register tools**

In `tool-registry.ts`, add WhatsApp inbox tools to the tool set when the client has WhatsApp connected:

```typescript
import { createWhatsAppInboxTools } from "@/lib/runner/tools/whatsapp-inbox";

// In createRunnerTools(), after existing tools:
// Check if client has WhatsApp connected
const { data: waMapping } = await supabase
  .from("conversation_channel_mappings")
  .select("mapping_id")
  .eq("client_id", clientId)
  .eq("channel", "whatsapp")
  .maybeSingle();

if (waMapping) {
  const waInboxTools = createWhatsAppInboxTools(supabase, clientId);
  Object.assign(tools, waInboxTools);
}
```

**Step 2: Add to system prompt**

In the tool descriptions section of `system-prompt.ts`:

```
## WhatsApp Inbox (available when WhatsApp is connected)
- search_whatsapp_messages: Search messages by keyword, contact, or date range
- list_whatsapp_chats: List conversations sorted by most recent
- get_whatsapp_contact_history: Get message history with a specific contact
```

**Step 3: Commit**

```bash
git add src/lib/runner/tool-registry.ts src/lib/ai/system-prompt.ts
git commit -m "feat(pr45): wire WhatsApp inbox tools into runner and system prompt"
```

---

## Task 5: Add sync call to Go bridge fork

The relay needs to periodically sync its SQLite messages to Sunder's `/api/webhook/whatsapp/sync` endpoint. Add this to the forked Go bridge.

**Files:**
- Modify: `whatsapp-bridge/main.go` (in the forked repo)

**Step 1: Add sync goroutine**

In the Go bridge, add a periodic sync that:
1. Runs on first connect (after history sync completes)
2. Runs every 5 minutes thereafter
3. Queries SQLite for messages since last sync timestamp
4. POSTs batch to Sunder's sync endpoint

```go
// After successful connection:
go func() {
    syncURL := os.Getenv("SUNDER_SYNC_URL") // e.g., https://sunder.app/api/webhook/whatsapp/sync
    if syncURL == "" {
        return
    }

    // Initial sync (all messages)
    syncMessages(syncURL, clientID, 0)

    // Periodic sync every 5 minutes
    ticker := time.NewTicker(5 * time.Minute)
    for range ticker.C {
        syncMessages(syncURL, clientID, lastSyncTimestamp)
    }
}()

func syncMessages(syncURL, clientID string, since int64) {
    // Query SQLite for messages + chats since timestamp
    // POST to syncURL as SyncPayload JSON
    // Update lastSyncTimestamp
}
```

**Step 2: Commit (in fork repo)**

```bash
git commit -m "feat: add periodic message sync to Sunder"
```

---

## Task 6: Voice note transcription

When a voice note arrives on WhatsApp, the relay downloads it and includes the audio URL in the webhook payload. The Sunder webhook passes it as a `filePart` to `runAgent()` — Gemini Flash transcribes it natively (multimodal).

**Files:**
- Modify: `app/api/webhook/whatsapp/route.ts`

**Step 1: Add media URL handling**

In the webhook route, extend the payload to accept an optional `mediaUrl` + `mediaType`:

```typescript
// In the POST handler, after parsing body:
const fileParts: RunnerFilePart[] = [];

if (body.mediaUrl && body.mediaType) {
  fileParts.push({
    type: "file",
    url: body.mediaUrl,
    mediaType: body.mediaType,
  });
}

// Pass to runAgent:
const result = await runAgent(
  {
    clientId: mapping.client_id,
    threadId: mapping.thread_id,
    triggerType: "chat",
    consumeMessageQuota: true,
    input: text || "(voice note)",
    ...(fileParts.length > 0 ? { fileParts } : {}),
  },
  supabase,
);
```

The relay's Go bridge needs a corresponding change: when a voice/audio message arrives, download it via whatsmeow, upload to a temporary URL (or Supabase Storage), and include `mediaUrl` + `mediaType` in the webhook payload.

**Step 2: Commit**

```bash
git add app/api/webhook/whatsapp/route.ts
git commit -m "feat(pr45): add voice note transcription support via Gemini multimodal"
```

---

## Task 7: Update barrel exports

```typescript
// src/lib/channels/whatsapp/index.ts — add:
export {
  searchWhatsAppMessages,
  listWhatsAppChats,
  getWhatsAppContactHistory,
  formatMessageForAgent,
  buildMessageSearchQuery,
} from "./inbox";
```

**Commit:**

```bash
git add src/lib/channels/whatsapp/index.ts
git commit -m "feat(pr45): update WhatsApp barrel exports with inbox query functions"
```

---

## Task 8: Integration test (manual)

**Prerequisites:** PR 43 complete (relay deployed, WhatsApp connected, messages syncing).

**Test: Message search**

1. In web chat or Telegram, ask: "What did Sarah say about the Parc Clematis viewing?"
2. Verify agent calls `search_whatsapp_messages` with query + contact
3. Verify agent returns matching WhatsApp messages with timestamps

**Test: Chat listing**

1. Ask: "List my recent WhatsApp conversations"
2. Verify agent calls `list_whatsapp_chats`
3. Verify agent returns chat list with names and last message times

**Test: Contact history**

1. Ask: "Show my chat with +6591234567"
2. Verify agent calls `get_whatsapp_contact_history`
3. Verify agent returns chronological message history

**Test: Voice note**

1. Send a voice note on WhatsApp saying "Please check if the Tanjong Pagar unit is still available"
2. Verify agent receives transcription and responds appropriately

**Test criteria from v2 plan:**
- [ ] Ask agent "what did Sarah say last week?" — returns matching WhatsApp messages
- [ ] Ask agent "list my WhatsApp conversations" — returns chat list with last message
- [ ] Ask agent "show my chat with +6591234567" — returns chronological message history
- [ ] Send voice note on WhatsApp — agent receives transcription and responds
