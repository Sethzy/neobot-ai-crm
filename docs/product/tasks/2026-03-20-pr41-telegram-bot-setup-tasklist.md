# Telegram Integration — Bot Setup + Pairing Implementation Plan

**PR:** PR 41: Telegram integration — bot setup
**Decisions:** GAP-09, UX-07, SESSION-01, EXEC-01
**Goal:** User can pair their Telegram account and chat with the Sunder agent via Telegram.

**Architecture:** Serverless webhook on Vercel receives Telegram updates via grammy. Deep link `/start` token flow pairs a Telegram user to a Sunder client. Messages route through existing `conversation_channel_mappings` → `runAgent()` → grammy `sendMessage`. Formatting copied from dorabot (markdown→HTML, sanitization, smart chunking). See drift analysis: `roadmap docs/Sunder - Source of Truth/references/nanoclaw-dorabot/telegram-drift-analysis.md`.

**Tech Stack:** grammy ^1.21.0, Vitest, Supabase (Postgres + RLS), Next.js App Router API routes, Vercel Functions

**Reference code:** `/Users/sethlim/Documents/dorabot/src/channels/telegram/` — format.ts and send.ts are copied with minimal adaptation.

---

## Relevant Files

### Create
- `src/lib/channels/telegram/format.ts` — markdown→HTML conversion (copied from dorabot)
- `src/lib/channels/telegram/format.test.ts` — tests for format functions
- `src/lib/channels/telegram/send.ts` — message sending + chunking (copied from dorabot)
- `src/lib/channels/telegram/send.test.ts` — tests for send functions
- `src/lib/channels/telegram/bot.ts` — bot factory + token resolution
- `src/lib/channels/telegram/bot.test.ts` — tests for bot creation
- `src/lib/channels/telegram/index.ts` — barrel exports
- `src/lib/channels/telegram/pairing.ts` — pairing token generation + validation
- `src/lib/channels/telegram/pairing.test.ts` — tests for pairing
- `app/api/webhook/telegram/route.ts` — webhook POST handler
- `app/api/telegram/generate-pairing-link/route.ts` — pairing link API
- `supabase/migrations/XXXXXXXX_create_telegram_pairing_tokens.sql` — pairing tokens table

### Modify
- `app/(dashboard)/settings/page.tsx` — add Connect Telegram card
- `package.json` — add grammy dependency

### Reference (read, don't modify)
- `src/lib/runner/run-agent.ts` — `runAgent()` interface
- `src/lib/runner/schemas.ts` — `RunnerPayload` type
- `src/lib/supabase/server.ts` — `createAdminClient()` for webhook context
- `src/lib/chat/client-id.ts` — `resolveClientId()` pattern
- `src/lib/api/route-helpers.ts` — `authenticateRequest()`, `jsonError()`
- `supabase/migrations/20260304213000_create_channel_mappings_and_delivery_receipts.sql` — existing channel tables
- `app/api/chat/route.ts` — web chat flow to mirror

---

## Task 1: Install grammy and verify setup

**Files:**
- Modify: `package.json`

**Step 1: Install grammy**

```bash
npm install grammy
```

We skip `@grammyjs/runner` — webhook mode doesn't need it. If local dev polling is needed later, add it then.

**Step 2: Verify installation**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No new type errors.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(pr41): install grammy for Telegram bot integration"
```

---

## Task 2: Telegram message formatting (markdownToTelegramHtml + sanitizeTelegramHtml)

Copied from dorabot with minimal adaptation (remove `.js` extensions from imports since we use TypeScript path resolution).

**Files:**
- Create: `src/lib/channels/telegram/format.ts`
- Create: `src/lib/channels/telegram/format.test.ts`

**Step 1: Write failing tests for `markdownToTelegramHtml`**

```typescript
// src/lib/channels/telegram/format.test.ts
import { describe, expect, it } from "vitest";

import { markdownToTelegramHtml, sanitizeTelegramHtml } from "./format";

describe("markdownToTelegramHtml", () => {
  it("converts bold **text** to <b>", () => {
    expect(markdownToTelegramHtml("**hello**")).toBe("<b>hello</b>");
  });

  it("converts italic *text* to <i>", () => {
    expect(markdownToTelegramHtml("*hello*")).toBe("<i>hello</i>");
  });

  it("converts strikethrough ~~text~~ to <s>", () => {
    expect(markdownToTelegramHtml("~~hello~~")).toBe("<s>hello</s>");
  });

  it("converts inline code to <code>", () => {
    expect(markdownToTelegramHtml("`code`")).toBe("<code>code</code>");
  });

  it("converts code blocks to <pre><code>", () => {
    const input = "```ts\nconst x = 1;\n```";
    const result = markdownToTelegramHtml(input);
    expect(result).toContain('<pre><code class="language-ts">');
    expect(result).toContain("const x = 1;");
  });

  it("converts markdown links to <a>", () => {
    expect(markdownToTelegramHtml("[click](https://example.com)")).toBe(
      '<a href="https://example.com">click</a>',
    );
  });

  it("converts headings to bold", () => {
    expect(markdownToTelegramHtml("## Title")).toBe("<b>Title</b>");
  });

  it("converts blockquotes", () => {
    expect(markdownToTelegramHtml("> quoted")).toBe(
      "<blockquote>quoted</blockquote>",
    );
  });

  it("escapes HTML entities in plain text", () => {
    expect(markdownToTelegramHtml("a < b & c > d")).toBe(
      "a &lt; b &amp; c &gt; d",
    );
  });

  it("does not double-escape existing HTML tags", () => {
    const input = "<b>already bold</b>";
    const result = markdownToTelegramHtml(input);
    expect(result).toContain("<b>already bold</b>");
  });

  it("protects code blocks from markdown processing", () => {
    const input = "```\n**not bold**\n```";
    const result = markdownToTelegramHtml(input);
    expect(result).not.toContain("<b>");
    expect(result).toContain("**not bold**");
  });
});

describe("sanitizeTelegramHtml", () => {
  it("passes through supported tags", () => {
    expect(sanitizeTelegramHtml("<b>bold</b>")).toBe("<b>bold</b>");
  });

  it("strips unsupported tags", () => {
    expect(sanitizeTelegramHtml("<div>text</div>")).toBe("text");
  });

  it("closes unclosed tags", () => {
    expect(sanitizeTelegramHtml("<b>unclosed")).toBe("<b>unclosed</b>");
  });

  it("drops orphaned closing tags", () => {
    expect(sanitizeTelegramHtml("text</b>")).toBe("text");
  });

  it("fixes misnested tags", () => {
    const result = sanitizeTelegramHtml("<b><i>text</b></i>");
    expect(result).toContain("</i>");
    expect(result).toContain("</b>");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/channels/telegram/format.test.ts
```

Expected: FAIL — module `./format` not found.

**Step 3: Implement format.ts**

Create `src/lib/channels/telegram/format.ts` — copy from dorabot's `format.ts` verbatim, adding file-level JSDoc:

```typescript
/**
 * Markdown → Telegram HTML conversion and sanitization.
 * Copied from dorabot/src/channels/telegram/format.ts with zero drift.
 * @module lib/channels/telegram/format
 */

// [paste exact contents of dorabot format.ts here]
// See: /Users/sethlim/Documents/dorabot/src/channels/telegram/format.ts
```

The full implementation is in the dorabot reference. Copy the `markdownToTelegramHtml`, `escapeHtml`, `SUPPORTED_TAGS`, and `sanitizeTelegramHtml` functions exactly.

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/channels/telegram/format.test.ts
```

Expected: All PASS.

**Step 5: Commit**

```bash
git add src/lib/channels/telegram/format.ts src/lib/channels/telegram/format.test.ts
git commit -m "feat(pr41): add Telegram message formatting (markdown→HTML)"
```

---

## Task 3: Telegram message sending + smart chunking

**Files:**
- Create: `src/lib/channels/telegram/send.ts`
- Create: `src/lib/channels/telegram/send.test.ts`

**Step 1: Write failing tests for pure functions (normalizeTelegramChatId, splitTelegramMessage)**

```typescript
// src/lib/channels/telegram/send.test.ts
import { describe, expect, it } from "vitest";

import { normalizeTelegramChatId, splitTelegramMessage } from "./send";

describe("normalizeTelegramChatId", () => {
  it("returns number for numeric string", () => {
    expect(normalizeTelegramChatId("12345")).toBe(12345);
  });

  it("returns @username as-is", () => {
    expect(normalizeTelegramChatId("@mychannel")).toBe("@mychannel");
  });

  it("prepends @ to non-numeric non-@ string", () => {
    expect(normalizeTelegramChatId("mychannel")).toBe("@mychannel");
  });

  it("trims whitespace", () => {
    expect(normalizeTelegramChatId("  12345  ")).toBe(12345);
  });
});

describe("splitTelegramMessage", () => {
  it("returns single chunk for short text", () => {
    expect(splitTelegramMessage("hello")).toEqual(["hello"]);
  });

  it("splits at paragraph boundary", () => {
    const text = "a".repeat(3000) + "\n\n" + "b".repeat(500);
    const chunks = splitTelegramMessage(text);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe("a".repeat(3000));
    expect(chunks[1]).toBe("b".repeat(500));
  });

  it("splits at line boundary when no paragraph break", () => {
    const text = "a".repeat(3000) + "\n" + "b".repeat(1500);
    const chunks = splitTelegramMessage(text, 4000);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe("a".repeat(3000));
  });

  it("respects custom limit", () => {
    const text = "hello world";
    expect(splitTelegramMessage(text, 5)).toEqual(["hello", "world"]);
  });

  it("does not split inside unclosed HTML block tags", () => {
    const text = "<pre>" + "x".repeat(5000) + "</pre>";
    const chunks = splitTelegramMessage(text, 4000);
    // Should close/reopen the <pre> tag at split point
    expect(chunks[0]).toContain("</pre>");
    expect(chunks[1]).toContain("<pre>");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/channels/telegram/send.test.ts
```

Expected: FAIL — module `./send` not found.

**Step 3: Implement send.ts**

Create `src/lib/channels/telegram/send.ts` — copy from dorabot's `send.ts`. Adaptations:
- Remove `sendMedia` function (media deferred per drift analysis 4.6)
- Remove `import { lookup } from 'mime-types'` and `import { InputFile } from 'grammy'` (not needed without media)
- Remove `.js` from import path (`'./format.js'` → `'./format'`)
- Add file-level JSDoc

Keep these functions exactly as dorabot:
- `normalizeTelegramChatId()`
- `isInsideTag()`
- `getUnclosedTags()`
- `splitTelegramMessage()`
- `sendTelegramMessage()` (minus media branch)
- `editTelegramMessage()`
- `deleteTelegramMessage()`

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/channels/telegram/send.test.ts
```

Expected: All PASS.

**Step 5: Commit**

```bash
git add src/lib/channels/telegram/send.ts src/lib/channels/telegram/send.test.ts
git commit -m "feat(pr41): add Telegram message sending with smart chunking"
```

---

## Task 4: Telegram bot factory

**Files:**
- Create: `src/lib/channels/telegram/bot.ts`
- Create: `src/lib/channels/telegram/bot.test.ts`
- Create: `src/lib/channels/telegram/index.ts`

**Step 1: Write failing test for bot creation**

```typescript
// src/lib/channels/telegram/bot.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { getTelegramBotToken, createTelegramBot } from "./bot";

describe("getTelegramBotToken", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns token from TELEGRAM_BOT_TOKEN env var", () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:ABC";
    expect(getTelegramBotToken()).toBe("123:ABC");
  });

  it("throws if no token configured", () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(() => getTelegramBotToken()).toThrow("TELEGRAM_BOT_TOKEN");
  });

  it("trims whitespace from token", () => {
    process.env.TELEGRAM_BOT_TOKEN = "  123:ABC  ";
    expect(getTelegramBotToken()).toBe("123:ABC");
  });
});

describe("createTelegramBot", () => {
  it("creates a Bot instance with the given token", () => {
    const bot = createTelegramBot("123:ABC");
    expect(bot).toBeDefined();
    expect(bot.token).toBe("123:ABC");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/channels/telegram/bot.test.ts
```

Expected: FAIL — module `./bot` not found.

**Step 3: Implement bot.ts**

```typescript
/**
 * Telegram bot factory and token resolution.
 * Adapted from dorabot/src/channels/telegram/bot.ts — env-var-only token resolution.
 * @module lib/channels/telegram/bot
 */
import { Bot } from "grammy";

/**
 * Resolves the Telegram bot token from environment variables.
 * Sunder convention: env var only (no file-based token storage).
 */
export function getTelegramBotToken(): string {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();

  if (!token) {
    throw new Error(
      "No Telegram bot token found. Set TELEGRAM_BOT_TOKEN environment variable.",
    );
  }

  return token;
}

/** Creates a grammy Bot instance with the given token. */
export function createTelegramBot(token: string): Bot {
  return new Bot(token);
}
```

**Step 4: Create barrel export**

```typescript
// src/lib/channels/telegram/index.ts
/**
 * Telegram channel integration.
 * @module lib/channels/telegram
 */
export { getTelegramBotToken, createTelegramBot } from "./bot";
export { markdownToTelegramHtml, sanitizeTelegramHtml } from "./format";
export {
  sendTelegramMessage,
  editTelegramMessage,
  deleteTelegramMessage,
  splitTelegramMessage,
  normalizeTelegramChatId,
} from "./send";
```

**Step 5: Run tests to verify they pass**

```bash
npx vitest run src/lib/channels/telegram/bot.test.ts
```

Expected: All PASS.

**Step 6: Commit**

```bash
git add src/lib/channels/telegram/bot.ts src/lib/channels/telegram/bot.test.ts src/lib/channels/telegram/index.ts
git commit -m "feat(pr41): add Telegram bot factory and barrel exports"
```

---

## Task 5: Pairing tokens migration

**Files:**
- Create: `supabase/migrations/XXXXXXXX_create_telegram_pairing_tokens.sql`

**Step 1: Write the migration**

Use the current timestamp for the filename (e.g., `20260320000000`).

```sql
-- PR41: Telegram deep-link pairing tokens (short-lived, single-use).
-- User generates a token in Settings, taps t.me/SunderBot?start=<token>,
-- webhook validates and creates channel_mapping.

CREATE TABLE public.telegram_pairing_tokens (
  token TEXT PRIMARY KEY,
  client_id UUID NOT NULL
    REFERENCES public.clients(client_id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_pairing_tokens_client_id
  ON public.telegram_pairing_tokens(client_id);

COMMENT ON TABLE public.telegram_pairing_tokens IS
  'Short-lived, single-use tokens for Telegram deep-link account pairing.';

-- RLS: clients can only see/create their own tokens.
ALTER TABLE public.telegram_pairing_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY telegram_pairing_tokens_select_own
  ON public.telegram_pairing_tokens
  FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY telegram_pairing_tokens_insert_own
  ON public.telegram_pairing_tokens
  FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY telegram_pairing_tokens_delete_own
  ON public.telegram_pairing_tokens
  FOR DELETE
  USING (client_id = public.get_my_client_id());

-- Service-role policy for webhook context (admin client bypasses RLS,
-- but explicit policy documents intent).
```

**Step 2: Apply migration locally**

```bash
npx supabase db reset
```

Or if using linked project:

```bash
npx supabase migration up --local
```

Expected: Migration applies without errors.

**Step 3: Regenerate database types**

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

**Step 4: Commit**

```bash
git add supabase/migrations/*_create_telegram_pairing_tokens.sql src/types/database.ts
git commit -m "feat(pr41): add telegram_pairing_tokens migration"
```

---

## Task 6: Pairing logic (generate token + validate /start)

**Files:**
- Create: `src/lib/channels/telegram/pairing.ts`
- Create: `src/lib/channels/telegram/pairing.test.ts`

**Step 1: Write failing tests for token generation and validation**

```typescript
// src/lib/channels/telegram/pairing.test.ts
import { describe, expect, it } from "vitest";

import { generatePairingToken, isPairingTokenFormat } from "./pairing";

describe("generatePairingToken", () => {
  it("returns a base64url string", () => {
    const token = generatePairingToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is at most 64 characters (Telegram /start limit)", () => {
    const token = generatePairingToken();
    expect(token.length).toBeLessThanOrEqual(64);
  });

  it("generates unique tokens", () => {
    const a = generatePairingToken();
    const b = generatePairingToken();
    expect(a).not.toBe(b);
  });
});

describe("isPairingTokenFormat", () => {
  it("accepts valid base64url tokens", () => {
    expect(isPairingTokenFormat("abc123_-XYZ")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isPairingTokenFormat("")).toBe(false);
  });

  it("rejects tokens with invalid characters", () => {
    expect(isPairingTokenFormat("abc 123")).toBe(false);
    expect(isPairingTokenFormat("abc+123")).toBe(false);
  });

  it("rejects tokens longer than 64 chars", () => {
    expect(isPairingTokenFormat("a".repeat(65))).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/channels/telegram/pairing.test.ts
```

Expected: FAIL — module `./pairing` not found.

**Step 3: Implement pairing.ts**

```typescript
/**
 * Telegram deep-link pairing token utilities.
 * Tokens are base64url-encoded, max 64 chars (Telegram /start parameter limit).
 * @module lib/channels/telegram/pairing
 */
import { randomBytes } from "node:crypto";

/** Generates a cryptographically random base64url token (22 chars from 16 bytes). */
export function generatePairingToken(): string {
  return randomBytes(16).toString("base64url");
}

/** Token validity window in milliseconds (10 minutes). */
export const PAIRING_TOKEN_TTL_MS = 10 * 60 * 1000;

/** Validates that a string matches Telegram's /start parameter format. */
export function isPairingTokenFormat(token: string): boolean {
  if (!token || token.length > 64) return false;
  return /^[A-Za-z0-9_-]+$/.test(token);
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/channels/telegram/pairing.test.ts
```

Expected: All PASS.

**Step 5: Commit**

```bash
git add src/lib/channels/telegram/pairing.ts src/lib/channels/telegram/pairing.test.ts
git commit -m "feat(pr41): add Telegram pairing token utilities"
```

---

## Task 7: Generate pairing link API route

**Files:**
- Create: `app/api/telegram/generate-pairing-link/route.ts`

**Step 1: Implement the route**

```typescript
/**
 * POST /api/telegram/generate-pairing-link
 * Authenticated endpoint that generates a Telegram deep-link pairing URL.
 * Returns: { url: "https://t.me/SunderBot?start=<token>" }
 * @module app/api/telegram/generate-pairing-link/route
 */
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import {
  generatePairingToken,
  PAIRING_TOKEN_TTL_MS,
} from "@/lib/channels/telegram/pairing";

export async function POST(): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  const clientId = await resolveClientId(supabase, userId);

  const botUsername = (process.env.TELEGRAM_BOT_USERNAME ?? "").trim();
  if (!botUsername) {
    return jsonError("Telegram bot not configured.", 500);
  }

  const token = generatePairingToken();
  const expiresAt = new Date(Date.now() + PAIRING_TOKEN_TTL_MS).toISOString();

  const { error } = await supabase
    .from("telegram_pairing_tokens")
    .insert({ token, client_id: clientId, expires_at: expiresAt });

  if (error) {
    console.error("[telegram/pairing] Failed to insert token:", error);
    return jsonError("Failed to generate pairing link.", 500);
  }

  const url = `https://t.me/${botUsername}?start=${token}`;

  return Response.json({ url, expiresInSeconds: PAIRING_TOKEN_TTL_MS / 1000 });
}
```

**Step 2: Test manually (or skip — integration test in Task 9)**

This route depends on Supabase auth context. Full integration test deferred to Task 9. Verify the route file compiles:

```bash
npx tsc --noEmit 2>&1 | grep "generate-pairing-link"
```

Expected: No type errors for this file.

**Step 3: Commit**

```bash
git add app/api/telegram/generate-pairing-link/route.ts
git commit -m "feat(pr41): add POST /api/telegram/generate-pairing-link endpoint"
```

---

## Task 8: Telegram webhook route

This is the core of the integration. It handles:
1. Webhook verification (`X-Telegram-Bot-Api-Secret-Token`)
2. `/start <token>` pairing flow
3. Regular messages → `runAgent()` → send response

**Files:**
- Create: `app/api/webhook/telegram/route.ts`

**Step 1: Implement the webhook route**

```typescript
/**
 * POST /api/webhook/telegram
 * Receives Telegram updates via webhook. Handles:
 * - /start <token> pairing flow
 * - Regular messages → runAgent() → Telegram reply
 * Uses service-role Supabase client (no auth cookies in webhook context).
 * @module app/api/webhook/telegram/route
 */
import { Bot } from "grammy";
import { webhookCallback } from "grammy/web";

import { createAdminClient } from "@/lib/supabase/server";
import {
  getTelegramBotToken,
  sendTelegramMessage,
} from "@/lib/channels/telegram";
import { isPairingTokenFormat } from "@/lib/channels/telegram/pairing";
import { runAgent } from "@/lib/runner/run-agent";

/** Allow longer runs for agent processing. */
export const maxDuration = 120;

/**
 * Lazily-initialized bot singleton.
 * Vercel Functions may reuse the module scope across invocations.
 */
let _bot: Bot | null = null;

function getBot(): Bot {
  if (!_bot) {
    _bot = new Bot(getTelegramBotToken());
  }
  return _bot;
}

export async function POST(request: Request): Promise<Response> {
  // 1. Verify webhook secret
  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
  if (secret) {
    const headerSecret = request.headers.get(
      "X-Telegram-Bot-Api-Secret-Token",
    );
    if (headerSecret !== secret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  // 2. Parse update
  let update: Record<string, unknown>;
  try {
    update = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const supabase = await createAdminClient();
  const bot = getBot();

  // 3. Handle /start pairing command
  const message = update.message as Record<string, unknown> | undefined;
  if (message) {
    const text = (message.text as string) ?? "";
    const chat = message.chat as Record<string, unknown>;
    const chatId = String(chat.id);

    if (text.startsWith("/start ")) {
      const token = text.slice(7).trim();
      return handleStartCommand(supabase, bot, chatId, token);
    }

    if (text.startsWith("/start")) {
      // /start without a token — just greet
      await bot.api.sendMessage(
        Number(chatId),
        "Welcome to Sunder! Use the pairing link from your dashboard to connect.",
      );
      return new Response("OK", { status: 200 });
    }

    // 4. Regular message — route to agent
    return handleRegularMessage(supabase, bot, chatId, text, update);
  }

  // 5. Non-message updates (e.g., callback_query) — handled in PR 42
  return new Response("OK", { status: 200 });
}

async function handleStartCommand(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  bot: Bot,
  chatId: string,
  token: string,
): Promise<Response> {
  if (!isPairingTokenFormat(token)) {
    await bot.api.sendMessage(
      Number(chatId),
      "Invalid pairing link. Generate a new one from your Sunder dashboard.",
    );
    return new Response("OK", { status: 200 });
  }

  // Validate token
  const { data: tokenRow, error: lookupError } = await supabase
    .from("telegram_pairing_tokens")
    .select("client_id, expires_at")
    .eq("token", token)
    .single();

  if (lookupError || !tokenRow) {
    await bot.api.sendMessage(
      Number(chatId),
      "Invalid or expired pairing link. Generate a new one from your Sunder dashboard.",
    );
    return new Response("OK", { status: 200 });
  }

  // Check expiry
  if (new Date(tokenRow.expires_at) < new Date()) {
    await supabase
      .from("telegram_pairing_tokens")
      .delete()
      .eq("token", token);
    await bot.api.sendMessage(
      Number(chatId),
      "This pairing link has expired. Generate a new one from your Sunder dashboard.",
    );
    return new Response("OK", { status: 200 });
  }

  // Check if already paired
  const { data: existingMapping } = await supabase
    .from("conversation_channel_mappings")
    .select("mapping_id")
    .eq("client_id", tokenRow.client_id)
    .eq("channel", "telegram")
    .eq("external_conversation_id", chatId)
    .maybeSingle();

  if (existingMapping) {
    // Already paired — consume token and confirm
    await supabase
      .from("telegram_pairing_tokens")
      .delete()
      .eq("token", token);
    await bot.api.sendMessage(
      Number(chatId),
      "You're already connected! Send me a message to chat with your Sunder agent.",
    );
    return new Response("OK", { status: 200 });
  }

  // Create thread + channel mapping
  const { data: thread, error: threadError } = await supabase
    .from("conversation_threads")
    .insert({
      client_id: tokenRow.client_id,
      title: "Telegram",
    })
    .select("thread_id")
    .single();

  if (threadError || !thread) {
    console.error("[telegram/webhook] Failed to create thread:", threadError);
    await bot.api.sendMessage(
      Number(chatId),
      "Something went wrong. Please try again.",
    );
    return new Response("OK", { status: 200 });
  }

  const { error: mappingError } = await supabase
    .from("conversation_channel_mappings")
    .insert({
      client_id: tokenRow.client_id,
      channel: "telegram",
      external_conversation_id: chatId,
      thread_id: thread.thread_id,
    });

  if (mappingError) {
    console.error("[telegram/webhook] Failed to create mapping:", mappingError);
    await bot.api.sendMessage(
      Number(chatId),
      "Something went wrong. Please try again.",
    );
    return new Response("OK", { status: 200 });
  }

  // Consume token
  await supabase
    .from("telegram_pairing_tokens")
    .delete()
    .eq("token", token);

  await bot.api.sendMessage(
    Number(chatId),
    "Connected! You can now chat with your Sunder agent here.",
  );

  return new Response("OK", { status: 200 });
}

async function handleRegularMessage(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  bot: Bot,
  chatId: string,
  text: string,
  update: Record<string, unknown>,
): Promise<Response> {
  if (!text.trim()) {
    return new Response("OK", { status: 200 });
  }

  // 1. Lookup channel mapping → client_id + thread_id
  const { data: mapping } = await supabase
    .from("conversation_channel_mappings")
    .select("client_id, thread_id")
    .eq("channel", "telegram")
    .eq("external_conversation_id", chatId)
    .maybeSingle();

  if (!mapping) {
    await bot.api.sendMessage(
      Number(chatId),
      "Please connect your account first. Use the pairing link from your Sunder dashboard.",
    );
    return new Response("OK", { status: 200 });
  }

  // 2. Deduplicate via delivery receipts
  const updateId = String((update as Record<string, unknown>).update_id ?? "");
  if (updateId) {
    const { error: dedupeError } = await supabase
      .from("conversation_channel_delivery_receipts")
      .insert({
        client_id: mapping.client_id,
        channel: "telegram",
        delivery_id: updateId,
        thread_id: mapping.thread_id,
      });

    if (dedupeError?.code === "23505") {
      // Duplicate — already processed
      return new Response("OK", { status: 200 });
    }
  }

  // 3. Send typing indicator
  try {
    await bot.api.sendChatAction(Number(chatId), "typing");
  } catch {
    // Non-critical — ignore
  }

  // 4. Call runAgent
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
      // Message queued — Telegram user will get response when run completes
      // For now, just acknowledge
      return new Response("OK", { status: 200 });
    }

    // 5. Collect full response text from stream
    const streamResult = result.streamResult;
    const fullResponse = await streamResult.text;

    if (fullResponse.trim()) {
      await sendTelegramMessage(bot.api, chatId, fullResponse);
    }
  } catch (error) {
    console.error("[telegram/webhook] runAgent error:", error);
    await bot.api.sendMessage(
      Number(chatId),
      "Sorry, something went wrong. Please try again.",
    );
  }

  return new Response("OK", { status: 200 });
}
```

**Step 2: Type check**

```bash
npx tsc --noEmit 2>&1 | grep "webhook/telegram"
```

Expected: No type errors.

**Step 3: Commit**

```bash
git add app/api/webhook/telegram/route.ts
git commit -m "feat(pr41): add Telegram webhook route (pairing + message handling)"
```

---

## Task 9: Settings UI — Connect Telegram card

**Files:**
- Create: `app/(dashboard)/settings/telegram-connect-card.tsx`
- Modify: `app/(dashboard)/settings/page.tsx`

**Step 1: Create the Telegram connect card component**

```typescript
// app/(dashboard)/settings/telegram-connect-card.tsx
"use client";

/**
 * Settings card for connecting/disconnecting Telegram.
 * @module app/(dashboard)/settings/telegram-connect-card
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface TelegramConnectCardProps {
  isConnected: boolean;
}

export function TelegramConnectCard({
  isConnected,
}: TelegramConnectCardProps) {
  const [pairingUrl, setPairingUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerateLink() {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/telegram/generate-pairing-link", {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as Record<string, string>).error ?? "Failed to generate link",
        );
      }

      const data = (await res.json()) as { url: string };
      setPairingUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Telegram</CardTitle>
        <CardDescription>
          {isConnected
            ? "Your Telegram account is connected."
            : "Connect Telegram to chat with your agent on mobile."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isConnected ? (
          <p className="text-sm text-muted-foreground">
            Connected. Send a message to your bot in Telegram to chat.
          </p>
        ) : pairingUrl ? (
          <div className="space-y-2">
            <p className="text-sm">
              Open this link in Telegram and tap <strong>Start</strong>:
            </p>
            <a
              href={pairingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary underline break-all"
            >
              {pairingUrl}
            </a>
            <p className="text-xs text-muted-foreground">
              This link expires in 10 minutes.
            </p>
          </div>
        ) : (
          <Button onClick={handleGenerateLink} disabled={isLoading}>
            {isLoading ? "Generating..." : "Connect Telegram"}
          </Button>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
```

**Step 2: Add the card to Settings page**

In `app/(dashboard)/settings/page.tsx`, add the import and render `<TelegramConnectCard>` after the existing cards.

To determine `isConnected`, add a Supabase query in the server component:

```typescript
// Add to the server component's data fetching:
const { data: telegramMapping } = await supabase
  .from("conversation_channel_mappings")
  .select("mapping_id")
  .eq("channel", "telegram")
  .maybeSingle();

const isTelegramConnected = !!telegramMapping;
```

Then render:

```tsx
<TelegramConnectCard isConnected={isTelegramConnected} />
```

**Step 3: Verify the page renders**

```bash
npm run dev
```

Navigate to `/settings` and verify the Telegram card appears.

**Step 4: Commit**

```bash
git add app/(dashboard)/settings/telegram-connect-card.tsx app/(dashboard)/settings/page.tsx
git commit -m "feat(pr41): add Connect Telegram card to Settings page"
```

---

## Task 10: Webhook setup script

The webhook URL must be registered with Telegram once (on deploy). Create a simple setup script.

**Files:**
- Create: `scripts/setup-telegram-webhook.ts`

**Step 1: Write the setup script**

```typescript
/**
 * One-time setup script: registers the Telegram webhook URL.
 * Usage: npx tsx scripts/setup-telegram-webhook.ts
 * Requires: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, NEXT_PUBLIC_APP_URL
 * @module scripts/setup-telegram-webhook
 */
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;

if (!token || !appUrl) {
  console.error("Set TELEGRAM_BOT_TOKEN and NEXT_PUBLIC_APP_URL");
  process.exit(1);
}

const webhookUrl = `${appUrl}/api/webhook/telegram`;

async function main() {
  const params = new URLSearchParams({
    url: webhookUrl,
    ...(secret ? { secret_token: secret } : {}),
  });

  const res = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook?${params}`,
  );
  const data = await res.json();

  if (data.ok) {
    console.log(`Webhook set: ${webhookUrl}`);
  } else {
    console.error("Failed:", data);
    process.exit(1);
  }
}

main();
```

**Step 2: Test locally (requires real bot token)**

```bash
TELEGRAM_BOT_TOKEN=your_token NEXT_PUBLIC_APP_URL=https://your-app.vercel.app npx tsx scripts/setup-telegram-webhook.ts
```

**Step 3: Commit**

```bash
git add scripts/setup-telegram-webhook.ts
git commit -m "feat(pr41): add Telegram webhook setup script"
```

---

## Task 11: Add environment variables to .env.example

**Files:**
- Modify: `.env.example` (or `.env.local.example`)

**Step 1: Add the new env vars**

```bash
# Telegram Bot (PR 41)
TELEGRAM_BOT_TOKEN=          # From @BotFather
TELEGRAM_BOT_USERNAME=       # Bot username without @ (e.g., SunderBot)
TELEGRAM_WEBHOOK_SECRET=     # Random string for webhook verification
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "feat(pr41): add Telegram env vars to .env.example"
```

---

## Task 12: Final integration test (manual)

**Steps:**

1. Create a test bot via @BotFather in Telegram
2. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` in `.env.local`
3. Run `npm run dev`
4. Use ngrok to tunnel: `ngrok http 3000`
5. Run webhook setup: `NEXT_PUBLIC_APP_URL=https://xxx.ngrok.io npx tsx scripts/setup-telegram-webhook.ts`
6. Navigate to `/settings` → click "Connect Telegram"
7. Open the pairing link in Telegram → tap Start
8. Verify bot responds "Connected!"
9. Send "check my deals" → verify agent response appears
10. Send the same message again → verify delivery_receipts deduplication
11. Open web chat → verify Telegram thread is separate from web threads

**Test criteria from v2 plan:**
- [ ] Generate pairing link from Settings, tap in Telegram, bot confirms connection
- [ ] Send message to Telegram bot, get agent response
- [ ] Second message reuses same thread (channel_mapping lookup)

---

## Update barrel export

Add pairing exports to `src/lib/channels/telegram/index.ts`:

```typescript
export {
  generatePairingToken,
  isPairingTokenFormat,
  PAIRING_TOKEN_TTL_MS,
} from "./pairing";
```
