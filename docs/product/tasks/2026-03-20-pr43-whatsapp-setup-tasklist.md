# WhatsApp Integration — Fly Relay + Webhook + Pairing Implementation Plan

**PR:** PR 43: WhatsApp integration — Fly relay + webhook + pairing
**Decisions:** GAP-09, UX-07
**Depends on:** PR 41 (Telegram bot setup — channel infrastructure patterns)
**Goal:** User can pair their WhatsApp via QR code and chat with the Sunder agent.

**Architecture:** Fork [lharries/whatsapp-mcp](https://github.com/lharries/whatsapp-mcp) Go bridge as the relay. It already handles: whatsmeow socket, QR auth, message capture into SQLite, history sync, REST API (`/api/send`, `/api/download`). We add ~15 lines of Go (webhook POST on new messages) + a `/qr` HTTP endpoint for Settings UI. Deploy to Fly ($2/mo). Sunder's webhook mirrors the Telegram pattern (channel_mappings → dedupe → runAgent → return response). Formatting copied from dorabot. See drift analysis: `roadmap docs/Sunder - Source of Truth/references/nanoclaw-dorabot/dorabot-whatsapp-drift-analysis.md`.

**Tech Stack:** whatsmeow (Go, via whatsapp-mcp fork) on Fly relay, dorabot format.ts/send.ts patterns, Vitest, Supabase, Next.js App Router, Vercel Functions, Fly.io

**Reference repos:**
- `/Users/sethlim/Documents/whatsapp-mcp/` — Go bridge (fork this for relay)
- `/Users/sethlim/Documents/dorabot-1/src/channels/whatsapp/` — format.ts and send.ts

---

## Relevant Files

### Create
- `src/lib/channels/whatsapp/format.ts` — markdown → WhatsApp format (copied from dorabot)
- `src/lib/channels/whatsapp/format.test.ts`
- `src/lib/channels/whatsapp/send.ts` — JID normalization, chunking, send/edit/delete, media (copied from dorabot)
- `src/lib/channels/whatsapp/send.test.ts`
- `src/lib/channels/whatsapp/index.ts` — barrel exports
- `app/api/webhook/whatsapp/route.ts` — webhook handler (mirrors Telegram)
- `app/(dashboard)/settings/whatsapp-connect-card.tsx` — QR code pairing UI
- `app/api/whatsapp/disconnect/route.ts` — DELETE endpoint for unpairing

### Fork (separate repo)
- Fork `lharries/whatsapp-mcp` → modify Go bridge (~30 lines: webhook forwarder + QR/status/disconnect endpoints)

### Modify
- `app/(dashboard)/settings/page.tsx` — add WhatsApp card

### Reference (read, don't modify)
- `app/api/webhook/telegram/route.ts` — mirror this for WhatsApp (after PR 41)
- `app/(dashboard)/settings/telegram-connect-card.tsx` — mirror this for WhatsApp
- `src/lib/runner/run-agent.ts` — same `runAgent()` call
- `supabase/migrations/20260304213000_create_channel_mappings_and_delivery_receipts.sql` — already supports `'whatsapp'`

---

## Task 1: WhatsApp message formatting (markdownToWhatsApp)

48 lines copied from dorabot. Simpler than Telegram (no HTML — just `*bold*`, `_italic_`, `~strike~`, `` `code` ``).

**Files:**
- Create: `src/lib/channels/whatsapp/format.ts`
- Create: `src/lib/channels/whatsapp/format.test.ts`

**Step 1: Write failing tests**

```typescript
// src/lib/channels/whatsapp/format.test.ts
import { describe, expect, it } from "vitest";

import { markdownToWhatsApp } from "./format";

describe("markdownToWhatsApp", () => {
  it("converts **bold** to *bold*", () => {
    expect(markdownToWhatsApp("**hello**")).toBe("*hello*");
  });

  it("converts __bold__ to *bold*", () => {
    expect(markdownToWhatsApp("__hello__")).toBe("*hello*");
  });

  it("converts *italic* to _italic_", () => {
    expect(markdownToWhatsApp("*hello*")).toBe("_hello_");
  });

  it("converts ~~strike~~ to ~strike~", () => {
    expect(markdownToWhatsApp("~~hello~~")).toBe("~hello~");
  });

  it("converts markdown links to text (url)", () => {
    expect(markdownToWhatsApp("[click](https://example.com)")).toBe(
      "click (https://example.com)",
    );
  });

  it("converts headings to *bold*", () => {
    expect(markdownToWhatsApp("## Title")).toBe("*Title*");
  });

  it("preserves code blocks", () => {
    const input = "```\ncode here\n```";
    const result = markdownToWhatsApp(input);
    expect(result).toContain("```");
    expect(result).toContain("code here");
  });

  it("preserves inline code", () => {
    expect(markdownToWhatsApp("`code`")).toBe("`code`");
  });

  it("strips HTML tags", () => {
    expect(markdownToWhatsApp("<b>bold</b>")).toBe("bold");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/channels/whatsapp/format.test.ts
```

Expected: FAIL — module `./format` not found.

**Step 3: Implement format.ts**

Copy from dorabot verbatim. Add file-level JSDoc:

```typescript
/**
 * Markdown → WhatsApp format conversion.
 * Copied from dorabot/src/channels/whatsapp/format.ts with zero drift.
 * WhatsApp supports: *bold*, _italic_, ~strikethrough~, ```code```, > quote
 * @module lib/channels/whatsapp/format
 */

// [paste exact contents of dorabot format.ts]
// See: /Users/sethlim/Documents/dorabot-1/src/channels/whatsapp/format.ts
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/channels/whatsapp/format.test.ts
```

Expected: All PASS.

**Step 5: Commit**

```bash
git add src/lib/channels/whatsapp/format.ts src/lib/channels/whatsapp/format.test.ts
git commit -m "feat(pr43): add WhatsApp message formatting (markdown→WhatsApp)"
```

---

## Task 2: WhatsApp message sending + JID normalization + chunking

131 lines copied from dorabot. Includes media dispatch, edit, delete.

**Files:**
- Create: `src/lib/channels/whatsapp/send.ts`
- Create: `src/lib/channels/whatsapp/send.test.ts`
- Create: `src/lib/channels/whatsapp/index.ts`

**Step 1: Write failing tests for pure functions**

```typescript
// src/lib/channels/whatsapp/send.test.ts
import { describe, expect, it } from "vitest";

import { toWhatsAppJid, splitWhatsAppMessage } from "./send";

describe("toWhatsAppJid", () => {
  it("converts phone number to JID", () => {
    expect(toWhatsAppJid("6591234567")).toBe("6591234567@s.whatsapp.net");
  });

  it("strips + prefix", () => {
    expect(toWhatsAppJid("+6591234567")).toBe("6591234567@s.whatsapp.net");
  });

  it("strips spaces, dashes, parens", () => {
    expect(toWhatsAppJid("+65 9123-4567")).toBe("6591234567@s.whatsapp.net");
  });

  it("preserves group JID as-is", () => {
    expect(toWhatsAppJid("123456789@g.us")).toBe("123456789@g.us");
  });

  it("strips whatsapp: prefix", () => {
    expect(toWhatsAppJid("whatsapp:6591234567")).toBe(
      "6591234567@s.whatsapp.net",
    );
  });

  it("appends @s.whatsapp.net if missing", () => {
    expect(toWhatsAppJid("6591234567")).toContain("@s.whatsapp.net");
  });
});

describe("splitWhatsAppMessage", () => {
  it("returns single chunk for short text", () => {
    expect(splitWhatsAppMessage("hello")).toEqual(["hello"]);
  });

  it("splits at paragraph boundary", () => {
    const text = "a".repeat(50000) + "\n\n" + "b".repeat(5000);
    const chunks = splitWhatsAppMessage(text);
    expect(chunks.length).toBe(2);
  });

  it("respects custom limit", () => {
    const text = "hello world";
    expect(splitWhatsAppMessage(text, 5)).toEqual(["hello", "world"]);
  });

  it("default limit is 60000", () => {
    const text = "a".repeat(59999);
    expect(splitWhatsAppMessage(text).length).toBe(1);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/channels/whatsapp/send.test.ts
```

Expected: FAIL — module `./send` not found.

**Step 3: Implement send.ts**

Copy from dorabot verbatim. All functions:
- `toWhatsAppJid()`
- `splitWhatsAppMessage()`
- `buildMediaContent()`
- `sendWhatsAppMessage()`
- `editWhatsAppMessage()`
- `deleteWhatsAppMessage()`

Remove `.js` from import. Add file-level JSDoc. Keep all functions.

**Note:** `sendWhatsAppMessage`, `editWhatsAppMessage`, and `deleteWhatsAppMessage` take a `WASocket` parameter. In Sunder, these are called on the Fly relay side, not on the Vercel webhook side. The webhook returns response text to the relay, and the relay calls these functions. Export them anyway — the relay will import them.

**Step 4: Create barrel export**

```typescript
// src/lib/channels/whatsapp/index.ts
/**
 * WhatsApp channel integration.
 * @module lib/channels/whatsapp
 */
export { markdownToWhatsApp } from "./format";
export {
  toWhatsAppJid,
  splitWhatsAppMessage,
  sendWhatsAppMessage,
  editWhatsAppMessage,
  deleteWhatsAppMessage,
} from "./send";
```

**Step 5: Run tests to verify they pass**

```bash
npx vitest run src/lib/channels/whatsapp/send.test.ts
```

Expected: All PASS.

**Step 6: Commit**

```bash
git add src/lib/channels/whatsapp/send.ts src/lib/channels/whatsapp/send.test.ts src/lib/channels/whatsapp/index.ts
git commit -m "feat(pr43): add WhatsApp JID normalization, message sending, and chunking"
```

---

## Task 3: Fly relay service (fork whatsapp-mcp Go bridge)

Fork [lharries/whatsapp-mcp](https://github.com/lharries/whatsapp-mcp) and modify the Go bridge. It already has: whatsmeow socket, QR auth, SQLite message storage, history sync, REST API. We add a webhook forwarder + QR HTTP endpoint.

**Files:**
- Fork: `github.com/lharries/whatsapp-mcp` → `github.com/sunder-ai/whatsapp-relay` (or similar)
- Modify: `whatsapp-bridge/main.go` — add webhook POST in `handleMessage` (~15 lines)
- Create: `whatsapp-bridge/qr_endpoint.go` — serve QR code as PNG via HTTP (for Settings UI)
- Create: `Dockerfile` (if not already present)
- Create: `fly.toml`

**Step 1: Fork the repo**

```bash
# Fork lharries/whatsapp-mcp on GitHub, then clone
git clone https://github.com/sunder-ai/whatsapp-relay.git
cd whatsapp-relay
```

The Go bridge is in `whatsapp-bridge/`. It already has:
- `main.go` — whatsmeow socket, QR auth, SQLite message storage, history sync, REST API
- `go.mod` / `go.sum` — dependencies (whatsmeow, go-sqlite3)

**Step 2: Add webhook forwarder to handleMessage**

In `whatsapp-bridge/main.go`, find the `handleMessage` function. After the existing `messageStore.StoreMessage(...)` call, add:

```go
// Forward to Sunder webhook
go func() {
    webhookURL := os.Getenv("SUNDER_WEBHOOK_URL")
    webhookSecret := os.Getenv("SUNDER_WEBHOOK_SECRET")
    if webhookURL == "" {
        return
    }

    senderPhone := ""
    if evt.Info.IsGroup {
        return // Skip groups for v1
    }
    senderPhone = evt.Info.Sender.User

    payload, _ := json.Marshal(map[string]interface{}{
        "phone":     senderPhone,
        "text":      content,
        "messageId": evt.Info.ID,
        "timestamp": evt.Info.Timestamp.UnixMilli(),
    })

    req, _ := http.NewRequest("POST", webhookURL, bytes.NewReader(payload))
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("X-Relay-Secret", webhookSecret)

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        log.Printf("[webhook] Error forwarding: %v", err)
        return
    }
    defer resp.Body.Close()

    // Parse response and send reply
    var result struct {
        Text string `json:"text"`
    }
    if err := json.NewDecoder(resp.Body).Decode(&result); err == nil && result.Text != "" {
        jid := evt.Info.Sender
        client.SendMessage(context.Background(), jid, &waProto.Message{
            Conversation: proto.String(result.Text),
        })
    }
}()
```

**Step 3: Add /qr HTTP endpoint**

The existing Go bridge has an HTTP server. Add a handler that serves the current QR code as a PNG:

```go
// In the HTTP handler setup section of main.go
http.HandleFunc("/qr", func(w http.ResponseWriter, r *http.Request) {
    if isConnected {
        json.NewEncoder(w).Encode(map[string]interface{}{"connected": true, "qr": nil})
        return
    }
    if currentQR == "" {
        json.NewEncoder(w).Encode(map[string]interface{}{"connected": false, "qr": nil})
        return
    }
    // Return QR as JSON string (Settings UI renders with a JS QR library)
    json.NewEncoder(w).Encode(map[string]interface{}{"connected": false, "qr": currentQR})
})

http.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
    json.NewEncoder(w).Encode(map[string]interface{}{
        "connected": isConnected,
        "phone":     connectedPhone,
    })
})

http.HandleFunc("/disconnect", func(w http.ResponseWriter, r *http.Request) {
    if client != nil {
        client.Disconnect()
    }
    json.NewEncoder(w).Encode(map[string]interface{}{"ok": true})
})
```

Add module-level vars to track QR and connection state:

```go
var (
    currentQR      string
    isConnected    bool
    connectedPhone string
)
```

Update the QR callback to set `currentQR`, and the connection callback to set `isConnected`/`connectedPhone`.

**Step 4: Create Dockerfile**

```dockerfile
FROM golang:1.22-alpine AS builder
RUN apk add --no-cache gcc musl-dev sqlite-dev
WORKDIR /app
COPY whatsapp-bridge/ .
RUN CGO_ENABLED=1 go build -o relay .

FROM alpine:3.19
RUN apk add --no-cache sqlite-libs ca-certificates
WORKDIR /app
COPY --from=builder /app/relay .
EXPOSE 8080
CMD ["./relay"]
```

**Step 5: Create fly.toml**

```toml
app = "sunder-whatsapp-relay"
primary_region = "sin"

[build]

[http_service]
  internal_port = 8080
  force_https = true

[mounts]
  source = "wa_store"
  destination = "/data"
```

**Step 6: Deploy**

```bash
cd whatsapp-relay
fly launch --no-deploy
fly volumes create wa_store --size 1 --region sin
fly secrets set SUNDER_WEBHOOK_URL=https://sunder.app/api/webhook/whatsapp SUNDER_WEBHOOK_SECRET=your-secret
fly deploy
```

**Step 7: Verify**

```bash
# Check health
curl https://sunder-whatsapp-relay.fly.dev/status
# Should return: {"connected": false, "phone": null}

# Get QR (when not connected)
curl https://sunder-whatsapp-relay.fly.dev/qr
# Should return: {"connected": false, "qr": "2@...base64..."}
```

**Step 8: Commit**

```bash
git add .
git commit -m "feat(pr43): fork whatsapp-mcp Go bridge, add webhook forwarder + QR endpoint"
```

---

## Task 4: WhatsApp webhook route

Mirrors the Telegram webhook route. Receives forwarded messages from the Fly relay, routes to agent.

**Files:**
- Create: `app/api/webhook/whatsapp/route.ts`

**Step 1: Implement the webhook route**

```typescript
/**
 * POST /api/webhook/whatsapp
 * Receives messages forwarded from the Fly WhatsApp relay.
 * Mirrors Telegram webhook pattern: verify → dedupe → map → runAgent → return response.
 * @module app/api/webhook/whatsapp/route
 */
import { createAdminClient } from "@/lib/supabase/server";
import { markdownToWhatsApp } from "@/lib/channels/whatsapp";
import { runAgent } from "@/lib/runner/run-agent";

export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  // 1. Verify relay secret
  const secret = (process.env.WHATSAPP_RELAY_SECRET ?? "").trim();
  if (secret) {
    const headerSecret = request.headers.get("X-Relay-Secret");
    if (headerSecret !== secret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  // 2. Parse payload from relay
  let body: { phone: string; text: string; messageId: string; timestamp: number };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const { phone, text, messageId, timestamp } = body;
  if (!phone || !text?.trim()) {
    return Response.json({ text: null });
  }

  const supabase = await createAdminClient();

  // 3. Handle /new command
  if (text.trim() === "/new") {
    return handleNewCommand(supabase, phone);
  }

  // 4. Lookup channel mapping → client_id + thread_id
  const { data: mapping } = await supabase
    .from("conversation_channel_mappings")
    .select("client_id, thread_id")
    .eq("channel", "whatsapp")
    .eq("external_conversation_id", phone)
    .maybeSingle();

  if (!mapping) {
    return Response.json({
      text: "Please connect your account first. Use the QR code from your Sunder dashboard.",
    });
  }

  // 5. Deduplicate
  if (messageId) {
    const { error: dedupeError } = await supabase
      .from("conversation_channel_delivery_receipts")
      .insert({
        client_id: mapping.client_id,
        channel: "whatsapp",
        delivery_id: messageId,
        thread_id: mapping.thread_id,
      });

    if (dedupeError?.code === "23505") {
      return Response.json({ text: null }); // Already processed
    }
  }

  // 6. Check for pending approval response
  const approvalResponse = parseApprovalResponse(text.trim());
  if (approvalResponse !== null) {
    // Look up most recent pending approval for this client
    const { data: pendingApproval } = await supabase
      .from("approval_events")
      .select("approval_id")
      .eq("client_id", mapping.client_id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingApproval) {
      const { resolveApprovalEvent } = await import("@/lib/approvals/queries");
      await resolveApprovalEvent(supabase, {
        clientId: mapping.client_id,
        approvalId: pendingApproval.approval_id,
        approved: approvalResponse,
      });
      return Response.json({
        text: approvalResponse ? "✅ Approved" : "❌ Denied",
      });
    }
  }

  // 7. Call runAgent
  try {
    const result = await runAgent(
      {
        clientId: mapping.client_id,
        threadId: mapping.thread_id,
        triggerType: "chat",
        consumeMessageQuota: true,
        input: text,
      },
      supabase,
    );

    if (result.status === "queued") {
      return Response.json({ text: null });
    }

    const fullResponse = await result.streamResult.text;
    const formatted = markdownToWhatsApp(fullResponse.trim());

    return Response.json({ text: formatted || null });
  } catch (error) {
    console.error("[whatsapp/webhook] runAgent error:", error);
    return Response.json({ text: "Sorry, something went wrong. Please try again." });
  }
}

/** Parses approval responses: 1/allow/yes/y → true, 2/deny/no/n → false, else null */
function parseApprovalResponse(text: string): boolean | null {
  const lower = text.toLowerCase();
  if (["1", "allow", "yes", "y"].includes(lower)) return true;
  if (["2", "deny", "no", "n"].includes(lower)) return false;
  return null;
}

async function handleNewCommand(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  phone: string,
): Promise<Response> {
  const { data: mapping } = await supabase
    .from("conversation_channel_mappings")
    .select("mapping_id, client_id")
    .eq("channel", "whatsapp")
    .eq("external_conversation_id", phone)
    .maybeSingle();

  if (!mapping) {
    return Response.json({ text: "Please connect your account first." });
  }

  const { data: thread, error } = await supabase
    .from("conversation_threads")
    .insert({ client_id: mapping.client_id, title: "WhatsApp" })
    .select("thread_id")
    .single();

  if (error || !thread) {
    return Response.json({ text: "Something went wrong. Please try again." });
  }

  await supabase
    .from("conversation_channel_mappings")
    .update({ thread_id: thread.thread_id })
    .eq("mapping_id", mapping.mapping_id);

  return Response.json({ text: "New conversation started." });
}
```

**Step 2: Commit**

```bash
git add app/api/webhook/whatsapp/route.ts
git commit -m "feat(pr43): add WhatsApp webhook route (mirrors Telegram pattern)"
```

---

## Task 5: QR code pairing — Settings UI

The Settings card polls the Fly relay's `/qr` endpoint and displays the QR code. Once connected, shows status.

**Files:**
- Create: `app/(dashboard)/settings/whatsapp-connect-card.tsx`
- Modify: `app/(dashboard)/settings/page.tsx`

**Step 1: Create the WhatsApp connect card**

```typescript
// app/(dashboard)/settings/whatsapp-connect-card.tsx
"use client";

/**
 * Settings card for connecting/disconnecting WhatsApp via QR code.
 * Polls the Fly relay's /qr and /status endpoints.
 * @module app/(dashboard)/settings/whatsapp-connect-card
 */
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface WhatsAppConnectCardProps {
  isConnected: boolean;
  relayUrl: string | null;
}

export function WhatsAppConnectCard({
  isConnected: initialConnected,
  relayUrl,
}: WhatsAppConnectCardProps) {
  const [isConnected, setIsConnected] = useState(initialConnected);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [isPairing, setIsPairing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll for QR code and connection status while pairing
  useEffect(() => {
    if (!isPairing || !relayUrl) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${relayUrl}/status`);
        const data = await res.json();
        if (data.connected) {
          setIsConnected(true);
          setIsPairing(false);
          setQrUrl(null);
          // TODO: Create channel_mapping via API call
        }
      } catch {}
    }, 3000);

    return () => clearInterval(interval);
  }, [isPairing, relayUrl]);

  async function handleStartPairing() {
    if (!relayUrl) {
      setError("WhatsApp relay not configured.");
      return;
    }
    setIsPairing(true);
    setError(null);
    setQrUrl(`${relayUrl}/qr?t=${Date.now()}`);
  }

  async function handleDisconnect() {
    setIsLoading(true);
    setError(null);
    try {
      // Delete channel mapping
      const res = await fetch("/api/whatsapp/disconnect", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect");

      // Tell relay to disconnect
      if (relayUrl) {
        await fetch(`${relayUrl}/disconnect`, { method: "POST" }).catch(() => {});
      }

      setIsConnected(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>WhatsApp</CardTitle>
        <CardDescription>
          {isConnected
            ? "Your WhatsApp is connected."
            : "Connect WhatsApp to chat with your agent on mobile."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isConnected ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connected. Send a message on WhatsApp to chat.
            </p>
            <Button
              variant="outline"
              onClick={handleDisconnect}
              disabled={isLoading}
            >
              {isLoading ? "Disconnecting..." : "Disconnect WhatsApp"}
            </Button>
          </div>
        ) : isPairing && qrUrl ? (
          <div className="space-y-2">
            <p className="text-sm">
              Scan this QR code with WhatsApp (Linked Devices):
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl}
              alt="WhatsApp QR Code"
              className="w-64 h-64 border rounded"
            />
            <p className="text-xs text-muted-foreground">
              Waiting for scan...
            </p>
          </div>
        ) : (
          <Button onClick={handleStartPairing}>Connect WhatsApp</Button>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
```

**Step 2: Add to Settings page**

In `app/(dashboard)/settings/page.tsx`, add:

```typescript
const whatsappRelayUrl = process.env.WHATSAPP_RELAY_URL ?? null;

const { data: whatsappMapping } = await supabase
  .from("conversation_channel_mappings")
  .select("mapping_id")
  .eq("channel", "whatsapp")
  .maybeSingle();

const isWhatsAppConnected = !!whatsappMapping;
```

Then render:

```tsx
<WhatsAppConnectCard
  isConnected={isWhatsAppConnected}
  relayUrl={whatsappRelayUrl}
/>
```

**Step 3: Create disconnect API**

```typescript
// app/api/whatsapp/disconnect/route.ts
/**
 * DELETE /api/whatsapp/disconnect
 * Removes the WhatsApp channel mapping for the authenticated client.
 */
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";

export async function DELETE(): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  const clientId = await resolveClientId(supabase, userId);

  const { error } = await supabase
    .from("conversation_channel_mappings")
    .delete()
    .eq("client_id", clientId)
    .eq("channel", "whatsapp");

  if (error) {
    return jsonError("Failed to disconnect WhatsApp.", 500);
  }

  return Response.json({ success: true });
}
```

**Step 4: Commit**

```bash
git add app/(dashboard)/settings/whatsapp-connect-card.tsx app/(dashboard)/settings/page.tsx app/api/whatsapp/disconnect/route.ts
git commit -m "feat(pr43): add WhatsApp QR pairing UI and disconnect endpoint"
```

---

## Task 6: Environment variables

**Files:**
- Modify: `.env.example`

```bash
# WhatsApp Relay (PR 43)
WHATSAPP_RELAY_URL=          # URL of Fly relay (e.g., https://sunder-whatsapp-relay.fly.dev)
WHATSAPP_RELAY_SECRET=       # Shared secret between relay and Sunder webhook
```

Relay-side env vars (set via `fly secrets set`):
```bash
SUNDER_WEBHOOK_URL=https://sunder.app/api/webhook/whatsapp
SUNDER_WEBHOOK_SECRET=same-shared-secret
```

**Commit:**

```bash
git add .env.example
git commit -m "feat(pr43): add WhatsApp relay env vars to .env.example"
```

---

## Task 7: Integration test (manual)

1. Deploy relay to Fly: `cd fly-whatsapp-relay && fly deploy`
2. Set env vars on both sides (relay secrets + Sunder `.env.local`)
3. Navigate to `/settings` → click "Connect WhatsApp"
4. Scan QR code with WhatsApp (Linked Devices > Link a Device)
5. Verify relay logs show "Connected"
6. Send "hello" on WhatsApp → verify agent response
7. Send `/new` → verify new conversation starts
8. Open web chat → verify WhatsApp thread is separate

**Test criteria from v2 plan:**
- [ ] Scan QR code from Settings, WhatsApp connects
- [ ] Send message via WhatsApp, get agent response
- [ ] Second message reuses same thread
- [ ] Send /new, next message goes to fresh thread
