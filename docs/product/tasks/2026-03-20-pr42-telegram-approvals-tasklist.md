# Telegram Integration — Approvals + Features Implementation Plan

**PR:** PR 42: Telegram integration — approvals + features
**Decisions:** UX-07, SAFETY-01, SAFETY-04
**Goal:** Approval-gated actions send InlineKeyboard prompts to Telegram. User can approve/deny from Telegram. Questions reuse `ask_user_question`. Unpairing from Settings.

**Architecture:** When the runner hits an approval gate, `finalizeRun` creates `approval_events` (existing PR 33-34 system). PR42 extends the channel delivery layer (PR41's `deliverToExternalChannels`) to also detect approval-requested parts and deliver InlineKeyboard messages to Telegram. Callback queries resolve approvals via a shared `resolveAndContinueApproval` helper, then trigger a continuation run whose output is delivered via the same channel delivery layer. The `ask_user_question` tool is reused end-to-end — PR42 adds a Telegram renderer (InlineKeyboard buttons) and a response adapter (formats button press as `"Q: ...\nA: ..."` matching the web UI's format). No parallel question system. Unpairing deletes the `conversation_channel_mapping` row.

**Depends on:** PR 41 (Telegram bot setup + pairing + channel delivery layer)

**Corrections from review:** (1) Approval callback triggers continuation run via shared helper, not just DB update. (2) Question UI reuses `ask_user_question` tool with Telegram adapter, no separate `QuestionOption` type. (3) `chat/route.ts` approval flow untouched — it works, Telegram uses a parallel server-side path via shared helper. (4) One commit for entire PR. (5) `hasExternalDeliverables(text, parts)` predicate in delivery layer — question-only turns without prose are deliverable. (6) Telegram v1 supports `single_select` only — `multi_select` and `rank_priorities` degrade to prose fallback. (7) Approval callbacks scoped via `conversation_channel_mappings` from chat.id first, then client_id-scoped query — never operate outside the current chat's tenant boundary. (8) Continuation uses empty input (matching web `isApprovalContinuation` path), not synthetic "I approved" text. (9) Webhook route tests, callback security tests, and delivery ordering tests added. (10) Persisted `telegram_pending_questions` table — question callbacks resolve from this record, not the current channel mapping. Prevents stale buttons routing to wrong thread after `/new`. (11) Unsupported question types (multi_select, rank_priorities) use pending-question context to normalize the next free-text reply into Q:/A: format. (12) Real route-level security test proves cross-tenant callback isolation, not just parser checks.

---

## Relevant Files

### Create
- `src/lib/channels/telegram/approvals.ts` — InlineKeyboard approval utilities
- `src/lib/channels/telegram/approvals.test.ts`
- `src/lib/channels/telegram/questions.ts` — ask_user_question Telegram adapter
- `src/lib/channels/telegram/questions.test.ts`
- `src/lib/channels/telegram/pending-questions.ts` — persisted pending question context (DB helpers)
- `src/lib/channels/telegram/pending-questions.test.ts`
- `src/lib/approvals/continue-after-approval.ts` — shared server-side approval continuation
- `src/lib/approvals/continue-after-approval.test.ts`
- `app/api/telegram/disconnect/route.ts` — DELETE endpoint for unpairing
- `supabase/migrations/XXXXXXXX_create_telegram_pending_questions.sql` — pending question state for callbacks

### Modify
- `app/api/webhook/telegram/route.ts` — add callback_query handler for approvals + questions, `/new` clears pending questions, text-reply wrapping for unsupported question types
- `src/lib/channels/deliver.ts` — extend to deliver approval InlineKeyboards + question widgets, persist pending questions with opaque tokens
- `app/(dashboard)/settings/telegram-connect-card.tsx` — add Disconnect button
- `src/lib/channels/telegram/index.ts` — add approval + question + pending-question exports

### Reference (read, don't modify)
- `src/lib/approvals/queries.ts` — `resolveApprovalEvent()` (already shared)
- `src/lib/runner/run-persistence.ts` — where `createApprovalEvent` + `deliverToExternalChannels` are called
- `src/lib/runner/tools/utility/ask-user-question.ts` — tool schema to reuse
- `src/components/chat/ask-user-question-inline.tsx` — web response format to match
- `app/api/chat/route.ts` — web approval continuation flow (reference, don't modify)
- `/Users/sethlim/Documents/dorabot/src/channels/telegram/monitor.ts` — InlineKeyboard approval pattern

---

## Task 1: Approval InlineKeyboard utilities

Pure functions, TDD. Builds approval messages and parses callback data.

**Files:**
- Create: `src/lib/channels/telegram/approvals.ts`
- Create: `src/lib/channels/telegram/approvals.test.ts`

**Step 1: Write failing tests**

```typescript
// src/lib/channels/telegram/approvals.test.ts
import { describe, expect, it } from "vitest";

import {
  buildApprovalText,
  parseApprovalCallback,
  buildApprovalCallbackData,
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
    expect(text.length).toBeLessThan(700);
  });

  it("escapes HTML entities in tool input", () => {
    const text = buildApprovalText("test", { query: "<script>alert(1)</script>" });
    expect(text).not.toContain("<script>");
    expect(text).toContain("&lt;script&gt;");
  });
});

describe("buildApprovalCallbackData", () => {
  it("creates approve callback data", () => {
    expect(buildApprovalCallbackData("abc-123", true)).toBe("approve:abc-123");
  });

  it("creates deny callback data", () => {
    expect(buildApprovalCallbackData("abc-123", false)).toBe("deny:abc-123");
  });
});

describe("parseApprovalCallback", () => {
  it("parses approve callback", () => {
    const result = parseApprovalCallback("approve:abc-123");
    expect(result).toEqual({ action: "approve", approvalId: "abc-123" });
  });

  it("parses deny callback", () => {
    const result = parseApprovalCallback("deny:abc-123");
    expect(result).toEqual({ action: "deny", approvalId: "abc-123" });
  });

  it("returns null for unknown action", () => {
    expect(parseApprovalCallback("unknown:abc")).toBeNull();
  });

  it("returns null for malformed data", () => {
    expect(parseApprovalCallback("nocolon")).toBeNull();
    expect(parseApprovalCallback("")).toBeNull();
  });

  it("handles approval IDs containing colons", () => {
    const result = parseApprovalCallback("approve:uuid:with:colons");
    expect(result).toEqual({ action: "approve", approvalId: "uuid:with:colons" });
  });
});
```

**Step 2: Run tests — expected FAIL**

```bash
npx vitest run src/lib/channels/telegram/approvals.test.ts
```

**Step 3: Implement approvals.ts**

```typescript
/**
 * Telegram approval delivery via InlineKeyboard.
 * Adapted from dorabot/src/channels/telegram/monitor.ts.
 * @module lib/channels/telegram/approvals
 */
import { InlineKeyboard } from "grammy";
import type { Api } from "grammy";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Builds the HTML text for an approval request message. */
export function buildApprovalText(
  toolName: string,
  input: Record<string, unknown>,
): string {
  const inputStr = JSON.stringify(input, null, 2).slice(0, 500);
  return [
    `⚠️ <b>Approval Required</b>`,
    ``,
    `Tool: <b>${escapeHtml(toolName)}</b>`,
    `<pre>${escapeHtml(inputStr)}</pre>`,
  ].join("\n");
}

/** Builds callback_data string for approve/deny buttons. */
export function buildApprovalCallbackData(
  approvalId: string,
  approved: boolean,
): string {
  return `${approved ? "approve" : "deny"}:${approvalId}`;
}

/** Builds the InlineKeyboard for approve/deny buttons. */
export function buildApprovalKeyboard(approvalId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Allow", buildApprovalCallbackData(approvalId, true))
    .text("❌ Deny", buildApprovalCallbackData(approvalId, false));
}

/** Parses a callback_query data string from an approval button press. */
export function parseApprovalCallback(
  data: string,
): { action: "approve" | "deny"; approvalId: string } | null {
  const sep = data.indexOf(":");
  if (sep < 0) return null;

  const action = data.slice(0, sep);
  const approvalId = data.slice(sep + 1);

  if (action !== "approve" && action !== "deny") return null;
  if (!approvalId) return null;

  return { action, approvalId };
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

  await api.sendMessage(Number(chatId), text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}
```

**Step 4: Run tests — expected PASS**

```bash
npx vitest run src/lib/channels/telegram/approvals.test.ts
```

---

## Task 2: ask_user_question Telegram adapter

Reuses the existing `ask_user_question` tool. Telegram v1 supports `single_select` only — `multi_select` and `rank_priorities` degrade to a prose fallback message listing options and asking the user to reply in text. This is an intentional scope limit, not fake parity. Response formatted to match web UI output (`"Q: ...\nA: ..."`).

**Files:**
- Create: `src/lib/channels/telegram/questions.ts`
- Create: `src/lib/channels/telegram/questions.test.ts`

**Step 1: Write failing tests**

```typescript
// src/lib/channels/telegram/questions.test.ts
import { describe, expect, it } from "vitest";

import {
  buildQuestionText,
  parseQuestionCallback,
  formatQuestionResponse,
  isSupportedQuestionType,
  buildUnsupportedQuestionFallback,
} from "./questions";

describe("buildQuestionText", () => {
  it("includes the question text", () => {
    const text = buildQuestionText("Which contact?", [
      "John Tan",
      "Mary Lee",
    ]);
    expect(text).toContain("Which contact?");
  });

  it("lists options with numbers", () => {
    const text = buildQuestionText("Pick one:", ["Alpha", "Beta", "Gamma"]);
    expect(text).toContain("1. Alpha");
    expect(text).toContain("2. Beta");
    expect(text).toContain("3. Gamma");
  });
});

describe("parseQuestionCallback", () => {
  it("parses valid question callback", () => {
    const result = parseQuestionCallback("q:abc123:2");
    expect(result).toEqual({ requestId: "abc123", optionIndex: 2 });
  });

  it("returns null for non-question callback", () => {
    expect(parseQuestionCallback("approve:abc")).toBeNull();
  });

  it("returns null for malformed data", () => {
    expect(parseQuestionCallback("q:")).toBeNull();
    expect(parseQuestionCallback("q:abc:notanumber")).toBeNull();
  });

  it("handles request IDs with colons", () => {
    const result = parseQuestionCallback("q:abc:def:1");
    // Last segment is option index, everything between first and last colon is requestId
    expect(result).toEqual({ requestId: "abc:def", optionIndex: 1 });
  });
});

describe("formatQuestionResponse", () => {
  it("formats single question response matching web UI format", () => {
    const result = formatQuestionResponse([
      { question: "Which contact?", selectedOption: "John Tan" },
    ]);
    expect(result).toBe("Q: Which contact?\nA: John Tan");
  });

  it("formats multiple question responses", () => {
    const result = formatQuestionResponse([
      { question: "Who?", selectedOption: "John" },
      { question: "When?", selectedOption: "Tomorrow" },
    ]);
    expect(result).toBe("Q: Who?\nA: John\n\nQ: When?\nA: Tomorrow");
  });
});

describe("isSupportedQuestionType", () => {
  it("returns true for single_select", () => {
    expect(isSupportedQuestionType("single_select")).toBe(true);
  });

  it("returns false for multi_select", () => {
    expect(isSupportedQuestionType("multi_select")).toBe(false);
  });

  it("returns false for rank_priorities", () => {
    expect(isSupportedQuestionType("rank_priorities")).toBe(false);
  });
});

describe("buildUnsupportedQuestionFallback", () => {
  it("builds prose fallback for multi_select", () => {
    const text = buildUnsupportedQuestionFallback(
      "Which contacts?",
      ["John", "Mary", "Alex"],
      "multi_select",
    );
    expect(text).toContain("Which contacts?");
    expect(text).toContain("John");
    expect(text).toContain("Mary");
    expect(text).toContain("reply");
  });
});
```

**Step 2: Run tests — expected FAIL**

```bash
npx vitest run src/lib/channels/telegram/questions.test.ts
```

**Step 3: Implement questions.ts**

```typescript
/**
 * Telegram adapter for the ask_user_question tool.
 * Renders question options as InlineKeyboard buttons.
 * Response format matches web UI output: "Q: ...\nA: ..."
 * @module lib/channels/telegram/questions
 */
import { InlineKeyboard } from "grammy";
import type { Api } from "grammy";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Builds HTML text showing the question and numbered options. */
export function buildQuestionText(
  question: string,
  options: string[],
): string {
  const lines = [`❓ ${escapeHtml(question)}`, ""];
  for (let i = 0; i < options.length; i++) {
    lines.push(`${i + 1}. ${escapeHtml(options[i])}`);
  }
  return lines.join("\n");
}

/**
 * Builds InlineKeyboard with option buttons.
 * Callback data format: q:{requestId}:{optionIndex}
 * For multi-question flows, each question gets its own message.
 */
export function buildQuestionKeyboard(
  requestId: string,
  options: string[],
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (let i = 0; i < options.length; i++) {
    keyboard.text(options[i], `q:${requestId}:${i}`);
    if (i % 2 === 1) keyboard.row(); // 2 buttons per row
  }
  return keyboard;
}

/**
 * Parses callback_query data from a question button press.
 * Format: q:{requestId}:{optionIndex}
 * The optionIndex is always the last colon-separated segment.
 */
export function parseQuestionCallback(
  data: string,
): { requestId: string; optionIndex: number } | null {
  if (!data.startsWith("q:")) return null;

  const rest = data.slice(2); // Remove "q:" prefix
  const lastColon = rest.lastIndexOf(":");
  if (lastColon < 0) return null;

  const requestId = rest.slice(0, lastColon);
  const optionIndex = parseInt(rest.slice(lastColon + 1), 10);

  if (!requestId || isNaN(optionIndex)) return null;
  return { requestId, optionIndex };
}

/**
 * Formats question responses into the same text format the web UI generates.
 * This is sent as the user's next message so the agent can continue.
 * See: src/components/chat/ask-user-question-inline.tsx (formatAllResponses)
 */
export function formatQuestionResponse(
  responses: Array<{ question: string; selectedOption: string }>,
): string {
  return responses
    .map((r) => `Q: ${r.question}\nA: ${r.selectedOption}`)
    .join("\n\n");
}

/**
 * Telegram v1 only supports single_select questions via InlineKeyboard.
 * multi_select and rank_priorities degrade to prose fallback.
 */
export function isSupportedQuestionType(type: string): boolean {
  return type === "single_select";
}

/**
 * Builds a prose fallback message for unsupported question types.
 * Lists options as text and asks the user to reply in their own words.
 */
export function buildUnsupportedQuestionFallback(
  question: string,
  options: string[],
  type: string,
): string {
  const optionList = options.map((o, i) => `${i + 1}. ${escapeHtml(o)}`).join("\n");
  const typeLabel = type === "multi_select"
    ? "You can pick multiple"
    : "Please rank these in order of priority";
  return [
    `❓ ${escapeHtml(question)}`,
    "",
    optionList,
    "",
    `<i>${typeLabel} — please reply with your answer.</i>`,
  ].join("\n");
}

/** Sends a question with InlineKeyboard options to a Telegram chat. */
export async function sendTelegramQuestion(
  api: Api,
  chatId: string,
  requestId: string,
  question: string,
  options: string[],
): Promise<void> {
  const text = buildQuestionText(question, options);
  const keyboard = buildQuestionKeyboard(requestId, options);

  await api.sendMessage(Number(chatId), text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}
```

**Step 4: Run tests — expected PASS**

```bash
npx vitest run src/lib/channels/telegram/questions.test.ts
```

---

## Task 3: Pending questions persistence

Question callbacks must resolve from a persisted record, not from the current channel mapping. Without this, tapping an old question button after `/new` routes the answer to the wrong thread. Also enables normalizing free-text replies to unsupported question types into Q:/A: format.

**Files:**
- Create: `supabase/migrations/XXXXXXXX_create_telegram_pending_questions.sql`
- Create: `src/lib/channels/telegram/pending-questions.ts`
- Create: `src/lib/channels/telegram/pending-questions.test.ts`

**Step 1: Write the migration**

Use a timestamp like `20260320200000`.

```sql
-- PR42: Persisted pending question context for Telegram InlineKeyboard callbacks.
-- Keyed by a short opaque callback token (not raw toolCallId).
-- Resolves callback destination from this record, not from the current channel mapping.
-- This prevents stale buttons from routing answers to the wrong thread after /new.
-- Also tracks unsupported question types (multi_select, rank_priorities) so the next
-- free-text reply can be normalized into Q:/A: format.

CREATE TABLE public.telegram_pending_questions (
  token TEXT PRIMARY KEY,
  client_id UUID NOT NULL
    REFERENCES public.clients(client_id) ON DELETE CASCADE,
  thread_id UUID NOT NULL
    REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  question_type TEXT NOT NULL DEFAULT 'single_select',
  awaiting_text_reply BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_pending_questions_chat_id
  ON public.telegram_pending_questions(chat_id);

CREATE INDEX idx_telegram_pending_questions_chat_awaiting
  ON public.telegram_pending_questions(chat_id)
  WHERE awaiting_text_reply = true;

COMMENT ON TABLE public.telegram_pending_questions IS
  'Short-lived pending question state for Telegram InlineKeyboard callbacks. Rows deleted on answer or /new.';

-- RLS enabled but no user-facing policies — only accessed via admin client in webhook context.
ALTER TABLE public.telegram_pending_questions ENABLE ROW LEVEL SECURITY;
```

**Step 2: Apply migration + regenerate types**

```bash
npx supabase db reset
npx supabase gen types typescript --local > src/types/database.ts
```

**Step 3: Write failing tests for pending question helpers**

```typescript
// src/lib/channels/telegram/pending-questions.test.ts
import { describe, expect, it, vi } from "vitest";

import {
  generateQuestionCallbackToken,
} from "./pending-questions";

describe("generateQuestionCallbackToken", () => {
  it("returns a base64url string", () => {
    const token = generateQuestionCallbackToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is short enough for Telegram callback_data (< 30 chars)", () => {
    // Full callback: "q:{token}:{index}" must be < 64 bytes
    const token = generateQuestionCallbackToken();
    expect(token.length).toBeLessThan(30);
  });

  it("generates unique tokens", () => {
    const a = generateQuestionCallbackToken();
    const b = generateQuestionCallbackToken();
    expect(a).not.toBe(b);
  });
});
```

**Step 4: Run tests — expected FAIL**

**Step 5: Implement pending-questions.ts**

```typescript
/**
 * Persisted pending question context for Telegram callbacks.
 * Decouples callback resolution from the current channel mapping,
 * preventing stale buttons from routing to the wrong thread after /new.
 * @module lib/channels/telegram/pending-questions
 */
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/** Generates a short opaque token for question callback_data. */
export function generateQuestionCallbackToken(): string {
  return randomBytes(8).toString("base64url"); // 11 chars
}

export interface PendingQuestionInput {
  clientId: string;
  threadId: string;
  chatId: string;
  question: string;
  options: string[];
  questionType: string;
  /** If true, the next free-text reply from this chat will be wrapped in Q:/A: format. */
  awaitingTextReply: boolean;
}

/**
 * Persists a pending question record. Returns the opaque callback token.
 */
export async function persistPendingQuestion(
  supabase: SupabaseClient<Database>,
  input: PendingQuestionInput,
): Promise<string> {
  const token = generateQuestionCallbackToken();

  const { error } = await supabase
    .from("telegram_pending_questions")
    .insert({
      token,
      client_id: input.clientId,
      thread_id: input.threadId,
      chat_id: input.chatId,
      question: input.question,
      options: input.options,
      question_type: input.questionType,
      awaiting_text_reply: input.awaitingTextReply,
    });

  if (error) {
    console.error("[telegram/pending-questions] Failed to persist:", error);
    throw error;
  }

  return token;
}

export interface ResolvedPendingQuestion {
  token: string;
  clientId: string;
  threadId: string;
  chatId: string;
  question: string;
  options: string[];
  questionType: string;
}

/**
 * Looks up and deletes a pending question by callback token.
 * Returns null if not found (expired or already consumed).
 */
export async function consumePendingQuestion(
  supabase: SupabaseClient<Database>,
  token: string,
): Promise<ResolvedPendingQuestion | null> {
  const { data, error } = await supabase
    .from("telegram_pending_questions")
    .select("token, client_id, thread_id, chat_id, question, options, question_type")
    .eq("token", token)
    .single();

  if (error || !data) return null;

  // Delete after consuming (single-use)
  await supabase
    .from("telegram_pending_questions")
    .delete()
    .eq("token", token);

  return {
    token: data.token,
    clientId: data.client_id,
    threadId: data.thread_id,
    chatId: data.chat_id,
    question: data.question,
    options: data.options as string[],
    questionType: data.question_type,
  };
}

/**
 * Checks for a pending text-reply question for this chat.
 * Returns the oldest one (FIFO). Used for multi_select/rank_priorities fallbacks.
 */
export async function consumePendingTextReply(
  supabase: SupabaseClient<Database>,
  chatId: string,
): Promise<ResolvedPendingQuestion | null> {
  const { data, error } = await supabase
    .from("telegram_pending_questions")
    .select("token, client_id, thread_id, chat_id, question, options, question_type")
    .eq("chat_id", chatId)
    .eq("awaiting_text_reply", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  // Delete after consuming
  await supabase
    .from("telegram_pending_questions")
    .delete()
    .eq("token", data.token);

  return {
    token: data.token,
    clientId: data.client_id,
    threadId: data.thread_id,
    chatId: data.chat_id,
    question: data.question,
    options: data.options as string[],
    questionType: data.question_type,
  };
}

/**
 * Deletes all pending questions for a chat. Called on /new to invalidate stale buttons.
 */
export async function clearPendingQuestionsForChat(
  supabase: SupabaseClient<Database>,
  chatId: string,
): Promise<void> {
  await supabase
    .from("telegram_pending_questions")
    .delete()
    .eq("chat_id", chatId);
}
```

**Step 6: Run tests — expected PASS**

```bash
npx vitest run src/lib/channels/telegram/pending-questions.test.ts
```

---

## Task 4: Continue-after-approval helper + callback handler

Server-side helper for Telegram approval continuation. The web flow (`chat/route.ts`) is left unchanged — it works fine with its UI-driven auto-send pattern. Callback handlers resolve question context from `telegram_pending_questions`, not the current channel mapping.

**Files:**
- Create: `src/lib/approvals/continue-after-approval.ts`
- Create: `src/lib/approvals/continue-after-approval.test.ts`
- Modify: `app/api/webhook/telegram/route.ts`

**Step 1: Write failing tests for the shared helper**

```typescript
// src/lib/approvals/continue-after-approval.test.ts
import { describe, expect, it, vi } from "vitest";

import { resolveAndContinueApproval } from "./continue-after-approval";

vi.mock("@/lib/approvals/queries", () => ({
  resolveApprovalEvent: vi.fn(),
}));

vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: vi.fn().mockResolvedValue({ status: "queued" }),
}));

describe("resolveAndContinueApproval", () => {
  it("resolves approval and triggers continuation run when approved", async () => {
    const { resolveApprovalEvent } = await import("@/lib/approvals/queries");
    const { runAgent } = await import("@/lib/runner/run-agent");

    vi.mocked(resolveApprovalEvent).mockResolvedValueOnce({
      success: true,
      status: "updated",
      event: { approval_id: "a1", tool_name: "delete_contact" } as any,
    });

    const result = await resolveAndContinueApproval({} as any, {
      clientId: "c1",
      threadId: "t1",
      approvalId: "a1",
      approved: true,
    });

    expect(result.success).toBe(true);
    expect(resolveApprovalEvent).toHaveBeenCalled();
    // Empty input matches web's isApprovalContinuation path — no synthetic text
    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "c1",
        threadId: "t1",
        triggerType: "chat",
        input: "",
      }),
      expect.anything(),
    );
  });

  it("resolves approval but does NOT trigger run when denied", async () => {
    const { resolveApprovalEvent } = await import("@/lib/approvals/queries");
    const { runAgent } = await import("@/lib/runner/run-agent");

    vi.mocked(resolveApprovalEvent).mockResolvedValueOnce({
      success: true,
      status: "updated",
      event: { approval_id: "a1" } as any,
    });
    vi.mocked(runAgent).mockClear();

    const result = await resolveAndContinueApproval({} as any, {
      clientId: "c1",
      threadId: "t1",
      approvalId: "a1",
      approved: false,
    });

    expect(result.success).toBe(true);
    // Denied approvals don't trigger a continuation run
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("returns failure when approval not found", async () => {
    const { resolveApprovalEvent } = await import("@/lib/approvals/queries");

    vi.mocked(resolveApprovalEvent).mockResolvedValueOnce({
      success: false,
      status: "missing",
      error: "Not found",
    });

    const result = await resolveAndContinueApproval({} as any, {
      clientId: "c1",
      threadId: "t1",
      approvalId: "a1",
      approved: true,
    });

    expect(result.success).toBe(false);
  });

  it("returns success for already-resolved approvals without re-running", async () => {
    const { resolveApprovalEvent } = await import("@/lib/approvals/queries");
    const { runAgent } = await import("@/lib/runner/run-agent");

    vi.mocked(resolveApprovalEvent).mockResolvedValueOnce({
      success: true,
      status: "already_resolved",
      event: { status: "approved" } as any,
    });
    vi.mocked(runAgent).mockClear();

    const result = await resolveAndContinueApproval({} as any, {
      clientId: "c1",
      threadId: "t1",
      approvalId: "a1",
      approved: true,
    });

    expect(result.success).toBe(true);
    expect(runAgent).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run tests — expected FAIL**

```bash
npx vitest run src/lib/approvals/continue-after-approval.test.ts
```

**Step 3: Implement continue-after-approval.ts**

```typescript
/**
 * Shared server-side approval continuation.
 * Used by Telegram callback handler. The web flow (chat/route.ts) uses its own
 * UI-driven pattern and is intentionally not refactored.
 * @module lib/approvals/continue-after-approval
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveApprovalEvent } from "@/lib/approvals/queries";
import { runAgent } from "@/lib/runner/run-agent";
import type { Database } from "@/types/database";

interface ResolveAndContinueInput {
  clientId: string;
  threadId: string;
  approvalId: string;
  approved: boolean;
}

interface ResolveAndContinueResult {
  success: boolean;
  status: string;
}

/**
 * Resolves an approval event and optionally starts a continuation run.
 * - If approved: resolves DB record + triggers runAgent so the agent can
 *   execute the approved action. Output delivered via channel delivery layer.
 * - If denied: resolves DB record only. Agent doesn't continue.
 * - If already resolved: returns success without re-running.
 * - consumeMessageQuota is false — approval continuations are not user messages.
 */
export async function resolveAndContinueApproval(
  supabase: SupabaseClient<Database>,
  input: ResolveAndContinueInput,
): Promise<ResolveAndContinueResult> {
  const result = await resolveApprovalEvent(supabase, {
    clientId: input.clientId,
    approvalId: input.approvalId,
    approved: input.approved,
  });

  if (!result.success) {
    return { success: false, status: result.status };
  }

  if (result.status === "already_resolved") {
    return { success: true, status: "already_resolved" };
  }

  // Only trigger continuation for approvals, not denials.
  // When approved, the agent re-executes the gated tool call.
  // When denied, the user's denial is visible in the approval_events table;
  // the agent can be informed on the next user message.
  //
  // Uses empty input to match the web's isApprovalContinuation path in
  // app/api/chat/route.ts — the agent sees the resolved approval state in
  // thread history and knows to proceed. No synthetic "I approved" text
  // that would pollute conversation history.
  if (input.approved) {
    const agentResult = await runAgent(
      {
        clientId: input.clientId,
        threadId: input.threadId,
        triggerType: "chat",
        input: "",
      },
      supabase,
    );

    if (agentResult.status === "streaming") {
      // Consume stream to trigger onFinish → finalizeRun → channel delivery
      await agentResult.streamResult.text;
    }
  }

  return { success: true, status: "continued" };
}
```

**Step 4: Run tests — expected PASS**

```bash
npx vitest run src/lib/approvals/continue-after-approval.test.ts
```

**Step 5: Add callback_query handler to webhook route**

In `app/api/webhook/telegram/route.ts`, replace the placeholder callback_query handling in `processUpdate`:

Add imports at top:
```typescript
import { parseApprovalCallback } from "@/lib/channels/telegram/approvals";
import {
  parseQuestionCallback,
  formatQuestionResponse,
} from "@/lib/channels/telegram/questions";
import {
  consumePendingQuestion,
  consumePendingTextReply,
  clearPendingQuestionsForChat,
} from "@/lib/channels/telegram/pending-questions";
import { resolveAndContinueApproval } from "@/lib/approvals/continue-after-approval";
```

Replace the `callbackQuery` block in `processUpdate`:

```typescript
  } else if (callbackQuery) {
    await handleCallbackQuery(supabase, bot, callbackQuery);
  }
```

Add the handler function:

```typescript
async function handleCallbackQuery(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  bot: Bot,
  callbackQuery: Record<string, unknown>,
): Promise<void> {
  const data = callbackQuery.data as string | undefined;
  const callbackId = callbackQuery.id as string;

  if (!data) {
    await bot.api.answerCallbackQuery(callbackId);
    return;
  }

  // 1. Try approval callback
  const approvalResult = parseApprovalCallback(data);
  if (approvalResult) {
    await handleApprovalCallback(
      supabase,
      bot,
      callbackQuery,
      callbackId,
      approvalResult,
    );
    return;
  }

  // 2. Try question callback
  const questionResult = parseQuestionCallback(data);
  if (questionResult) {
    await handleQuestionCallback(
      supabase,
      bot,
      callbackQuery,
      callbackId,
      questionResult,
    );
    return;
  }

  await bot.api.answerCallbackQuery(callbackId);
}

async function handleApprovalCallback(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  bot: Bot,
  callbackQuery: Record<string, unknown>,
  callbackId: string,
  parsed: { action: "approve" | "deny"; approvalId: string },
): Promise<void> {
  const approved = parsed.action === "approve";

  // SECURITY: Resolve the chat's tenant boundary FIRST via channel mapping.
  // Never operate outside the current Telegram chat's client scope.
  const message = callbackQuery.message as Record<string, unknown> | undefined;
  if (!message) {
    await bot.api.answerCallbackQuery(callbackId);
    return;
  }

  const chatId = String((message.chat as Record<string, unknown>).id);

  const { data: mapping } = await supabase
    .from("conversation_channel_mappings")
    .select("client_id, thread_id")
    .eq("channel", "telegram")
    .eq("external_conversation_id", chatId)
    .maybeSingle();

  if (!mapping) {
    await bot.api.answerCallbackQuery(callbackId, { text: "Not connected." });
    return;
  }

  // Verify the approval belongs to this client (scoped query)
  const { data: approvalEvent } = await supabase
    .from("approval_events")
    .select("client_id, thread_id")
    .eq("approval_id", parsed.approvalId)
    .eq("client_id", mapping.client_id)
    .single();

  if (!approvalEvent) {
    await bot.api.answerCallbackQuery(callbackId, { text: "Approval not found." });
    return;
  }

  // Resolve and optionally continue
  const result = await resolveAndContinueApproval(supabase, {
    clientId: mapping.client_id,
    threadId: approvalEvent.thread_id,
    approvalId: parsed.approvalId,
    approved,
  });

  // Update the InlineKeyboard message to show the result
  const messageId = message.message_id as number;
  const originalText = (message.text as string) ?? "";
  const label = approved ? "✅ Approved" : "❌ Denied";

  try {
    await bot.api.editMessageText(
      Number(chatId),
      messageId,
      `${originalText}\n\n${label}`,
      { parse_mode: "HTML" },
    );
  } catch {
    // Message may have been deleted — non-critical
  }

  await bot.api.answerCallbackQuery(callbackId, {
    text: result.success
      ? (approved ? "Approved — agent continuing" : "Denied")
      : "Failed to process",
  });
}

async function handleQuestionCallback(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  bot: Bot,
  callbackQuery: Record<string, unknown>,
  callbackId: string,
  parsed: { requestId: string; optionIndex: number },
): Promise<void> {
  // Resolve from persisted pending question — NOT from current channel mapping.
  // This prevents stale buttons from routing to the wrong thread after /new.
  const pendingQuestion = await consumePendingQuestion(supabase, parsed.requestId);

  if (!pendingQuestion) {
    await bot.api.answerCallbackQuery(callbackId, {
      text: "This question has expired.",
    });
    return;
  }

  const selectedLabel =
    pendingQuestion.options[parsed.optionIndex] ??
    `Option ${parsed.optionIndex + 1}`;

  // Update the message to show the selection
  const message = callbackQuery.message as Record<string, unknown> | undefined;
  if (message) {
    const chatId = (message.chat as Record<string, unknown>).id as number;
    const messageId = message.message_id as number;
    const originalText = (message.text as string) ?? "";

    try {
      await bot.api.editMessageText(
        chatId,
        messageId,
        `${originalText}\n\n✅ ${selectedLabel}`,
        { parse_mode: "HTML" },
      );
    } catch {
      // Non-critical
    }
  }

  await bot.api.answerCallbackQuery(callbackId, { text: "Selected" });

  // Format response matching web UI format and send as next user message.
  // Uses client_id and thread_id from the persisted record, not current mapping.
  const responseText = formatQuestionResponse([
    { question: pendingQuestion.question, selectedOption: selectedLabel },
  ]);

  try {
    const result = await runAgent(
      {
        clientId: pendingQuestion.clientId,
        threadId: pendingQuestion.threadId,
        triggerType: "chat",
        input: responseText,
      },
      supabase,
    );

    if (result.status === "streaming") {
      await result.streamResult.text;
    }
  } catch (err) {
    console.error("[telegram/webhook] question continuation error:", err);
  }
}
```

**Step 6: Add /new cleanup — clear pending questions when conversation resets**

In the `handleNewCommand` function in `app/api/webhook/telegram/route.ts` (from PR41), add pending question cleanup before creating the new thread:

```typescript
  // Clear any pending questions for this chat (they belong to the old thread)
  await clearPendingQuestionsForChat(supabase, chatId);
```

Add this line right after the `if (!mapping)` guard and before the `conversation_threads` insert.

**Step 7: Add text-reply wrapping for unsupported question types**

In `handleRegularMessage` in the webhook route, add pending text-reply check BEFORE the existing `runAgent` call. If a pending text-reply question exists for this chat, wrap the user's text in Q:/A: format:

```typescript
  // Check for pending text-reply questions (multi_select/rank_priorities fallbacks).
  // If found, wrap the user's text in Q:/A: format so the agent gets structured input.
  const pendingTextReply = await consumePendingTextReply(supabase, chatId);
  let finalInput = inputText;

  if (pendingTextReply && inputText) {
    finalInput = formatQuestionResponse([
      { question: pendingTextReply.question, selectedOption: inputText },
    ]);
  }
```

Then pass `finalInput` (instead of `inputText`) to `runAgent`.

**Step 8: Type check**

```bash
npx tsc --noEmit 2>&1 | grep "webhook/telegram"
```

Expected: No type errors.

---

## Task 5: Extend channel delivery for approvals + questions

Extend `deliverToExternalChannels` (from PR41) to also detect approval-requested parts and ask_user_question tool output, and send the appropriate InlineKeyboard messages to Telegram.

**Files:**
- Modify: `src/lib/channels/deliver.ts`

**Step 1: Update deliverToExternalChannels signature**

Add `parts` parameter and approval/question detection:

```typescript
import type { PersistedPart } from "@/lib/runner/message-utils";

/**
 * Delivers assistant output to all external channels mapped to this thread.
 * Sends text as a regular message, approval requests as InlineKeyboard,
 * and ask_user_question outputs as InlineKeyboard options.
 */
export async function deliverToExternalChannels(
  supabase: SupabaseClient<Database>,
  threadId: string,
  clientId: string,
  text: string,
  parts?: ReadonlyArray<PersistedPart>,
): Promise<void> {
  if (!text.trim() && (!parts || parts.length === 0)) return;

  const { data: mappings } = await supabase
    .from("conversation_channel_mappings")
    .select("channel, external_conversation_id")
    .eq("thread_id", threadId)
    .eq("client_id", clientId);

  if (!mappings?.length) return;

  for (const mapping of mappings) {
    if (mapping.channel === "telegram") {
      try {
        // 1. Send text response
        if (text.trim()) {
          await deliverToTelegram(mapping.external_conversation_id, text);
        }

        // 2. Send approval InlineKeyboards (if any)
        if (parts) {
          await deliverApprovalsToTelegram(
            mapping.external_conversation_id,
            parts,
          );
          await deliverQuestionsToTelegram(
            supabase,
            mapping.external_conversation_id,
            clientId,
            threadId,
            parts,
          );
        }
      } catch (err) {
        console.error("[channel-delivery] Telegram delivery failed:", err);
      }
    }
  }
}
```

Add the approval and question delivery helpers:

```typescript
/**
 * Detects approval-requested parts and sends InlineKeyboard messages.
 */
async function deliverApprovalsToTelegram(
  chatId: string,
  parts: ReadonlyArray<PersistedPart>,
): Promise<void> {
  const approvalParts = parts.filter((p) => p.state === "approval-requested");
  if (approvalParts.length === 0) return;

  const {
    getTelegramBotToken,
    createTelegramBot,
  } = await import("@/lib/channels/telegram");
  const { sendTelegramApprovalRequest } = await import(
    "@/lib/channels/telegram/approvals"
  );

  let token: string;
  try {
    token = getTelegramBotToken();
  } catch {
    return;
  }

  const bot = createTelegramBot(token);

  for (const part of approvalParts) {
    const approval = typeof part.approval === "object" && part.approval !== null
      ? (part.approval as { id?: string })
      : null;
    const approvalId = approval?.id;
    const toolName = typeof part.type === "string" && part.type.startsWith("tool-")
      ? part.type.slice(5)
      : "unknown";
    const toolInput = typeof part.input === "object" && part.input !== null
      ? (part.input as Record<string, unknown>)
      : {};

    if (approvalId) {
      await sendTelegramApprovalRequest(
        bot.api,
        chatId,
        approvalId,
        toolName,
        toolInput,
      );
    }
  }
}

/**
 * Detects ask_user_question tool output and sends InlineKeyboard messages.
 * Persists pending question records with opaque callback tokens.
 * Unsupported question types get prose fallback + awaiting_text_reply record.
 */
async function deliverQuestionsToTelegram(
  supabase: SupabaseClient<Database>,
  chatId: string,
  clientId: string,
  threadId: string,
  parts: ReadonlyArray<PersistedPart>,
): Promise<void> {
  // Find tool-invocation parts for ask_user_question with output
  const questionParts = parts.filter(
    (p) =>
      p.type === "tool-ask_user_question" &&
      p.state === "output-available" &&
      typeof p.output === "object" &&
      p.output !== null,
  );
  if (questionParts.length === 0) return;

  const {
    getTelegramBotToken,
    createTelegramBot,
  } = await import("@/lib/channels/telegram");
  const {
    sendTelegramQuestion,
    isSupportedQuestionType,
    buildUnsupportedQuestionFallback,
  } = await import("@/lib/channels/telegram/questions");
  const { persistPendingQuestion } = await import(
    "@/lib/channels/telegram/pending-questions"
  );

  let botToken: string;
  try {
    botToken = getTelegramBotToken();
  } catch {
    return;
  }

  const bot = createTelegramBot(botToken);

  for (const part of questionParts) {
    const output = part.output as {
      questions?: Array<{ question: string; options: string[]; type?: string }>;
      status?: string;
    };
    if (output.status !== "awaiting_response" || !output.questions) continue;

    for (const q of output.questions) {
      const questionType = q.type ?? "single_select";

      if (isSupportedQuestionType(questionType)) {
        // single_select → persist pending question + send InlineKeyboard with opaque token
        const callbackToken = await persistPendingQuestion(supabase, {
          clientId,
          threadId,
          chatId,
          question: q.question,
          options: q.options,
          questionType,
          awaitingTextReply: false,
        });

        await sendTelegramQuestion(
          bot.api,
          chatId,
          callbackToken, // opaque token, not raw toolCallId
          q.question,
          q.options,
        );
      } else {
        // multi_select / rank_priorities → prose fallback + pending text-reply record
        await persistPendingQuestion(supabase, {
          clientId,
          threadId,
          chatId,
          question: q.question,
          options: q.options,
          questionType,
          awaitingTextReply: true, // next text reply will be wrapped in Q:/A: format
        });

        const fallbackText = buildUnsupportedQuestionFallback(
          q.question,
          q.options,
          questionType,
        );
        await bot.api.sendMessage(Number(chatId), fallbackText, {
          parse_mode: "HTML",
        });
      }
    }
  }
}
```

**Step 2: Add `hasExternalDeliverables` predicate + update finalizeRun**

Add the predicate to `src/lib/channels/deliver.ts`:

```typescript
/**
 * Returns true if a completed run has content that should be delivered to
 * external channels. Covers: text responses, approval-requested parts,
 * ask_user_question tool outputs, and any future deliverable part types.
 * Without this check, a question-only turn with no prose would be silently dropped.
 */
export function hasExternalDeliverables(
  text: string,
  parts?: ReadonlyArray<PersistedPart>,
): boolean {
  if (text.trim().length > 0) return true;
  if (!parts) return false;

  return parts.some((p) =>
    p.state === "approval-requested" ||
    (p.type === "tool-ask_user_question" &&
      p.state === "output-available" &&
      typeof p.output === "object" &&
      p.output !== null),
  );
}
```

In `src/lib/runner/run-persistence.ts`, update the delivery call (added in PR41) to use the predicate and pass `parts`:

```typescript
  import { deliverToExternalChannels, hasExternalDeliverables } from "@/lib/channels/deliver";

  // Deliver to external channels (Telegram, etc.) before draining queue.
  if (hasExternalDeliverables(contentText, parts)) {
    await deliverToExternalChannels(supabase, threadId, clientId, contentText, parts)
      .catch((err) =>
        console.error(`[${logLabel}] external channel delivery failed:`, err),
      );
  }
```

Also update the early-return guard in `deliverToExternalChannels` to use the same predicate:

```typescript
export async function deliverToExternalChannels(
  supabase: SupabaseClient<Database>,
  threadId: string,
  clientId: string,
  text: string,
  parts?: ReadonlyArray<PersistedPart>,
): Promise<void> {
  if (!hasExternalDeliverables(text, parts)) return;
  // ... rest of lookup unchanged, but deliverQuestionsToTelegram now receives
  // supabase, clientId, threadId to persist pending question records.
```

**Step 3: Type check + run tests**

```bash
npx tsc --noEmit
npx vitest run src/lib/channels/
npx vitest run src/lib/runner/__tests__/
```

Expected: All PASS, no type errors.

---

## Task 6: Disconnect (unpairing)

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

In `app/(dashboard)/settings/telegram-connect-card.tsx`, update the `isConnected` branch and add the disconnect handler:

Replace the connected state rendering:
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
) : /* ... existing connect flow unchanged ... */}
```

Add the disconnect handler alongside the existing `handleGenerateLink`:

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
    window.location.reload();
  } catch (err) {
    setError(err instanceof Error ? err.message : "Unknown error");
  } finally {
    setIsLoading(false);
  }
}
```

**Step 3: Update barrel exports**

In `src/lib/channels/telegram/index.ts`, add:

```typescript
export {
  buildApprovalText,
  buildApprovalKeyboard,
  buildApprovalCallbackData,
  parseApprovalCallback,
  sendTelegramApprovalRequest,
} from "./approvals";
export {
  buildQuestionText,
  buildQuestionKeyboard,
  parseQuestionCallback,
  formatQuestionResponse,
  isSupportedQuestionType,
  buildUnsupportedQuestionFallback,
  sendTelegramQuestion,
} from "./questions";
export {
  generateQuestionCallbackToken,
  persistPendingQuestion,
  consumePendingQuestion,
  consumePendingTextReply,
  clearPendingQuestionsForChat,
  type PendingQuestionInput,
  type ResolvedPendingQuestion,
} from "./pending-questions";
```

**Step 4: Type check**

```bash
npx tsc --noEmit
```

---

## Task 7: Additional tests + commit + integration test criteria

**Step 1: Write hasExternalDeliverables test**

```typescript
// src/lib/channels/__tests__/has-external-deliverables.test.ts
import { describe, expect, it } from "vitest";

import { hasExternalDeliverables } from "../deliver";

describe("hasExternalDeliverables", () => {
  it("returns true for non-empty text", () => {
    expect(hasExternalDeliverables("hello")).toBe(true);
  });

  it("returns false for empty text and no parts", () => {
    expect(hasExternalDeliverables("")).toBe(false);
    expect(hasExternalDeliverables("  ")).toBe(false);
  });

  it("returns true for approval-requested parts with empty text", () => {
    expect(hasExternalDeliverables("", [
      { state: "approval-requested", type: "tool-delete_contact" } as any,
    ])).toBe(true);
  });

  it("returns true for ask_user_question output with empty text", () => {
    expect(hasExternalDeliverables("", [
      {
        type: "tool-ask_user_question",
        state: "output-available",
        output: { questions: [], status: "awaiting_response" },
      } as any,
    ])).toBe(true);
  });

  it("returns false for unrelated tool parts with empty text", () => {
    expect(hasExternalDeliverables("", [
      { type: "tool-search_contacts", state: "output-available", output: {} } as any,
    ])).toBe(false);
  });
});
```

**Step 2: Write callback security tests (real route-level)**

```typescript
// app/api/webhook/telegram/__tests__/callback-security.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

import { parseApprovalCallback } from "@/lib/channels/telegram/approvals";

// Mock the full dependency chain for route-level testing
vi.mock("next/server", () => ({ after: vi.fn((fn: () => Promise<void>) => fn()) }));
vi.mock("@/lib/channels/telegram/bot", () => ({
  getTelegramBotToken: vi.fn(() => "test:TOKEN"),
}));
vi.mock("grammy", () => ({
  Bot: vi.fn().mockImplementation(() => ({
    token: "test:TOKEN",
    api: {
      sendMessage: vi.fn().mockResolvedValue({}),
      sendChatAction: vi.fn().mockResolvedValue({}),
      answerCallbackQuery: vi.fn().mockResolvedValue({}),
      editMessageText: vi.fn().mockResolvedValue({}),
    },
  })),
}));

const mockSupabase = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn().mockResolvedValue(mockSupabase),
}));

vi.mock("@/lib/approvals/continue-after-approval", () => ({
  resolveAndContinueApproval: vi.fn().mockResolvedValue({ success: true, status: "continued" }),
}));

describe("approval callback security — parser", () => {
  it("rejects empty data", () => {
    expect(parseApprovalCallback("")).toBeNull();
  });

  it("rejects unknown actions", () => {
    expect(parseApprovalCallback("delete:abc")).toBeNull();
  });

  it("only accepts approve or deny", () => {
    expect(parseApprovalCallback("approve:id1")).not.toBeNull();
    expect(parseApprovalCallback("deny:id1")).not.toBeNull();
  });
});

describe("approval callback security — tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects approval callback when chat has no channel mapping", async () => {
    // Chat 999 has no mapping → callback should be rejected
    const selectChain = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      }),
    };
    mockSupabase.from.mockReturnValue(selectChain);

    const { POST } = await import("../route");

    const request = new Request("http://localhost/api/webhook/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        update_id: 1,
        callback_query: {
          id: "cb1",
          data: "approve:some-approval-id",
          message: { chat: { id: 999 }, message_id: 1, text: "Approval" },
        },
      }),
    });

    await POST(request);

    // resolveAndContinueApproval should NOT have been called
    const { resolveAndContinueApproval } = await import(
      "@/lib/approvals/continue-after-approval"
    );
    expect(resolveAndContinueApproval).not.toHaveBeenCalled();
  });
});

describe("question callback — stale button after /new", () => {
  it("returns 'expired' when pending question record does not exist", async () => {
    // Simulate: user tapped old question button, but /new cleared the record.
    vi.mock("@/lib/channels/telegram/pending-questions", () => ({
      consumePendingQuestion: vi.fn().mockResolvedValue(null),
      consumePendingTextReply: vi.fn().mockResolvedValue(null),
      clearPendingQuestionsForChat: vi.fn().mockResolvedValue(undefined),
    }));

    const { POST } = await import("../route");
    const { Bot } = await import("grammy");
    const botInstance = new Bot("test:TOKEN");

    const request = new Request("http://localhost/api/webhook/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        update_id: 2,
        callback_query: {
          id: "cb2",
          data: "q:expired-token:0",
          message: { chat: { id: 123 }, message_id: 2, text: "Question" },
        },
      }),
    });

    await POST(request);

    // answerCallbackQuery should have been called with "expired" message
    expect(botInstance.api.answerCallbackQuery).toHaveBeenCalledWith(
      "cb2",
      expect.objectContaining({ text: "This question has expired." }),
    );
  });
});
```

**Step 3: Run all tests**

```bash
npx vitest run src/lib/channels/
npx vitest run src/lib/approvals/
npx vitest run src/lib/runner/__tests__/
npx vitest run app/api/webhook/telegram/__tests__/
npx tsc --noEmit
```

Expected: All PASS, no type errors.

**Step 2: Commit all PR42 work**

```bash
git add \
  src/lib/channels/telegram/approvals.ts \
  src/lib/channels/telegram/approvals.test.ts \
  src/lib/channels/telegram/questions.ts \
  src/lib/channels/telegram/questions.test.ts \
  src/lib/channels/telegram/pending-questions.ts \
  src/lib/channels/telegram/pending-questions.test.ts \
  src/lib/channels/telegram/index.ts \
  src/lib/channels/deliver.ts \
  src/lib/channels/__tests__/ \
  src/lib/approvals/continue-after-approval.ts \
  src/lib/approvals/continue-after-approval.test.ts \
  src/lib/runner/run-persistence.ts \
  app/api/webhook/telegram/ \
  app/api/telegram/disconnect/route.ts \
  app/\(dashboard\)/settings/telegram-connect-card.tsx \
  supabase/migrations/*telegram_pending_questions* \
  src/types/database.ts

git commit -m "feat(pr42): Telegram approvals, question adapter, pending questions, unpairing"
```

**Step 3: Integration test criteria (manual)**

Prerequisites: PR41 complete, bot paired via Settings.

**Test: Approval via Telegram InlineKeyboard**
1. Send a message to the agent that triggers an approval-gated action (e.g., "delete the contact John Tan")
2. Verify: agent text response arrives in Telegram ("I need your approval to delete...")
3. Verify: InlineKeyboard message arrives with "Allow" and "Deny" buttons
4. Tap "Allow"
5. Verify: InlineKeyboard message updates to show "✅ Approved"
6. Verify: agent continues execution — response delivered to Telegram (via channel delivery layer)
7. Repeat with "Deny" — verify message shows "❌ Denied", agent does not continue

**Test: Question via Telegram InlineKeyboard**
1. Send a message that triggers ask_user_question (e.g., "which contact should I follow up with?")
2. Verify: InlineKeyboard message arrives with option buttons matching the question options
3. Tap an option
4. Verify: message updates to show "✅ [selected option]"
5. Verify: agent receives the formatted response ("Q: ...\nA: ...") and continues

**Test: Disconnect**
1. Go to Settings → Telegram card
2. Click "Disconnect Telegram"
3. Send a message to the bot in Telegram
4. Verify: bot responds "Please connect your account first..."
5. Verify: Settings card shows "Connect Telegram" button again

Test criteria from v2 plan:
- [ ] Approval-gated action triggers InlineKeyboard in Telegram, tap Approve/Deny resolves correctly
- [ ] Agent continues execution after approval (delivered via channel delivery layer)
- [ ] Full agent interaction via Telegram including approvals
- [ ] ask_user_question (single_select) renders as InlineKeyboard, response feeds back to agent in Q:/A: format
- [ ] ask_user_question (multi_select/rank_priorities) degrades to prose fallback, next text reply wrapped in Q:/A: format
- [ ] Tapping an old question button after `/new` shows "This question has expired" (pending question cleared)
- [ ] Approval callback from an unpaired chat is rejected (tenant isolation)
- [ ] Disconnect from Settings, bot no longer responds
