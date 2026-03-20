# Telegram Integration — Approvals + Unpairing Implementation Plan

**PR:** PR 42: Telegram integration — approvals + features
**Decisions:** UX-07, SAFETY-01, SAFETY-04
**Goal:** Approval-gated actions send InlineKeyboard prompts to Telegram. User can approve/deny from Telegram. Unpairing from Settings.

**Architecture:** When the runner hits an approval gate, it creates an `approval_event` (existing PR 33-34 system). A new Telegram delivery layer detects pending approvals for clients with Telegram connected and sends InlineKeyboard buttons. Callback queries from Telegram resolve the approval via `resolveApprovalEvent()`. Unpairing deletes the `conversation_channel_mapping` row. See drift analysis: `roadmap docs/Sunder - Source of Truth/references/nanoclaw-dorabot/telegram-drift-analysis.md` (section 4.5 — InlineKeyboard approval pattern from dorabot).

**Tech Stack:** grammy (InlineKeyboard), Vitest, Supabase, Next.js App Router

**Depends on:** PR 41 (Telegram bot setup + pairing)

---

## Relevant Files

### Create
- `src/lib/channels/telegram/approvals.ts` — InlineKeyboard approval delivery
- `src/lib/channels/telegram/approvals.test.ts` — tests for approval message building
- `app/api/telegram/disconnect/route.ts` — DELETE endpoint for unpairing

### Modify
- `app/api/webhook/telegram/route.ts` — add callback_query handler for approval responses
- `app/(dashboard)/settings/telegram-connect-card.tsx` — add Disconnect button
- `src/lib/channels/telegram/index.ts` — add approval exports

### Reference (read, don't modify)
- `src/lib/approvals/queries.ts` — `createApprovalEvent()`, `resolveApprovalEvent()`
- `supabase/migrations/20260310000000_create_approval_events.sql` — approval_events schema
- `/Users/sethlim/Documents/dorabot/src/channels/telegram/monitor.ts` — InlineKeyboard pattern

---

## Task 1: Build approval message for Telegram (InlineKeyboard)

Adapted from dorabot's `sendApprovalRequest()` pattern.

**Files:**
- Create: `src/lib/channels/telegram/approvals.ts`
- Create: `src/lib/channels/telegram/approvals.test.ts`

**Step 1: Write failing tests for approval message building**

```typescript
// src/lib/channels/telegram/approvals.test.ts
import { describe, expect, it } from "vitest";

import {
  buildApprovalText,
  parseApprovalCallback,
} from "./approvals";

describe("buildApprovalText", () => {
  it("includes tool name in bold", () => {
    const text = buildApprovalText("delete_contact", { contactId: "123" });
    expect(text).toContain("<b>delete_contact</b>");
  });

  it("includes approval required header", () => {
    const text = buildApprovalText("send_email", { to: "a@b.com" });
    expect(text).toContain("Approval Required");
  });

  it("truncates long input to 500 chars", () => {
    const longInput = { data: "x".repeat(1000) };
    const text = buildApprovalText("some_tool", longInput);
    // The JSON.stringify output should be truncated
    expect(text.length).toBeLessThan(700);
  });
});

describe("parseApprovalCallback", () => {
  it("parses approve callback", () => {
    const result = parseApprovalCallback("approve:abc-123");
    expect(result).toEqual({ action: "approve", requestId: "abc-123" });
  });

  it("parses deny callback", () => {
    const result = parseApprovalCallback("deny:abc-123");
    expect(result).toEqual({ action: "deny", requestId: "abc-123" });
  });

  it("returns null for unknown action", () => {
    expect(parseApprovalCallback("unknown:abc")).toBeNull();
  });

  it("returns null for malformed data", () => {
    expect(parseApprovalCallback("nocolon")).toBeNull();
    expect(parseApprovalCallback("")).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/channels/telegram/approvals.test.ts
```

Expected: FAIL — module `./approvals` not found.

**Step 3: Implement approvals.ts**

```typescript
/**
 * Telegram approval delivery via InlineKeyboard.
 * Pattern copied from dorabot/src/channels/telegram/monitor.ts.
 * @module lib/channels/telegram/approvals
 */
import { InlineKeyboard } from "grammy";
import type { Api } from "grammy";

/** Escapes HTML entities for Telegram's parse_mode: 'HTML'. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Builds the HTML text for an approval request message. */
export function buildApprovalText(
  toolName: string,
  input: Record<string, unknown>,
): string {
  const inputStr = JSON.stringify(input, null, 2).slice(0, 500);
  const detail = `<pre>${escapeHtml(inputStr)}</pre>`;

  return [
    `⚠️ <b>Approval Required</b>`,
    ``,
    `Tool: <b>${escapeHtml(toolName)}</b>`,
    detail,
  ].join("\n");
}

/** Builds the InlineKeyboard for approve/deny buttons. */
export function buildApprovalKeyboard(
  approvalId: string,
): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Allow", `approve:${approvalId}`)
    .text("❌ Deny", `deny:${approvalId}`);
}

/** Parses a callback_query data string from an approval button press. */
export function parseApprovalCallback(
  data: string,
): { action: "approve" | "deny"; requestId: string } | null {
  const sep = data.indexOf(":");
  if (sep < 0) return null;

  const action = data.slice(0, sep);
  const requestId = data.slice(sep + 1);

  if (action !== "approve" && action !== "deny") return null;
  if (!requestId) return null;

  return { action, requestId };
}

/**
 * Sends an approval request to a Telegram chat via InlineKeyboard.
 * The user taps Allow/Deny; the callback is handled in the webhook route.
 */
export async function sendTelegramApprovalRequest(
  api: Api,
  chatId: string,
  approvalId: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<void> {
  const text = buildApprovalText(toolName, input);
  const keyboard = buildApprovalKeyboard(approvalId);

  try {
    await api.sendMessage(Number(chatId), text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  } catch (err) {
    console.error("[telegram/approvals] Failed to send approval request:", err);
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/channels/telegram/approvals.test.ts
```

Expected: All PASS.

**Step 5: Commit**

```bash
git add src/lib/channels/telegram/approvals.ts src/lib/channels/telegram/approvals.test.ts
git commit -m "feat(pr42): add Telegram approval InlineKeyboard utilities"
```

---

## Task 2: Add callback_query handler to webhook route

When a user taps Allow/Deny on an InlineKeyboard button, Telegram sends a `callback_query` update. The webhook must parse it and resolve the approval.

**Files:**
- Modify: `app/api/webhook/telegram/route.ts`

**Step 1: Add callback_query handling to the POST handler**

After the `if (message) { ... }` block in the webhook route, add:

```typescript
// Handle callback_query (approval button responses)
const callbackQuery = update.callback_query as
  | Record<string, unknown>
  | undefined;

if (callbackQuery) {
  return handleCallbackQuery(supabase, bot, callbackQuery);
}
```

**Step 2: Implement the callback handler function**

Add this function to the webhook route file:

```typescript
import { parseApprovalCallback } from "@/lib/channels/telegram/approvals";
import { resolveApprovalEvent } from "@/lib/approvals/queries";

async function handleCallbackQuery(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  bot: Bot,
  callbackQuery: Record<string, unknown>,
): Promise<Response> {
  const data = callbackQuery.data as string | undefined;
  const callbackId = callbackQuery.id as string;

  if (!data) {
    await bot.api.answerCallbackQuery(callbackId);
    return new Response("OK", { status: 200 });
  }

  const parsed = parseApprovalCallback(data);
  if (!parsed) {
    await bot.api.answerCallbackQuery(callbackId);
    return new Response("OK", { status: 200 });
  }

  const approved = parsed.action === "approve";

  // Look up the approval to find the client_id
  const { data: approvalEvent } = await supabase
    .from("approval_events")
    .select("client_id")
    .eq("approval_id", parsed.requestId)
    .single();

  if (!approvalEvent) {
    await bot.api.answerCallbackQuery(callbackId, {
      text: "Approval not found.",
    });
    return new Response("OK", { status: 200 });
  }

  // Resolve the approval
  const result = await resolveApprovalEvent(supabase, {
    clientId: approvalEvent.client_id,
    approvalId: parsed.requestId,
    approved,
  });

  if (!result.success) {
    await bot.api.answerCallbackQuery(callbackId, {
      text: "Failed to process.",
    });
    return new Response("OK", { status: 200 });
  }

  // Update the message to show the result
  const message = callbackQuery.message as Record<string, unknown> | undefined;
  if (message) {
    const chatId = (message.chat as Record<string, unknown>).id as number;
    const messageId = message.message_id as number;
    const originalText = (message.text as string) ?? "";
    const label = approved ? "✅ Approved" : "❌ Denied";

    try {
      await bot.api.editMessageText(
        chatId,
        messageId,
        `${originalText}\n\n${label}`,
        { parse_mode: "HTML" },
      );
    } catch {
      // Message may have been deleted — non-critical
    }
  }

  await bot.api.answerCallbackQuery(callbackId, {
    text: approved ? "Approved" : "Denied",
  });

  return new Response("OK", { status: 200 });
}
```

**Step 3: Type check**

```bash
npx tsc --noEmit 2>&1 | grep "webhook/telegram"
```

Expected: No type errors.

**Step 4: Commit**

```bash
git add app/api/webhook/telegram/route.ts
git commit -m "feat(pr42): add callback_query handler for Telegram approval responses"
```

---

## Task 3: Wire approval delivery to Telegram

When an approval event is created (by the runner hitting an approval gate), deliver it to Telegram if the client has Telegram connected.

**Files:**
- Create: `src/lib/channels/telegram/deliver-approval.ts`

**Step 1: Implement the delivery function**

```typescript
/**
 * Delivers a pending approval notification to Telegram if the client is connected.
 * Called after createApprovalEvent() during a run.
 * @module lib/channels/telegram/deliver-approval
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import { createTelegramBot, getTelegramBotToken } from "./bot";
import { sendTelegramApprovalRequest } from "./approvals";

/**
 * Attempts to deliver an approval request to the client's Telegram chat.
 * No-ops silently if the client has no Telegram connection or if the bot
 * token is not configured.
 */
export async function deliverApprovalToTelegram(
  supabase: SupabaseClient<Database>,
  clientId: string,
  approvalId: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<void> {
  let token: string;
  try {
    token = getTelegramBotToken();
  } catch {
    // Bot not configured — skip Telegram delivery
    return;
  }

  // Find the client's Telegram channel mapping
  const { data: mapping } = await supabase
    .from("conversation_channel_mappings")
    .select("external_conversation_id")
    .eq("client_id", clientId)
    .eq("channel", "telegram")
    .limit(1)
    .maybeSingle();

  if (!mapping) return;

  const bot = createTelegramBot(token);

  await sendTelegramApprovalRequest(
    bot.api,
    mapping.external_conversation_id,
    approvalId,
    toolName,
    input,
  );
}
```

**Step 2: Commit**

```bash
git add src/lib/channels/telegram/deliver-approval.ts
git commit -m "feat(pr42): add Telegram approval delivery function"
```

**Note:** The actual wiring into the runner's approval gate (calling `deliverApprovalToTelegram` after `createApprovalEvent`) depends on PR 33-34's approval system. The runner already creates approval events — we need to add a hook that calls this delivery function. Locate where `createApprovalEvent` is called in the runner and add:

```typescript
// After createApprovalEvent succeeds:
import { deliverApprovalToTelegram } from "@/lib/channels/telegram/deliver-approval";

// Fire-and-forget — don't block the run on Telegram delivery
deliverApprovalToTelegram(supabase, clientId, approvalId, toolName, input)
  .catch((err) => console.error("[runner] Telegram approval delivery failed:", err));
```

---

## Task 4: Disconnect Telegram (unpairing)

**Files:**
- Create: `app/api/telegram/disconnect/route.ts`
- Modify: `app/(dashboard)/settings/telegram-connect-card.tsx`

**Step 1: Create the disconnect API route**

```typescript
/**
 * DELETE /api/telegram/disconnect
 * Removes the Telegram channel mapping for the authenticated client.
 * @module app/api/telegram/disconnect/route
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
    .eq("channel", "telegram");

  if (error) {
    console.error("[telegram/disconnect] Failed to delete mapping:", error);
    return jsonError("Failed to disconnect Telegram.", 500);
  }

  return Response.json({ success: true });
}
```

**Step 2: Add Disconnect button to TelegramConnectCard**

In `app/(dashboard)/settings/telegram-connect-card.tsx`, update the `isConnected` branch:

```tsx
{isConnected ? (
  <div className="space-y-3">
    <p className="text-sm text-muted-foreground">
      Connected. Send a message to your bot in Telegram to chat.
    </p>
    <Button
      variant="outline"
      onClick={handleDisconnect}
      disabled={isLoading}
    >
      {isLoading ? "Disconnecting..." : "Disconnect Telegram"}
    </Button>
  </div>
) : /* ... existing connect flow ... */}
```

Add the disconnect handler:

```typescript
async function handleDisconnect() {
  setIsLoading(true);
  setError(null);

  try {
    const res = await fetch("/api/telegram/disconnect", { method: "DELETE" });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as Record<string, string>).error ?? "Failed to disconnect",
      );
    }

    // Refresh the page to reflect disconnected state
    window.location.reload();
  } catch (err) {
    setError(err instanceof Error ? err.message : "Unknown error");
  } finally {
    setIsLoading(false);
  }
}
```

**Step 3: Commit**

```bash
git add app/api/telegram/disconnect/route.ts app/(dashboard)/settings/telegram-connect-card.tsx
git commit -m "feat(pr42): add Telegram disconnect (unpairing) from Settings"
```

---

## Task 5: Update barrel exports

**Files:**
- Modify: `src/lib/channels/telegram/index.ts`

**Step 1: Add approval exports**

```typescript
export {
  buildApprovalText,
  buildApprovalKeyboard,
  parseApprovalCallback,
  sendTelegramApprovalRequest,
} from "./approvals";
export { deliverApprovalToTelegram } from "./deliver-approval";
```

**Step 2: Commit**

```bash
git add src/lib/channels/telegram/index.ts
git commit -m "feat(pr42): update Telegram barrel exports with approval utilities"
```

---

## Task 6: Integration test (manual)

**Prerequisites:** PR 41 setup complete (bot created, webhook registered, account paired).

**Test: Approval via Telegram InlineKeyboard**

1. In web chat, trigger an approval-gated action (e.g., ask the agent to delete a contact)
2. Verify InlineKeyboard message arrives in Telegram with "Allow" and "Deny" buttons
3. Tap "Allow"
4. Verify: callback resolves the approval, message updates to show "✅ Approved"
5. Verify: agent continues execution after approval
6. Repeat with "Deny" — verify agent stops and reports denial

**Test: Disconnect**

1. Go to Settings → Telegram card
2. Click "Disconnect Telegram"
3. Send a message to the bot in Telegram
4. Verify bot responds: "Please connect your account first..."
5. Verify Settings card shows "Connect Telegram" button again

**Test criteria from v2 plan:**
- [ ] Approval-gated action triggers InlineKeyboard in Telegram, tap Approve/Deny resolves correctly
- [ ] Full agent interaction via Telegram including approvals
- [ ] Disconnect from Settings, bot no longer responds
