# WhatsApp Integration — Approvals + Features Implementation Plan

**PR:** PR 44: WhatsApp integration — approvals + features
**Decisions:** UX-07
**Depends on:** PR 43 (WhatsApp relay + webhook), PR 42 (Telegram approvals — same approval_events system)
**Goal:** Approval-gated actions send text prompts to WhatsApp. User replies "1" or "2". Questions use numbered options.

**Architecture:** WhatsApp has no inline keyboards. Approvals and questions use text-based interaction — dorabot's exact pattern. The webhook route (PR 43) already parses approval responses ("1"/"allow"/"yes" → approve). This PR adds explicit approval delivery and question support.

**Tech Stack:** Vitest, Supabase, Next.js App Router

**Reference code:** `/Users/sethlim/Documents/dorabot-1/src/channels/whatsapp/monitor.ts` — `sendApprovalRequest()` and `sendQuestion()` patterns.

---

## Relevant Files

### Create
- `src/lib/channels/whatsapp/approvals.ts` — text-based approval message builder
- `src/lib/channels/whatsapp/approvals.test.ts`
- `src/lib/channels/whatsapp/questions.ts` — numbered question message builder
- `src/lib/channels/whatsapp/questions.test.ts`
- `src/lib/channels/whatsapp/deliver-approval.ts` — approval delivery to WhatsApp via relay

### Modify
- `app/api/webhook/whatsapp/route.ts` — add question response parsing
- `src/lib/channels/whatsapp/index.ts` — add exports

### Reference
- `/Users/sethlim/Documents/dorabot-1/src/channels/whatsapp/monitor.ts` — sendApprovalRequest (lines ~220-245), sendQuestion (lines ~247-270)
- `src/lib/approvals/queries.ts` — resolveApprovalEvent()

---

## Task 1: WhatsApp approval messages (text-based)

Copied from dorabot's `sendApprovalRequest()` pattern. No inline keyboards — just text with "Reply *1* to Allow or *2* to Deny".

**Files:**
- Create: `src/lib/channels/whatsapp/approvals.ts`
- Create: `src/lib/channels/whatsapp/approvals.test.ts`

**Step 1: Write failing tests**

```typescript
// src/lib/channels/whatsapp/approvals.test.ts
import { describe, expect, it } from "vitest";

import { buildWhatsAppApprovalText, parseWhatsAppApprovalResponse } from "./approvals";

describe("buildWhatsAppApprovalText", () => {
  it("includes tool name in bold", () => {
    const text = buildWhatsAppApprovalText("delete_contact", { contactId: "123" });
    expect(text).toContain("*delete_contact*");
  });

  it("includes approval required header", () => {
    const text = buildWhatsAppApprovalText("send_email", { to: "a@b.com" });
    expect(text).toContain("Approval Required");
  });

  it("includes reply instructions", () => {
    const text = buildWhatsAppApprovalText("some_tool", {});
    expect(text).toContain("Reply *1* to Allow or *2* to Deny");
  });

  it("truncates long input", () => {
    const text = buildWhatsAppApprovalText("tool", { data: "x".repeat(1000) });
    expect(text.length).toBeLessThan(700);
  });
});

describe("parseWhatsAppApprovalResponse", () => {
  it("parses '1' as approve", () => {
    expect(parseWhatsAppApprovalResponse("1")).toBe(true);
  });

  it("parses 'allow' as approve", () => {
    expect(parseWhatsAppApprovalResponse("allow")).toBe(true);
  });

  it("parses 'yes' as approve", () => {
    expect(parseWhatsAppApprovalResponse("yes")).toBe(true);
  });

  it("parses 'y' as approve", () => {
    expect(parseWhatsAppApprovalResponse("Y")).toBe(true);
  });

  it("parses '2' as deny", () => {
    expect(parseWhatsAppApprovalResponse("2")).toBe(false);
  });

  it("parses 'deny' as deny", () => {
    expect(parseWhatsAppApprovalResponse("deny")).toBe(false);
  });

  it("parses 'no' as deny", () => {
    expect(parseWhatsAppApprovalResponse("no")).toBe(false);
  });

  it("returns null for unrecognized text", () => {
    expect(parseWhatsAppApprovalResponse("maybe")).toBeNull();
    expect(parseWhatsAppApprovalResponse("hello")).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/channels/whatsapp/approvals.test.ts
```

**Step 3: Implement approvals.ts**

```typescript
/**
 * WhatsApp text-based approval messages.
 * No inline keyboards on WhatsApp — user replies "1" or "2".
 * Copied from dorabot/src/channels/whatsapp/monitor.ts sendApprovalRequest().
 * @module lib/channels/whatsapp/approvals
 */

/** Builds the text for a WhatsApp approval request message. */
export function buildWhatsAppApprovalText(
  toolName: string,
  input: Record<string, unknown>,
): string {
  const inputStr = JSON.stringify(input, null, 2).slice(0, 500);

  return [
    `⚠️ *Approval Required*`,
    ``,
    `Tool: *${toolName}*`,
    inputStr.includes("\n") ? inputStr : `\`${inputStr}\``,
    ``,
    `Reply *1* to Allow or *2* to Deny`,
  ].join("\n");
}

/** Parses approval responses: 1/allow/yes/y → true, 2/deny/no/n → false, else null. */
export function parseWhatsAppApprovalResponse(text: string): boolean | null {
  const lower = text.trim().toLowerCase();
  if (["1", "allow", "yes", "y"].includes(lower)) return true;
  if (["2", "deny", "no", "n"].includes(lower)) return false;
  return null;
}
```

**Step 4: Run tests**

```bash
npx vitest run src/lib/channels/whatsapp/approvals.test.ts
```

Expected: All PASS.

**Step 5: Commit**

```bash
git add src/lib/channels/whatsapp/approvals.ts src/lib/channels/whatsapp/approvals.test.ts
git commit -m "feat(pr44): add WhatsApp text-based approval messages"
```

---

## Task 2: WhatsApp questions (numbered options)

Copied from dorabot's `sendQuestion()` pattern. User replies with a number.

**Files:**
- Create: `src/lib/channels/whatsapp/questions.ts`
- Create: `src/lib/channels/whatsapp/questions.test.ts`

**Step 1: Write failing tests**

```typescript
// src/lib/channels/whatsapp/questions.test.ts
import { describe, expect, it } from "vitest";

import {
  buildWhatsAppQuestionText,
  parseWhatsAppQuestionResponse,
} from "./questions";

describe("buildWhatsAppQuestionText", () => {
  it("includes the question", () => {
    const text = buildWhatsAppQuestionText("Which contact?", [
      { label: "John Tan" },
      { label: "Mary Lee" },
    ]);
    expect(text).toContain("Which contact?");
  });

  it("numbers the options", () => {
    const text = buildWhatsAppQuestionText("Pick one", [
      { label: "A" },
      { label: "B" },
      { label: "C" },
    ]);
    expect(text).toContain("*1.* A");
    expect(text).toContain("*2.* B");
    expect(text).toContain("*3.* C");
  });

  it("includes descriptions when provided", () => {
    const text = buildWhatsAppQuestionText("Pick one", [
      { label: "John", description: "PropNex agent" },
    ]);
    expect(text).toContain("PropNex agent");
  });

  it("includes reply instruction", () => {
    const text = buildWhatsAppQuestionText("Pick one", [{ label: "A" }]);
    expect(text).toContain("Reply with a number");
  });
});

describe("parseWhatsAppQuestionResponse", () => {
  it("parses valid number", () => {
    expect(parseWhatsAppQuestionResponse("1", 3)).toBe(0);
    expect(parseWhatsAppQuestionResponse("2", 3)).toBe(1);
    expect(parseWhatsAppQuestionResponse("3", 3)).toBe(2);
  });

  it("returns null for out-of-range", () => {
    expect(parseWhatsAppQuestionResponse("0", 3)).toBeNull();
    expect(parseWhatsAppQuestionResponse("4", 3)).toBeNull();
  });

  it("returns null for non-numeric", () => {
    expect(parseWhatsAppQuestionResponse("hello", 3)).toBeNull();
    expect(parseWhatsAppQuestionResponse("", 3)).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/channels/whatsapp/questions.test.ts
```

**Step 3: Implement questions.ts**

```typescript
/**
 * WhatsApp numbered question messages.
 * User replies with a number to select an option.
 * Copied from dorabot/src/channels/whatsapp/monitor.ts sendQuestion().
 * @module lib/channels/whatsapp/questions
 */

export type WhatsAppQuestionOption = {
  label: string;
  description?: string;
};

/** Builds the text for a WhatsApp question with numbered options. */
export function buildWhatsAppQuestionText(
  question: string,
  options: WhatsAppQuestionOption[],
): string {
  const lines = [`❓ *${question}*`, ""];
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    if (opt.description) {
      lines.push(`*${i + 1}.* ${opt.label} — ${opt.description}`);
    } else {
      lines.push(`*${i + 1}.* ${opt.label}`);
    }
  }
  lines.push("", "Reply with a number");
  return lines.join("\n");
}

/**
 * Parses a numeric question response.
 * Returns the 0-based index, or null if invalid.
 */
export function parseWhatsAppQuestionResponse(
  text: string,
  optionCount: number,
): number | null {
  const num = parseInt(text.trim(), 10);
  if (isNaN(num) || num < 1 || num > optionCount) return null;
  return num - 1;
}
```

**Step 4: Run tests**

```bash
npx vitest run src/lib/channels/whatsapp/questions.test.ts
```

Expected: All PASS.

**Step 5: Commit**

```bash
git add src/lib/channels/whatsapp/questions.ts src/lib/channels/whatsapp/questions.test.ts
git commit -m "feat(pr44): add WhatsApp numbered question messages"
```

---

## Task 3: Approval delivery to WhatsApp via relay

When an approval event is created, send the text prompt to WhatsApp via the Fly relay's `/send` endpoint.

**Files:**
- Create: `src/lib/channels/whatsapp/deliver-approval.ts`

**Step 1: Implement**

```typescript
/**
 * Delivers a pending approval notification to WhatsApp via the Fly relay.
 * Called after createApprovalEvent() during a run.
 * @module lib/channels/whatsapp/deliver-approval
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import { buildWhatsAppApprovalText } from "./approvals";

export async function deliverApprovalToWhatsApp(
  supabase: SupabaseClient<Database>,
  clientId: string,
  approvalId: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<void> {
  const relayUrl = (process.env.WHATSAPP_RELAY_URL ?? "").trim();
  if (!relayUrl) return;

  // Find the client's WhatsApp channel mapping
  const { data: mapping } = await supabase
    .from("conversation_channel_mappings")
    .select("external_conversation_id")
    .eq("client_id", clientId)
    .eq("channel", "whatsapp")
    .limit(1)
    .maybeSingle();

  if (!mapping) return;

  const text = buildWhatsAppApprovalText(toolName, input);

  try {
    await fetch(`${relayUrl}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: mapping.external_conversation_id,
        text,
      }),
    });
  } catch (err) {
    console.error("[whatsapp/approvals] Failed to send approval:", err);
  }
}
```

**Step 2: Commit**

```bash
git add src/lib/channels/whatsapp/deliver-approval.ts
git commit -m "feat(pr44): add WhatsApp approval delivery via Fly relay"
```

---

## Task 4: Update barrel exports

**Files:**
- Modify: `src/lib/channels/whatsapp/index.ts`

```typescript
export { markdownToWhatsApp } from "./format";
export {
  toWhatsAppJid,
  splitWhatsAppMessage,
  sendWhatsAppMessage,
  editWhatsAppMessage,
  deleteWhatsAppMessage,
} from "./send";
export {
  buildWhatsAppApprovalText,
  parseWhatsAppApprovalResponse,
} from "./approvals";
export {
  buildWhatsAppQuestionText,
  parseWhatsAppQuestionResponse,
  type WhatsAppQuestionOption,
} from "./questions";
export { deliverApprovalToWhatsApp } from "./deliver-approval";
```

**Commit:**

```bash
git add src/lib/channels/whatsapp/index.ts
git commit -m "feat(pr44): update WhatsApp barrel exports"
```

---

## Task 5: Integration test (manual)

**Prerequisites:** PR 43 setup complete (relay deployed, QR scanned, WhatsApp connected).

**Test: Approval via WhatsApp text**

1. In web chat, trigger an approval-gated action (e.g., "delete the contact Old Lead")
2. Verify WhatsApp receives:
   ```
   ⚠️ *Approval Required*
   Tool: *delete_contact*
   {"contactId":"abc-123"}
   Reply *1* to Allow or *2* to Deny
   ```
3. Reply "1"
4. Verify: approval resolves, agent continues, WhatsApp shows "✅ Approved"
5. Repeat with "no" → verify "❌ Denied"

**Test: Question via WhatsApp**

1. Ask agent "send a follow up to sarah" (ambiguous — multiple Sarahs)
2. Verify WhatsApp receives numbered options
3. Reply "1"
4. Verify: agent proceeds with selected Sarah

**Test: Disconnect**

1. Settings → WhatsApp card → "Disconnect WhatsApp"
2. Send message on WhatsApp
3. Verify: no response (relay disconnected)

**Test criteria from v2 plan:**
- [ ] Approval-gated action sends text prompt to WhatsApp, reply "1" resolves correctly
- [ ] Question sends numbered options, reply with number selects correctly
- [ ] Disconnect from Settings, bot no longer responds
