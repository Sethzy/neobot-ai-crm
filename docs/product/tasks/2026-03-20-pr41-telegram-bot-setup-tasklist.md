# Telegram Integration — Bot Setup + Pairing Implementation Plan

**PR:** PR 41: Telegram integration — bot setup
**Decisions:** GAP-09, UX-07
**Goal:** User can pair their Telegram account and chat with the Sunder agent via Telegram.

**Architecture:** Serverless webhook on Vercel receives Telegram updates via grammy. Fast-ack pattern (return 200, process in `after()`) matches existing webhook infrastructure in `app/api/trigger/webhook/[triggerId]/route.ts`. Timing-safe secret verification follows `src/lib/triggers/webhook-auth.ts`. Deep link `/start` token flow pairs Telegram user to Sunder client via `conversation_channel_mappings`. A shared channel delivery layer in `finalizeRun` (`src/lib/runner/run-persistence.ts`) delivers all agent output — direct, queued, and drained — to Telegram. This avoids Telegram-only delivery logic and ensures queued messages eventually reach the user. Global ownership guard on `conversation_channel_mappings` prevents one Telegram chat from pairing with multiple clients. Formatting copied from dorabot (`/Users/sethlim/Documents/dorabot/src/channels/telegram/`). See drift analysis: `roadmap docs/Sunder - Source of Truth/references/nanoclaw-dorabot/dorabot-telegram-complete-reference.md`.

**Tech Stack:** grammy ^1.21.0, Vitest, Supabase (Postgres + RLS), Next.js App Router API routes, Vercel Functions

**Corrections from review:** (1) Channel delivery layer in `finalizeRun` — all Telegram output routed through one shared place, not the webhook handler. (2) Global UNIQUE on `(channel, external_conversation_id)` — one Telegram chat can only belong to one client. (3) Timing-safe secret comparison, not direct string compare. (4) Fast-ack + `after()`, not synchronous handler. (5) Inbound media uses `chat-attachments` bucket, not nonexistent `client-files`. (6) Old pairing tokens invalidated on new issuance. (7) `/new` updates mapping in place (explicit user action exception). (8) One commit for entire PR. (9) `pnpm add` not `npm install` — repo uses pnpm. (10) Bot username derived from token via `getMe()`, not a separate env var — single source of truth. (11) No sentinel `"(media attached)"` text for file-only messages — follow web contract (empty input + fileParts is valid).

---

## Relevant Files

### Create
- `src/lib/channels/telegram/format.ts` — markdown→HTML conversion (from dorabot)
- `src/lib/channels/telegram/format.test.ts`
- `src/lib/channels/telegram/send.ts` — message sending + chunking (from dorabot)
- `src/lib/channels/telegram/send.test.ts`
- `src/lib/channels/telegram/bot.ts` — bot factory + token resolution
- `src/lib/channels/telegram/bot.test.ts`
- `src/lib/channels/telegram/media.ts` — inbound media download + Supabase Storage upload
- `src/lib/channels/telegram/media.test.ts`
- `src/lib/channels/telegram/pairing.ts` — pairing token generation + validation
- `src/lib/channels/telegram/pairing.test.ts`
- `src/lib/channels/telegram/index.ts` — barrel exports
- `src/lib/channels/deliver.ts` — shared external channel delivery
- `src/lib/channels/deliver.test.ts`
- `app/api/webhook/telegram/route.ts` — webhook POST handler
- `app/api/telegram/generate-pairing-link/route.ts` — pairing link API
- `app/(dashboard)/settings/telegram-connect-card.tsx` — Settings UI card
- `supabase/migrations/XXXXXXXX_create_telegram_pairing_tokens.sql`
- `supabase/migrations/XXXXXXXX_add_global_channel_ownership.sql`
- `scripts/setup-telegram-webhook.ts`

### Modify
- `src/lib/runner/run-persistence.ts` — add channel delivery hook in `finalizeRun`
- `app/(dashboard)/settings/page.tsx` — add Connect Telegram card
- `package.json` — add grammy dependency (via `pnpm add`)
- `.env.example` — add Telegram env vars (token + webhook secret only; bot username derived from token)

### Reference (read, don't modify)
- `src/lib/runner/run-agent.ts` — `runAgent()` interface, `RunAgentResult` type
- `src/lib/runner/run-persistence.ts` — `finalizeRun()` where delivery hook goes
- `src/lib/runner/schemas.ts` — `RunnerPayload` type
- `src/lib/runner/drain-and-continue.ts` — queue drain flow (delivery must happen before this)
- `src/lib/supabase/server.ts` — `createAdminClient()` for webhook context
- `src/lib/chat/client-id.ts` — `resolveClientId()` pattern
- `src/lib/api/route-helpers.ts` — `authenticateRequest()`, `jsonError()`
- `src/lib/triggers/webhook-auth.ts` — timing-safe verification pattern to follow
- `app/api/trigger/webhook/[triggerId]/route.ts` — fast-ack + `after()` pattern to follow
- `supabase/migrations/20260304213000_create_channel_mappings_and_delivery_receipts.sql` — existing schema

---

## Task 1: Install grammy + Telegram channel module

All pure functions, TDD. No DB or network calls in this task.

**Files:**
- Modify: `package.json`
- Create: `src/lib/channels/telegram/format.ts`, `src/lib/channels/telegram/format.test.ts`
- Create: `src/lib/channels/telegram/send.ts`, `src/lib/channels/telegram/send.test.ts`
- Create: `src/lib/channels/telegram/bot.ts`, `src/lib/channels/telegram/bot.test.ts`
- Create: `src/lib/channels/telegram/media.ts`, `src/lib/channels/telegram/media.test.ts`
- Create: `src/lib/channels/telegram/index.ts`

**Step 1: Install grammy**

```bash
pnpm add grammy
```

Skip `@grammyjs/runner` — webhook mode doesn't need it. Do not commit `package-lock.json` — repo uses `pnpm-lock.yaml`.

**Step 2: Write failing tests for format functions**

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
    const result = markdownToTelegramHtml("<b>already bold</b>");
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

**Step 3: Run tests — expected FAIL (module not found)**

```bash
npx vitest run src/lib/channels/telegram/format.test.ts
```

**Step 4: Implement format.ts — copy from dorabot**

Copy `/Users/sethlim/Documents/dorabot/src/channels/telegram/format.ts` verbatim. Adaptations:
- Remove `.js` from any import paths (TypeScript path resolution)
- Add file-level JSDoc: `/** Markdown → Telegram HTML conversion and sanitization. Copied from dorabot with zero drift. @module lib/channels/telegram/format */`
- Keep ALL functions: `escapeHtml`, `markdownToTelegramHtml`, `SUPPORTED_TAGS`, `sanitizeTelegramHtml`

**Step 5: Run tests — expected PASS**

```bash
npx vitest run src/lib/channels/telegram/format.test.ts
```

**Step 6: Write failing tests for send functions**

```typescript
// src/lib/channels/telegram/send.test.ts
import { describe, expect, it } from "vitest";

import {
  normalizeTelegramChatId,
  splitTelegramMessage,
  detectMediaType,
} from "./send";

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

  it("handles unclosed HTML tags at split point", () => {
    const text = "<pre>" + "x".repeat(5000) + "</pre>";
    const chunks = splitTelegramMessage(text, 4000);
    expect(chunks[0]).toContain("</pre>");
    expect(chunks[1]).toContain("<pre>");
  });
});

describe("detectMediaType", () => {
  it("detects image from MIME", () => {
    expect(detectMediaType("https://example.com/photo.jpg", "image/jpeg")).toBe("photo");
  });

  it("detects video from MIME", () => {
    expect(detectMediaType("https://example.com/clip.mp4", "video/mp4")).toBe("video");
  });

  it("detects audio from MIME", () => {
    expect(detectMediaType("https://example.com/song.mp3", "audio/mpeg")).toBe("audio");
  });

  it("falls back to document for unknown", () => {
    expect(detectMediaType("https://example.com/file.pdf", "application/pdf")).toBe("document");
  });

  it("falls back to document for SVG (not a Telegram photo)", () => {
    expect(detectMediaType("https://example.com/icon.svg", "image/svg+xml")).toBe("document");
  });
});
```

**Step 7: Run tests — expected FAIL**

```bash
npx vitest run src/lib/channels/telegram/send.test.ts
```

**Step 8: Implement send.ts — copy from dorabot + add detectMediaType**

Copy `/Users/sethlim/Documents/dorabot/src/channels/telegram/send.ts`. Adaptations:
- Remove `.js` from import paths
- Add file-level JSDoc
- Add `detectMediaType` pure function:

```typescript
/** Detects Telegram media type from MIME type. */
export function detectMediaType(
  _url: string,
  mimeType: string,
): "photo" | "video" | "audio" | "document" {
  if (mimeType.startsWith("image/") && !mimeType.includes("svg")) return "photo";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}
```

Keep ALL dorabot functions: `normalizeTelegramChatId`, `isInsideTag`, `getUnclosedTags`, `splitTelegramMessage`, `sendMedia`, `sendTelegramMessage`, `editTelegramMessage`, `deleteTelegramMessage`.

Adapt `sendMedia` to accept URLs (for Supabase Storage public URLs) in addition to file paths — grammy `InputFile` accepts both.

**Step 9: Run tests — expected PASS**

```bash
npx vitest run src/lib/channels/telegram/send.test.ts
```

**Step 10: Write failing tests for bot factory**

```typescript
// src/lib/channels/telegram/bot.test.ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";

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

**Step 11: Run tests — expected FAIL**

**Step 12: Implement bot.ts**

```typescript
/**
 * Telegram bot factory and token resolution.
 * @module lib/channels/telegram/bot
 */
import { Bot } from "grammy";

/** Resolves the Telegram bot token from environment variables. */
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

export type TelegramBotInfo = {
  id: number;
  username: string;
  firstName: string;
};

/** Validates a bot token by calling Telegram's getMe endpoint. */
export async function validateTelegramToken(token: string): Promise<TelegramBotInfo> {
  const bot = new Bot(token);
  const me = await bot.api.getMe();
  return { id: me.id, username: me.username || "", firstName: me.first_name };
}

/**
 * Module-level cache for bot username. Resolved once from token via getMe().
 * Single source of truth — no TELEGRAM_BOT_USERNAME env var needed.
 */
let _cachedUsername: string | null = null;

/** Returns the bot's username, fetching via getMe() on first call. */
export async function getBotUsername(): Promise<string> {
  if (_cachedUsername) return _cachedUsername;
  const token = getTelegramBotToken();
  const info = await validateTelegramToken(token);
  _cachedUsername = info.username;
  return _cachedUsername;
}
```

**Step 13: Run tests — expected PASS**

**Step 14: Write failing tests for media helpers**

```typescript
// src/lib/channels/telegram/media.test.ts
import { describe, expect, it } from "vitest";

import { resolveFileId, getMediaFallbacks } from "./media";

describe("resolveFileId", () => {
  it("picks largest photo from array", () => {
    const photos = [
      { file_id: "small", file_unique_id: "s", width: 100, height: 100 },
      { file_id: "large", file_unique_id: "l", width: 800, height: 800 },
    ];
    expect(resolveFileId("photo", { photo: photos })).toBe("large");
  });

  it("extracts file_id from voice", () => {
    expect(
      resolveFileId("voice", { voice: { file_id: "v123", duration: 5 } }),
    ).toBe("v123");
  });

  it("extracts file_id from document", () => {
    expect(
      resolveFileId("document", {
        document: { file_id: "d123", file_name: "test.pdf" },
      }),
    ).toBe("d123");
  });

  it("returns null when media type not present", () => {
    expect(resolveFileId("photo", {})).toBeNull();
  });
});

describe("getMediaFallbacks", () => {
  it("returns jpg for photo", () => {
    const result = getMediaFallbacks("photo");
    expect(result.ext).toBe("jpg");
    expect(result.mime).toBe("image/jpeg");
  });

  it("returns ogg for voice", () => {
    const result = getMediaFallbacks("voice");
    expect(result.ext).toBe("ogg");
    expect(result.mime).toBe("audio/ogg");
  });

  it("returns bin for unknown", () => {
    const result = getMediaFallbacks("unknown");
    expect(result.ext).toBe("bin");
    expect(result.mime).toBe("application/octet-stream");
  });
});
```

**Step 15: Run tests — expected FAIL**

**Step 16: Implement media.ts**

```typescript
/**
 * Telegram media download utilities.
 * Adapted from dorabot/src/channels/telegram/media.ts.
 * Downloads via Telegram File API, uploads to Supabase Storage (chat-attachments bucket).
 * @module lib/channels/telegram/media
 */
import type { Api } from "grammy";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

const MEDIA_FALLBACKS: Record<string, { ext: string; mime: string }> = {
  photo: { ext: "jpg", mime: "image/jpeg" },
  video: { ext: "mp4", mime: "video/mp4" },
  audio: { ext: "mp3", mime: "audio/mpeg" },
  voice: { ext: "ogg", mime: "audio/ogg" },
  video_note: { ext: "mp4", mime: "video/mp4" },
  animation: { ext: "mp4", mime: "video/mp4" },
  document: { ext: "bin", mime: "application/octet-stream" },
};

/** Returns fallback extension and MIME type for a Telegram media type. */
export function getMediaFallbacks(
  mediaType: string,
): { ext: string; mime: string } {
  return MEDIA_FALLBACKS[mediaType] ?? { ext: "bin", mime: "application/octet-stream" };
}

/**
 * Resolves the file_id from a Telegram message based on media type.
 * Photos are arrays of sizes — picks the largest.
 */
export function resolveFileId(
  mediaType: string,
  message: Record<string, unknown>,
): string | null {
  if (mediaType === "photo") {
    const photos = message.photo as
      | Array<{ file_id: string; width: number; height: number }>
      | undefined;
    if (!photos?.length) return null;
    return photos[photos.length - 1].file_id;
  }

  const media = message[mediaType] as { file_id?: string } | undefined;
  return media?.file_id ?? null;
}

/**
 * Downloads a Telegram file and uploads it to Supabase Storage (chat-attachments bucket).
 * Returns the public URL and MIME type, or null on failure.
 */
export async function downloadAndStoreTelegramFile(
  api: Api,
  supabase: SupabaseClient<Database>,
  clientId: string,
  fileId: string,
  fallbackExt: string,
  fallbackMime: string,
): Promise<{ url: string; mimeType: string } | null> {
  try {
    const file = await api.getFile(fileId);
    const filePath = file.file_path;
    if (!filePath) return null;

    const ext = filePath.includes(".")
      ? filePath.split(".").pop()!
      : fallbackExt;
    const mimeType = fallbackMime;

    const downloadUrl = `https://api.telegram.org/file/bot${api.token}/${filePath}`;
    const res = await fetch(downloadUrl);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());

    // Upload to chat-attachments bucket (matches web multimodal chat pattern)
    const storagePath = `${clientId}/telegram/${Date.now()}_${file.file_unique_id}.${ext}`;
    const { error } = await supabase.storage
      .from("chat-attachments")
      .upload(storagePath, buffer, { contentType: mimeType });

    if (error) {
      console.error("[telegram/media] Storage upload failed:", error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from("chat-attachments")
      .getPublicUrl(storagePath);

    return { url: urlData.publicUrl, mimeType };
  } catch (err) {
    console.error("[telegram/media] Download failed:", err);
    return null;
  }
}
```

**Step 17: Run tests — expected PASS**

```bash
npx vitest run src/lib/channels/telegram/media.test.ts
```

**Step 18: Create barrel exports**

```typescript
// src/lib/channels/telegram/index.ts
/**
 * Telegram channel integration.
 * @module lib/channels/telegram
 */
export {
  getTelegramBotToken,
  createTelegramBot,
  validateTelegramToken,
  getBotUsername,
  type TelegramBotInfo,
} from "./bot";
export { markdownToTelegramHtml, sanitizeTelegramHtml } from "./format";
export {
  sendTelegramMessage,
  editTelegramMessage,
  deleteTelegramMessage,
  splitTelegramMessage,
  normalizeTelegramChatId,
  detectMediaType,
} from "./send";
export {
  generatePairingToken,
  isPairingTokenFormat,
  PAIRING_TOKEN_TTL_MS,
} from "./pairing";
export {
  resolveFileId,
  getMediaFallbacks,
  downloadAndStoreTelegramFile,
} from "./media";
```

**Step 19: Run all channel module tests**

```bash
npx vitest run src/lib/channels/telegram/
```

Expected: All PASS.

---

## Task 2: Pairing infrastructure (migrations + logic + API route)

**Files:**
- Create: `supabase/migrations/XXXXXXXX_create_telegram_pairing_tokens.sql`
- Create: `supabase/migrations/XXXXXXXX_add_global_channel_ownership.sql`
- Create: `src/lib/channels/telegram/pairing.ts`
- Create: `src/lib/channels/telegram/pairing.test.ts`
- Create: `app/api/telegram/generate-pairing-link/route.ts`

**Step 1: Write the pairing tokens migration**

Use a timestamp like `20260320100000`.

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
```

**Step 2: Write the global channel ownership migration**

Use a timestamp like `20260320100001`.

```sql
-- PR41: Global ownership guard — one external conversation can only belong to one client.
-- Prevents the same Telegram chat from pairing with multiple Sunder accounts.
-- Existing UNIQUE(client_id, channel, external_conversation_id) stays.
-- This adds a STRONGER constraint: UNIQUE(channel, external_conversation_id) globally.

ALTER TABLE public.conversation_channel_mappings
  ADD CONSTRAINT conversation_channel_mappings_channel_external_global_key
  UNIQUE (channel, external_conversation_id);
```

**Step 3: Apply migrations locally**

```bash
npx supabase db reset
```

Expected: Migrations apply without errors.

**Step 4: Regenerate database types**

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

**Step 5: Write failing tests for pairing token utilities**

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

**Step 6: Run tests — expected FAIL**

**Step 7: Implement pairing.ts**

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

**Step 8: Run tests — expected PASS**

**Step 9: Implement the generate-pairing-link API route**

Key correction: **invalidate older tokens** for the client before issuing a new one.

```typescript
/**
 * POST /api/telegram/generate-pairing-link
 * Authenticated endpoint that generates a Telegram deep-link pairing URL.
 * Invalidates any existing tokens for this client before creating a new one.
 * Returns: { url: "https://t.me/SunderBot?start=<token>", expiresInSeconds: 600 }
 * @module app/api/telegram/generate-pairing-link/route
 */
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { getBotUsername } from "@/lib/channels/telegram/bot";
import {
  generatePairingToken,
  PAIRING_TOKEN_TTL_MS,
} from "@/lib/channels/telegram/pairing";

export async function POST(): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  const clientId = await resolveClientId(supabase, userId);

  // Derive bot username from token (single source of truth — no separate env var)
  let botUsername: string;
  try {
    botUsername = await getBotUsername();
  } catch {
    return jsonError("Telegram bot not configured.", 500);
  }

  // Invalidate any existing tokens for this client (prevents stale pairing)
  await supabase
    .from("telegram_pairing_tokens")
    .delete()
    .eq("client_id", clientId);

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

**Step 10: Type check**

```bash
npx tsc --noEmit 2>&1 | grep "generate-pairing-link"
```

Expected: No type errors.

---

## Task 3: Webhook route

The core handler. Key corrections from review: timing-safe secret comparison, fast-ack + `after()`, no direct Telegram delivery (delivery happens via `finalizeRun`).

**Files:**
- Create: `app/api/webhook/telegram/route.ts`

**Step 1: Implement the webhook route**

```typescript
/**
 * POST /api/webhook/telegram
 * Receives Telegram updates via webhook. Handles:
 * - /start <token> pairing flow
 * - Regular messages → runAgent() (delivery via finalizeRun channel layer)
 * - /new — reset conversation thread
 * Uses fast-ack pattern: returns 200 immediately, processes in after().
 * Uses timing-safe secret comparison (matches src/lib/triggers/webhook-auth.ts pattern).
 * @module app/api/webhook/telegram/route
 */
import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { Bot } from "grammy";

import { createAdminClient } from "@/lib/supabase/server";
import { getTelegramBotToken } from "@/lib/channels/telegram/bot";
import { isPairingTokenFormat } from "@/lib/channels/telegram/pairing";
import {
  resolveFileId,
  getMediaFallbacks,
  downloadAndStoreTelegramFile,
} from "@/lib/channels/telegram/media";
import { runAgent } from "@/lib/runner/run-agent";
import type { RunnerFilePart } from "@/lib/runner/schemas";

/** Allow longer runs for agent processing. */
export const maxDuration = 120;

const MEDIA_TYPES = [
  "photo", "video", "audio", "document", "voice", "animation", "video_note",
] as const;

/**
 * Timing-safe string comparison for webhook secret.
 * Matches the pattern in src/lib/triggers/webhook-auth.ts.
 */
function timingSafeVerify(expected: string, received: string): boolean {
  const expectedBuf = Buffer.from(expected, "utf-8");
  const receivedBuf = Buffer.from(received, "utf-8");
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

/** Lazily-initialized bot singleton (Vercel may reuse module scope). */
let _bot: Bot | null = null;
function getBot(): Bot {
  if (!_bot) {
    _bot = new Bot(getTelegramBotToken());
  }
  return _bot;
}

export async function POST(request: Request): Promise<Response> {
  // 1. Timing-safe webhook secret verification
  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
  if (secret) {
    const headerSecret =
      request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
    if (!timingSafeVerify(secret, headerSecret)) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  // 2. Parse update (needed before fast-ack for basic validation)
  let update: Record<string, unknown>;
  try {
    update = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // 3. Fast-ack — return 200 immediately, process in background.
  // Matches app/api/trigger/webhook/[triggerId]/route.ts pattern.
  after(async () => {
    try {
      await processUpdate(update);
    } catch (err) {
      console.error("[telegram/webhook] processUpdate error:", err);
    }
  });

  return new Response("OK", { status: 200 });
}

async function processUpdate(update: Record<string, unknown>): Promise<void> {
  const supabase = await createAdminClient();
  const bot = getBot();

  const message = update.message as Record<string, unknown> | undefined;
  const callbackQuery = update.callback_query as
    | Record<string, unknown>
    | undefined;

  if (message) {
    const text = (message.text as string) ?? "";
    const chat = message.chat as Record<string, unknown>;
    const chatId = String(chat.id);

    if (text.startsWith("/start ")) {
      await handleStartCommand(supabase, bot, chatId, text.slice(7).trim());
    } else if (text === "/start") {
      await bot.api.sendMessage(
        Number(chatId),
        "Welcome to Sunder! Use the pairing link from your dashboard to connect.",
      );
    } else if (text === "/new") {
      await handleNewCommand(supabase, bot, chatId);
    } else {
      await handleRegularMessage(supabase, bot, chatId, text, message, update);
    }
  } else if (callbackQuery) {
    // PR42 adds callback_query handling for approvals and questions.
    // For now, just acknowledge.
    const callbackId = callbackQuery.id as string;
    await bot.api.answerCallbackQuery(callbackId);
  }
}

async function handleStartCommand(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  bot: Bot,
  chatId: string,
  token: string,
): Promise<void> {
  if (!isPairingTokenFormat(token)) {
    await bot.api.sendMessage(
      Number(chatId),
      "Invalid pairing link. Generate a new one from your Sunder dashboard.",
    );
    return;
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
    return;
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
    return;
  }

  // Check if this chat is already paired (any client — global ownership guard)
  const { data: existingMapping } = await supabase
    .from("conversation_channel_mappings")
    .select("mapping_id, client_id")
    .eq("channel", "telegram")
    .eq("external_conversation_id", chatId)
    .maybeSingle();

  if (existingMapping) {
    // Consume token regardless
    await supabase
      .from("telegram_pairing_tokens")
      .delete()
      .eq("token", token);

    if (existingMapping.client_id === tokenRow.client_id) {
      await bot.api.sendMessage(
        Number(chatId),
        "You're already connected! Send me a message to chat with your Sunder agent.",
      );
    } else {
      // Different client — global uniqueness prevents this pairing
      await bot.api.sendMessage(
        Number(chatId),
        "This Telegram chat is already connected to another Sunder account.",
      );
    }
    return;
  }

  // Create thread + channel mapping
  const { data: thread, error: threadError } = await supabase
    .from("conversation_threads")
    .insert({ client_id: tokenRow.client_id, title: "Telegram" })
    .select("thread_id")
    .single();

  if (threadError || !thread) {
    console.error("[telegram/webhook] Failed to create thread:", threadError);
    await bot.api.sendMessage(
      Number(chatId),
      "Something went wrong. Please try again.",
    );
    return;
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
    return;
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
}

async function handleNewCommand(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  bot: Bot,
  chatId: string,
): Promise<void> {
  const { data: mapping } = await supabase
    .from("conversation_channel_mappings")
    .select("mapping_id, client_id")
    .eq("channel", "telegram")
    .eq("external_conversation_id", chatId)
    .maybeSingle();

  if (!mapping) {
    await bot.api.sendMessage(
      Number(chatId),
      "Please connect your account first. Use the pairing link from your Sunder dashboard.",
    );
    return;
  }

  const { data: thread, error } = await supabase
    .from("conversation_threads")
    .insert({ client_id: mapping.client_id, title: "Telegram" })
    .select("thread_id")
    .single();

  if (error || !thread) {
    await bot.api.sendMessage(
      Number(chatId),
      "Something went wrong. Please try again.",
    );
    return;
  }

  // Update mapping to point to new thread (explicit user action — allowed exception)
  await supabase
    .from("conversation_channel_mappings")
    .update({ thread_id: thread.thread_id })
    .eq("mapping_id", mapping.mapping_id);

  await bot.api.sendMessage(Number(chatId), "New conversation started.");
}

async function handleRegularMessage(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  bot: Bot,
  chatId: string,
  text: string,
  message: Record<string, unknown>,
  update: Record<string, unknown>,
): Promise<void> {
  // 1. Lookup channel mapping
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
    return;
  }

  // 2. Deduplicate via delivery receipts
  const updateId = String(update.update_id ?? "");
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
      return; // Already processed
    }
  }

  // 3. Send typing indicator (best-effort)
  try {
    await bot.api.sendChatAction(Number(chatId), "typing");
  } catch {
    // Non-critical
  }

  // 4. Handle inbound media (photos, documents, voice, etc.)
  const fileParts: RunnerFilePart[] = [];
  for (const mediaType of MEDIA_TYPES) {
    if (!(mediaType in message)) continue;

    const fileId = resolveFileId(mediaType, message);
    if (!fileId) continue;

    const { ext, mime } = getMediaFallbacks(mediaType);
    const stored = await downloadAndStoreTelegramFile(
      bot.api,
      supabase,
      mapping.client_id,
      fileId,
      ext,
      mime,
    );

    if (stored) {
      fileParts.push({
        type: "file",
        url: stored.url,
        mediaType: stored.mimeType,
      });
    }
    break; // One media per Telegram message
  }

  // Use caption as text if no text body (photos/videos often have captions)
  const caption = (message.caption as string) ?? "";
  const inputText = text.trim() || caption.trim();

  if (!inputText && fileParts.length === 0) {
    return; // Nothing to process
  }

  // 5. Call runAgent — delivery happens via finalizeRun → deliverToExternalChannels.
  // The webhook handler does NOT send directly to Telegram.
  try {
    const result = await runAgent(
      {
        clientId: mapping.client_id,
        threadId: mapping.thread_id,
        triggerType: "chat",
        consumeMessageQuota: true,
        input: inputText,
        ...(fileParts.length > 0 ? { fileParts } : {}),
      },
      supabase,
    );

    if (result.status === "streaming") {
      // Consume stream to ensure onFinish fires → finalizeRun → Telegram delivery.
      // We do NOT send the result directly. The channel delivery layer handles it.
      await result.streamResult.text;
    }
    // If queued: delivery happens when the current run completes via drainAndContinue.
  } catch (error) {
    console.error("[telegram/webhook] runAgent error:", error);
    await bot.api.sendMessage(
      Number(chatId),
      "Sorry, something went wrong. Please try again.",
    );
  }
}
```

**Step 2: Type check**

```bash
npx tsc --noEmit 2>&1 | grep "webhook/telegram"
```

Expected: No type errors.

---

## Task 4: Channel delivery layer

The key architectural fix. After every run completes, `finalizeRun` checks if the thread has external channel mappings and delivers the assistant response. This handles direct messages, queued messages, and drained messages uniformly.

**Files:**
- Create: `src/lib/channels/deliver.ts`
- Create: `src/lib/channels/deliver.test.ts`
- Modify: `src/lib/runner/run-persistence.ts`

**Step 1: Write failing tests for channel delivery**

```typescript
// src/lib/channels/deliver.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

import { deliverToExternalChannels } from "./deliver";

// Mock the Telegram module (no grammy dependency in tests)
vi.mock("@/lib/channels/telegram", () => ({
  getTelegramBotToken: vi.fn(() => "test-token"),
  createTelegramBot: vi.fn(() => ({ api: {} })),
  sendTelegramMessage: vi.fn().mockResolvedValue({ id: "1", chatId: "123" }),
}));

function createMockSupabase(mappings: Array<{ channel: string; external_conversation_id: string }>) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: mappings }),
        }),
      }),
    }),
  };
}

describe("deliverToExternalChannels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends text to Telegram when thread has a telegram mapping", async () => {
    const supabase = createMockSupabase([
      { channel: "telegram", external_conversation_id: "12345" },
    ]);
    const { sendTelegramMessage } = await import("@/lib/channels/telegram");

    await deliverToExternalChannels(
      supabase as any,
      "thread-1",
      "client-1",
      "Hello from agent",
    );

    expect(sendTelegramMessage).toHaveBeenCalledWith(
      expect.anything(),
      "12345",
      "Hello from agent",
    );
  });

  it("skips delivery for empty text", async () => {
    const supabase = createMockSupabase([
      { channel: "telegram", external_conversation_id: "12345" },
    ]);
    const { sendTelegramMessage } = await import("@/lib/channels/telegram");

    await deliverToExternalChannels(supabase as any, "thread-1", "client-1", "");

    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("skips delivery when no mappings exist", async () => {
    const supabase = createMockSupabase([]);
    const { sendTelegramMessage } = await import("@/lib/channels/telegram");

    await deliverToExternalChannels(
      supabase as any,
      "thread-1",
      "client-1",
      "Hello",
    );

    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("does not throw when Telegram delivery fails", async () => {
    const supabase = createMockSupabase([
      { channel: "telegram", external_conversation_id: "12345" },
    ]);
    const telegram = await import("@/lib/channels/telegram");
    vi.mocked(telegram.sendTelegramMessage).mockRejectedValueOnce(
      new Error("network error"),
    );

    // Should not throw — errors are caught internally
    await expect(
      deliverToExternalChannels(
        supabase as any,
        "thread-1",
        "client-1",
        "Hello",
      ),
    ).resolves.toBeUndefined();
  });
});
```

**Step 2: Run tests — expected FAIL**

**Step 3: Implement deliver.ts**

```typescript
/**
 * Shared external channel delivery.
 * Called from finalizeRun after persisting the assistant message.
 * Looks up channel mappings for the thread and delivers to each external channel.
 * @module lib/channels/deliver
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Delivers assistant text to all external channels mapped to this thread.
 * Skips web (handled by SSE streaming in chat/route.ts).
 * Non-fatal — catches errors per-channel so one failure doesn't block others.
 */
export async function deliverToExternalChannels(
  supabase: SupabaseClient<Database>,
  threadId: string,
  clientId: string,
  text: string,
): Promise<void> {
  if (!text.trim()) return;

  const { data: mappings } = await supabase
    .from("conversation_channel_mappings")
    .select("channel, external_conversation_id")
    .eq("thread_id", threadId)
    .eq("client_id", clientId);

  if (!mappings?.length) return;

  for (const mapping of mappings) {
    if (mapping.channel === "telegram") {
      try {
        await deliverToTelegram(mapping.external_conversation_id, text);
      } catch (err) {
        console.error("[channel-delivery] Telegram delivery failed:", err);
      }
    }
    // Future channels (WhatsApp, etc.) add cases here.
  }
}

/**
 * Sends text to a Telegram chat. Uses dynamic import to avoid loading grammy
 * in environments where Telegram is not configured.
 */
async function deliverToTelegram(chatId: string, text: string): Promise<void> {
  const {
    getTelegramBotToken,
    createTelegramBot,
    sendTelegramMessage,
  } = await import("@/lib/channels/telegram");

  let token: string;
  try {
    token = getTelegramBotToken();
  } catch {
    // Telegram not configured — skip delivery silently
    return;
  }

  const bot = createTelegramBot(token);
  await sendTelegramMessage(bot.api, chatId, text);
}
```

**Step 4: Run tests — expected PASS**

```bash
npx vitest run src/lib/channels/deliver.test.ts
```

**Step 5: Wire into finalizeRun**

In `src/lib/runner/run-persistence.ts`, add the import and delivery call.

Add import at top:

```typescript
import { deliverToExternalChannels } from "@/lib/channels/deliver";
```

Add delivery call after `completeRun` and before `drainAndContinue` (between lines 206 and 208 of the current file):

```typescript
  await completeRun(supabase, { ...baseRunCompletion, status: "completed" });

  // Deliver to external channels (Telegram, etc.) before draining queue.
  // Non-fatal: errors are caught per-channel inside deliverToExternalChannels.
  if (contentText.length > 0) {
    await deliverToExternalChannels(supabase, threadId, clientId, contentText)
      .catch((err) =>
        console.error(`[${logLabel}] external channel delivery failed:`, err),
      );
  }

  // Drain any queued messages that arrived while this run was active.
  await drainAndContinue(supabase, { clientId, threadId });
```

**Step 6: Write webhook route test**

```typescript
// app/api/webhook/telegram/__tests__/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock dependencies before importing the route
vi.mock("next/server", () => ({
  after: vi.fn((fn: () => Promise<void>) => fn()),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  }),
}));

vi.mock("@/lib/channels/telegram/bot", () => ({
  getTelegramBotToken: vi.fn(() => "test:TOKEN"),
}));

vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: vi.fn().mockResolvedValue({ status: "queued" }),
}));

vi.mock("grammy", () => ({
  Bot: vi.fn().mockImplementation(() => ({
    token: "test:TOKEN",
    api: {
      sendMessage: vi.fn().mockResolvedValue({}),
      sendChatAction: vi.fn().mockResolvedValue({}),
      answerCallbackQuery: vi.fn().mockResolvedValue({}),
    },
  })),
}));

describe("POST /api/webhook/telegram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
  });

  it("rejects request with invalid secret", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "correct-secret";
    const { POST } = await import("../route");

    const request = new Request("http://localhost/api/webhook/telegram", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong-secret" },
      body: JSON.stringify({ update_id: 1 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 200 for valid update with correct secret", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "correct-secret";
    const { POST } = await import("../route");

    const request = new Request("http://localhost/api/webhook/telegram", {
      method: "POST",
      headers: {
        "X-Telegram-Bot-Api-Secret-Token": "correct-secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        update_id: 1,
        message: { chat: { id: 123 }, text: "hello" },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it("returns 400 for malformed JSON body", async () => {
    const { POST } = await import("../route");

    const request = new Request("http://localhost/api/webhook/telegram", {
      method: "POST",
      body: "not json",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("accepts request when no secret is configured", async () => {
    const { POST } = await import("../route");

    const request = new Request("http://localhost/api/webhook/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ update_id: 1 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});
```

**Step 7: Write finalizeRun delivery ordering test**

```typescript
// src/lib/channels/__tests__/finalize-delivery-ordering.test.ts
import { describe, expect, it, vi } from "vitest";

// Verify that deliverToExternalChannels is called after completeRun
// and before drainAndContinue in finalizeRun.
// This is a structural test — it verifies the call ordering contract.

vi.mock("@/lib/channels/deliver", () => ({
  deliverToExternalChannels: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/runner/run-lifecycle", () => ({
  completeRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/runner/drain-and-continue", () => ({
  drainAndContinue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/runner/message-utils", () => ({
  buildAssistantPartsFromSteps: vi.fn(() => [{ type: "text", text: "hello" }]),
  getAssistantTextFromParts: vi.fn(() => "hello"),
}));

vi.mock("@/lib/runner/toolcall-artifacts", () => ({
  saveToolcallBlock: vi.fn().mockResolvedValue(undefined),
  truncateOversizedParts: vi.fn(async (_s, _c, parts) => ({ parts })),
}));

vi.mock("@/lib/chat/messages", () => ({
  createMessages: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/runner/compaction", () => ({
  maybeCompactThread: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/approvals/queries", () => ({
  createApprovalEvent: vi.fn(),
}));

describe("finalizeRun delivery ordering", () => {
  it("calls deliverToExternalChannels after completeRun and before drainAndContinue", async () => {
    const callOrder: string[] = [];

    const { completeRun } = await import("@/lib/runner/run-lifecycle");
    const { deliverToExternalChannels } = await import("@/lib/channels/deliver");
    const { drainAndContinue } = await import("@/lib/runner/drain-and-continue");

    vi.mocked(completeRun).mockImplementation(async () => {
      callOrder.push("completeRun");
    });
    vi.mocked(deliverToExternalChannels).mockImplementation(async () => {
      callOrder.push("deliverToExternalChannels");
    });
    vi.mocked(drainAndContinue).mockImplementation(async () => {
      callOrder.push("drainAndContinue");
    });

    const { finalizeRun } = await import("@/lib/runner/run-persistence");

    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      storage: { from: vi.fn().mockReturnThis() },
    };

    await finalizeRun({
      supabase: mockSupabase as any,
      clientId: "c1",
      threadId: "t1",
      runId: "r1",
      modelId: "model",
      steps: [],
      text: "hello",
      totalUsage: { inputTokens: 10, outputTokens: 20 },
      logLabel: "test",
    });

    const completeIdx = callOrder.indexOf("completeRun");
    const deliverIdx = callOrder.indexOf("deliverToExternalChannels");
    const drainIdx = callOrder.indexOf("drainAndContinue");

    expect(completeIdx).toBeGreaterThanOrEqual(0);
    expect(deliverIdx).toBeGreaterThan(completeIdx);
    expect(drainIdx).toBeGreaterThan(deliverIdx);
  });
});
```

**Step 8: Type check**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 9: Run all tests to verify no regressions**

```bash
npx vitest run src/lib/runner/__tests__/
npx vitest run src/lib/channels/
npx vitest run app/api/webhook/telegram/__tests__/
```

Expected: All PASS.

---

## Task 5: Settings UI + env config

**Files:**
- Create: `app/(dashboard)/settings/telegram-connect-card.tsx`
- Modify: `app/(dashboard)/settings/page.tsx`
- Modify: `.env.example`
- Create: `scripts/setup-telegram-webhook.ts`

**Step 1: Create TelegramConnectCard component**

```typescript
// app/(dashboard)/settings/telegram-connect-card.tsx
"use client";

/**
 * Settings card for connecting Telegram.
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

**Step 2: Add to Settings page**

In `app/(dashboard)/settings/page.tsx`:

Add import:
```typescript
import { TelegramConnectCard } from "./telegram-connect-card";
```

Add data fetching inside the server component (after existing queries):
```typescript
const { data: telegramMapping } = await supabase
  .from("conversation_channel_mappings")
  .select("mapping_id")
  .eq("channel", "telegram")
  .maybeSingle();

const isTelegramConnected = !!telegramMapping;
```

Render the card after the existing settings cards:
```tsx
<TelegramConnectCard isConnected={isTelegramConnected} />
```

**Step 3: Add env vars to .env.example**

```bash
# Telegram Bot (PR 41)
TELEGRAM_BOT_TOKEN=          # From @BotFather
TELEGRAM_WEBHOOK_SECRET=     # Random string for webhook verification
# Bot username is derived from the token via getMe() — no separate env var needed.
```

**Step 4: Create webhook setup script**

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
  const { Bot } = await import("grammy");
  const bot = new Bot(token!);
  const me = await bot.api.getMe();
  console.log(`Bot: @${me.username} (${me.id})`);

  const params: Record<string, string> = { url: webhookUrl };
  if (secret) params.secret_token = secret;

  const res = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook?${new URLSearchParams(params)}`,
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

**Step 5: Verify page renders**

```bash
npm run dev
```

Navigate to `/settings` and verify the Telegram card appears.

---

## Task 6: Commit + integration test criteria

**Step 1: Run all tests**

```bash
npx vitest run src/lib/channels/
npx vitest run src/lib/runner/__tests__/
npx tsc --noEmit
```

Expected: All PASS, no type errors.

**Step 2: Commit all PR41 work**

```bash
git add \
  package.json pnpm-lock.yaml \
  src/lib/channels/ \
  src/lib/runner/run-persistence.ts \
  app/api/webhook/telegram/ \
  app/api/telegram/ \
  app/\(dashboard\)/settings/telegram-connect-card.tsx \
  app/\(dashboard\)/settings/page.tsx \
  supabase/migrations/*telegram* \
  supabase/migrations/*channel_ownership* \
  src/types/database.ts \
  scripts/setup-telegram-webhook.ts \
  .env.example

git commit -m "feat(pr41): Telegram bot setup — pairing, webhook, channel delivery layer"
```

**Step 3: Integration test criteria (manual)**

1. Create a test bot via @BotFather in Telegram
2. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` in `.env.local` (bot username derived from token automatically)
3. Run `npm run dev` + ngrok tunnel: `ngrok http 3000`
4. Register webhook: `NEXT_PUBLIC_APP_URL=https://xxx.ngrok.io npx tsx scripts/setup-telegram-webhook.ts`
5. Navigate to `/settings` → click "Connect Telegram"
6. Open the pairing link in Telegram → tap Start

Test criteria from v2 plan:
- [ ] Generate pairing link from Settings, tap in Telegram, bot confirms "Connected!"
- [ ] Send message to Telegram bot, get agent response (delivered via finalizeRun, not webhook handler)
- [ ] Second message reuses same thread (channel_mapping lookup)
- [ ] Send `/new`, next message goes to fresh thread
- [ ] Send photo with caption, agent receives and references the image
- [ ] Send message while agent is busy → message queued → response delivered when run completes
- [ ] Attempting to pair same Telegram chat to a different client → rejected ("already connected to another account")
