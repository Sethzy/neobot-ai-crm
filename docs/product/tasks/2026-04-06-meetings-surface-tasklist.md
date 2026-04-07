# Meetings Surface Implementation Plan

**PR:** PR 70: Meetings Surface — dedicated recording & summary experience
**Decisions:** None (out-of-plan scope, extends PR 68)
**Goal:** Separate meeting recording from chat into its own first-class surface with auto-summary.

**Architecture:** Meetings live at `/meetings` (list) and `/meetings/[id]` (detail). Recording, transcription (Groq Whisper verbose_json), and auto-summary (`generateObject` via AI Gateway) happen synchronously inside the existing ingest route. Agent handoff is opt-in via "Send to agent" which creates a chat thread with a pre-loaded user message. The `search_meetings` tool lets the agent query past meetings.

**Tech Stack:** Next.js 15 App Router, Vercel AI SDK v6 (`generateObject`), `@ai-sdk/gateway`, Supabase (Postgres + Storage + RLS), TanStack Query, Zod v4, Vitest

---

## Pre-read before starting

Read these files before writing any code:

- **Design doc:** `docs/product/ideations/2026-04-06-meetings-surface-requirements.md` — full requirements, UX wireframes, prompts
- **Reference doc:** `roadmap docs/Sunder - Source of Truth/references/meetily/meetily-reference.md` — Meetily patterns to copy, drift decisions
- **Plan:** `docs/product/plans/2026-04-06-004-feat-meetings-surface-plan.md` — phased implementation, ERD, file map
- **Existing ingest route:** `app/api/meetings/ingest/route.ts` — current pipeline you'll modify
- **Existing ingest tests:** `app/api/meetings/ingest/route.test.ts` — test structure you'll extend
- **Gateway pattern:** `src/lib/ai/gateway.ts` — how to call `gateway("google/gemini-2.5-flash-lite")`
- **Tool factory:** `src/lib/runner/tools/crm/search.ts` — pattern for `search_meetings`
- **Query hook pattern:** `src/hooks/use-record-notes.ts` — pattern for `use-meetings.ts`
- **Sidebar:** `src/components/layout/app-sidebar.tsx:64-67` — where to add Meetings nav

---

### Task 1: Summary Prompt Builder

Pure function, zero dependencies. Easiest TDD entry point.

**Files:**
- Create: `src/lib/meetings/summary-prompt.ts`
- Test: `src/lib/meetings/__tests__/summary-prompt.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/meetings/__tests__/summary-prompt.test.ts
import { describe, expect, it } from "vitest";
import { buildSummaryPrompt } from "../summary-prompt";

describe("buildSummaryPrompt", () => {
  it("includes the transcript in the prompt", () => {
    const result = buildSummaryPrompt("Hello world transcript", "");
    expect(result).toContain("Hello world transcript");
  });

  it("includes user notes when provided", () => {
    const result = buildSummaryPrompt("transcript text", "call back Thursday");
    expect(result).toContain("call back Thursday");
  });

  it("handles empty notes gracefully", () => {
    const result = buildSummaryPrompt("transcript text", "");
    expect(result).toContain("## User Notes");
    expect(result).toContain("(No notes taken)");
  });

  it("includes the system instruction header", () => {
    const result = buildSummaryPrompt("transcript", "notes");
    expect(result).toContain("busy sales professional");
    expect(result).toContain("bullet-point summary");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/meetings/__tests__/summary-prompt.test.ts
```
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/lib/meetings/summary-prompt.ts
/**
 * Builds the prompt for auto-summarizing a meeting transcript.
 * Used by the ingest route with generateObject() to produce a title + summary.
 * @module lib/meetings/summary-prompt
 */

/**
 * Assembles the summary prompt from transcript text and optional user notes.
 * The prompt instructs the LLM to generate a short title and bullet-point summary.
 * User notes are treated as authoritative — they override transcript where they conflict.
 */
export function buildSummaryPrompt(transcript: string, notes: string): string {
  const notesSection = notes.trim().length > 0
    ? notes.trim()
    : "(No notes taken)";

  return `You are summarizing a meeting recording for a busy sales professional. They need to quickly see what happened and what needs to follow up.

## Instructions

- Generate a short, descriptive title for this meeting (e.g., "Portfolio Review with John Smith", "New Lead Intro Call", "Team Standup")
- Generate a bullet-point summary of the key points discussed, decisions made, and action items identified
- If User Notes are provided, treat them as authoritative — they override the transcript where they conflict
- Mark bullet points that came from or were influenced by user notes with "\u2190 note" at the end
- Keep the summary concise — aim for 5-10 bullet points for a 30-60 min meeting, fewer for shorter meetings
- Use plain language, not jargon
- Lead with the most important items (decisions, action items) before background discussion

## Transcript

${transcript}

## User Notes

${notesSection}`;
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/meetings/__tests__/summary-prompt.test.ts
```
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/lib/meetings/summary-prompt.ts src/lib/meetings/__tests__/summary-prompt.test.ts
git commit -m "feat(pr70): add summary prompt builder for meeting auto-summary"
```

---

### Task 2: Format Helpers

Pure functions copied from Meetily. See reference doc sections 8-9.

**Files:**
- Create: `src/lib/meetings/format-helpers.ts`
- Test: `src/lib/meetings/__tests__/format-helpers.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/lib/meetings/__tests__/format-helpers.test.ts
import { describe, expect, it } from "vitest";
import { formatDuration, formatRecordingTime, cleanStopWords } from "../format-helpers";

describe("formatDuration", () => {
  it("formats 0 seconds as 00:00", () => {
    expect(formatDuration(0)).toBe("00:00");
  });

  it("formats 65 seconds as 01:05", () => {
    expect(formatDuration(65)).toBe("01:05");
  });

  it("formats 3600 seconds as 60:00", () => {
    expect(formatDuration(3600)).toBe("60:00");
  });
});

describe("formatRecordingTime", () => {
  it("formats undefined as [--:--]", () => {
    expect(formatRecordingTime(undefined)).toBe("[--:--]");
  });

  it("formats 0 as [00:00]", () => {
    expect(formatRecordingTime(0)).toBe("[00:00]");
  });

  it("formats 125.3 as [02:05]", () => {
    expect(formatRecordingTime(125.3)).toBe("[02:05]");
  });
});

describe("cleanStopWords", () => {
  it("removes filler words", () => {
    expect(cleanStopWords("uh so we talked um about the deal")).toBe("so we talked about the deal");
  });

  it("handles empty strings", () => {
    expect(cleanStopWords("")).toBe("");
  });

  it("preserves normal text", () => {
    expect(cleanStopWords("Met with John about pricing")).toBe("Met with John about pricing");
  });

  it("removes multiple consecutive fillers", () => {
    expect(cleanStopWords("uh um er the meeting")).toBe("the meeting");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/meetings/__tests__/format-helpers.test.ts
```
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/lib/meetings/format-helpers.ts
/**
 * Display format helpers for meeting timestamps and transcript cleanup.
 * Copied from Meetily reference (see meetily-reference.md sections 8-9).
 * @module lib/meetings/format-helpers
 */

/** Formats seconds as MM:SS for the recording timer display. */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/** Formats seconds as [MM:SS] for transcript segment timestamps. */
export function formatRecordingTime(seconds: number | undefined): string {
  if (seconds === undefined) return "[--:--]";
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `[${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}]`;
}

const STOP_WORDS = ["uh", "um", "er", "ah", "hmm", "hm", "eh", "oh"];

/** Removes filler words from transcript text before display. Apply at render time, not storage. */
export function cleanStopWords(text: string): string {
  if (!text || text.trim().length === 0) return text;

  let cleaned = text;
  for (const word of STOP_WORDS) {
    const pattern = new RegExp(`\\b${word}\\b[,\\s]*`, "gi");
    cleaned = cleaned.replace(pattern, " ");
  }

  return cleaned.replace(/\s+/g, " ").trim();
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/meetings/__tests__/format-helpers.test.ts
```
Expected: PASS (10 tests)

**Step 5: Commit**

```bash
git add src/lib/meetings/format-helpers.ts src/lib/meetings/__tests__/format-helpers.test.ts
git commit -m "feat(pr70): add meeting format helpers (duration, timestamps, stop words)"
```

---

### Task 3: Groq Whisper Upgrade — verbose_json + Segments

Modify existing transcription utility to return segment timestamps.

**Files:**
- Modify: `src/lib/transcription/groq-whisper.ts`
- Test: `src/lib/transcription/__tests__/groq-whisper.test.ts` (create if doesn't exist)

**Step 1: Write the failing test**

Check if test file exists first: `ls src/lib/transcription/__tests__/groq-whisper.test.ts 2>/dev/null`

```typescript
// src/lib/transcription/__tests__/groq-whisper.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transcribeAudio } from "../groq-whisper";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("transcribeAudio", () => {
  beforeEach(() => {
    vi.stubEnv("GROQ_API_KEY", "test-groq-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns text and segments from verbose_json response", async () => {
    // Mock audio fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(new Blob(["audio"], { type: "audio/webm" })),
    });

    // Mock Groq response (verbose_json format)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        text: "Met with Sarah about the deal.",
        segments: [
          { start: 0.5, end: 3.2, text: "Met with Sarah" },
          { start: 3.5, end: 6.1, text: "about the deal." },
        ],
      }),
    });

    const result = await transcribeAudio({ audioUrl: "https://example.com/audio.webm" });

    expect(result.text).toBe("Met with Sarah about the deal.");
    expect(result.segments).toHaveLength(2);
    expect(result.segments![0]).toEqual({ start: 0.5, end: 3.2, text: "Met with Sarah" });
    expect(result.segments![1]).toEqual({ start: 3.5, end: 6.1, text: "about the deal." });
  });

  it("sends verbose_json response_format to Groq", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(new Blob(["audio"], { type: "audio/webm" })),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: "hello", segments: [] }),
    });

    await transcribeAudio({ audioUrl: "https://example.com/audio.webm" });

    // Verify the second fetch call (to Groq) sends verbose_json
    const groqCall = mockFetch.mock.calls[1];
    const body = groqCall[1].body as FormData;
    expect(body.get("response_format")).toBe("verbose_json");
    expect(body.getAll("timestamp_granularities[]")).toContain("segment");
  });

  it("returns empty segments when Groq omits them", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(new Blob(["audio"], { type: "audio/webm" })),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: "hello" }),
    });

    const result = await transcribeAudio({ audioUrl: "https://example.com/audio.webm" });
    expect(result.text).toBe("hello");
    expect(result.segments).toEqual([]);
  });

  it("throws when GROQ_API_KEY is not set", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    await expect(transcribeAudio({ audioUrl: "https://example.com/audio.webm" }))
      .rejects.toThrow("GROQ_API_KEY is not configured");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/transcription/__tests__/groq-whisper.test.ts
```
Expected: FAIL — `segments` property does not exist on result

**Step 3: Update the implementation**

Modify `src/lib/transcription/groq-whisper.ts`:

1. Change `TranscribeAudioResult` interface:
```typescript
export interface TranscribeAudioResult {
  /** Plain-text transcription returned by Groq Whisper. */
  text: string;
  /** Segment-level timestamps from verbose_json format. */
  segments: Array<{ start: number; end: number; text: string }>;
}
```

2. Change `response_format` from `"json"` to `"verbose_json"`:
```typescript
formData.append("response_format", "verbose_json");
formData.append("timestamp_granularities[]", "segment");
```

3. Update the return value to extract segments:
```typescript
const payload = await groqResponse.json() as {
  text?: unknown;
  segments?: Array<{ start: number; end: number; text: string }>;
};

return {
  text: typeof payload.text === "string" ? payload.text : "",
  segments: Array.isArray(payload.segments) ? payload.segments : [],
};
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/transcription/__tests__/groq-whisper.test.ts
```
Expected: PASS (4 tests)

**Step 5: Run existing ingest tests to check for regressions**

```bash
npx vitest run app/api/meetings/ingest/route.test.ts
```

The existing test mocks `mockTranscribeAudio.mockResolvedValue({ text: "Met with Sarah about the Orchard deal." })` — this still works because `segments` is optional in the usage. If any test fails because it checks the exact return shape, update the mock to include `segments: []`.

**Step 6: Commit**

```bash
git add src/lib/transcription/groq-whisper.ts src/lib/transcription/__tests__/groq-whisper.test.ts
git commit -m "feat(pr70): upgrade Groq Whisper to verbose_json for segment timestamps"
```

---

### Task 4: Database Migration

No test needed — SQL migration.

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_meetings_surface.sql`

**Step 1: Create the migration file**

```bash
# Generate timestamp for migration filename
date +%Y%m%d%H%M%S
```

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_meetings_surface.sql
-- PR 70: Meetings Surface — add title, summary columns; make thread_id nullable; update status CHECK

-- 1. Add new columns
ALTER TABLE public.meeting_records
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT;

-- 2. Make thread_id nullable (meetings now start without a thread)
ALTER TABLE public.meeting_records
  ALTER COLUMN thread_id DROP NOT NULL;

-- 3. Update status CHECK constraint to include 'summarizing'
ALTER TABLE public.meeting_records
  DROP CONSTRAINT IF EXISTS meeting_records_status_check;

ALTER TABLE public.meeting_records
  ADD CONSTRAINT meeting_records_status_check
  CHECK (status IN ('uploaded', 'transcribing', 'transcribed', 'summarizing', 'completed', 'failed'));

-- 4. Index for meetings list query (newest first per client)
CREATE INDEX IF NOT EXISTS idx_meeting_records_client_created
  ON public.meeting_records (client_id, created_at DESC);

-- 5. Comment
COMMENT ON COLUMN public.meeting_records.title IS 'Auto-generated meeting title from LLM summary';
COMMENT ON COLUMN public.meeting_records.summary IS 'Auto-generated markdown bullet-point summary';
```

**Step 2: Apply the migration locally**

```bash
npx supabase db push
```
Or if using Supabase CLI locally:
```bash
npx supabase migration up
```

**Step 3: Regenerate TypeScript types**

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

Verify `meeting_records.Row` now includes `title: string | null` and `summary: string | null`, and `thread_id: string | null`.

**Step 4: Commit**

```bash
git add supabase/migrations/ src/types/database.ts
git commit -m "feat(pr70): migration — title, summary columns; nullable thread_id; summarizing status"
```

---

### Task 5: Ingest Route Refactor — Auto-Summary

The biggest backend change. Modify the existing ingest route to: remove `threadId`, remove `runMeetingFollowUp`, add `generateObject` for auto-summary.

**Files:**
- Modify: `app/api/meetings/ingest/route.ts`
- Modify: `app/api/meetings/ingest/route.test.ts`
- Reference: `src/lib/ai/gateway.ts` — import `gateway`, `gatewayProviderOptions`, `COMPACTION_MODEL`

**Step 1: Update the test file for the new behavior**

The existing tests reference `threadId`, `mockRunMeetingFollowUp`, and `mockCreateMessage`. All of those go away. Add `generateObject` mock and new assertions.

Changes to `app/api/meetings/ingest/route.test.ts`:

1. **Remove** `mockRunMeetingFollowUp` and `mockCreateMessage` from hoisted mocks
2. **Remove** the mock for `@/lib/runner/run-meeting-followup` and `@/lib/chat/messages`
3. **Add** mock for `ai` module (`generateObject`):

```typescript
const { mockGenerateObject } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
}));

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));
```

4. **Add** mock for `@/lib/meetings/summary-prompt`:

```typescript
const { mockBuildSummaryPrompt } = vi.hoisted(() => ({
  mockBuildSummaryPrompt: vi.fn(),
}));

vi.mock("@/lib/meetings/summary-prompt", () => ({
  buildSummaryPrompt: (...args: unknown[]) => mockBuildSummaryPrompt(...args),
}));
```

5. **Add** mock for `@/lib/ai/gateway`:

```typescript
const { mockGateway } = vi.hoisted(() => ({
  mockGateway: vi.fn().mockReturnValue("mock-model"),
}));

vi.mock("@/lib/ai/gateway", () => ({
  gateway: (...args: unknown[]) => mockGateway(...args),
  gatewayProviderOptions: {},
  COMPACTION_MODEL: "google/gemini-2.5-flash-lite",
}));
```

6. **Update** `beforeEach` — remove thread query mock setup, add:

```typescript
mockBuildSummaryPrompt.mockReturnValue("test prompt");
mockGenerateObject.mockResolvedValue({
  object: {
    title: "Portfolio Review with Sarah",
    summary: "- Discussed the Orchard deal\n- Follow up Thursday",
  },
});
```

7. **Rewrite the main success test:**

```typescript
it("creates the meeting record, transcribes, auto-summarizes, and returns result", async () => {
  const response = await POST(
    new Request("http://localhost/api/meetings/ingest", {
      method: "POST",
      body: JSON.stringify({
        storagePath: "client-1/meetings/raw/uploaded.webm",
        durationSeconds: 180,
        notes: "Call back Thursday\nSend pricing",
        idempotencyKey: "880e8400-e29b-41d4-a716-446655440000",
      }),
    }),
  );

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toEqual({
    success: true,
    meetingRecordId: "770e8400-e29b-41d4-a716-446655440000",
    transcriptPath: "home/meetings/2026-04-06-meeting-770e8400.md",
    title: "Portfolio Review with Sarah",
    summary: "- Discussed the Orchard deal\n- Follow up Thursday",
  });

  // Groq was called
  expect(mockTranscribeAudio).toHaveBeenCalledWith({
    audioUrl: "https://storage.example.com/audio?token=signed",
  });

  // generateObject was called with the summary prompt
  expect(mockGenerateObject).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: "test prompt",
    }),
  );

  // runMeetingFollowUp was NOT called (removed)
  // mockCreateMessage was NOT called (removed)
});
```

8. **Remove** the "creates the thread when it does not exist" test (threads are no longer involved)

9. **Update** the idempotency test — response now includes `title` and `summary`:

```typescript
expect(body).toEqual({
  success: true,
  meetingRecordId: "existing-meeting-id",
  transcriptPath: "home/meetings/existing.md",
  title: null,       // idempotent response returns existing data
  summary: null,
  deduplicated: true,
});
```

10. **Update** the tenant prefix test — remove `threadId` from the request body.

**Step 2: Run tests to verify they fail**

```bash
npx vitest run app/api/meetings/ingest/route.test.ts
```
Expected: FAIL — route still expects `threadId`, still calls `runMeetingFollowUp`

**Step 3: Update the route implementation**

Modify `app/api/meetings/ingest/route.ts`:

1. **Remove** imports: `createMessage`, `runMeetingFollowUp`
2. **Add** imports:
```typescript
import { generateObject } from "ai";
import { z } from "zod";
import { gateway, gatewayProviderOptions, COMPACTION_MODEL } from "@/lib/ai/gateway";
import { buildSummaryPrompt } from "@/lib/meetings/summary-prompt";
```

3. **Update** `ingestSchema` — remove `threadId`:
```typescript
const ingestSchema = z.object({
  storagePath: z.string().min(1),
  durationSeconds: z.number().int().positive(),
  notes: z.string().optional().default(""),
  idempotencyKey: z.string().uuid(),
});
```

4. **Remove** the thread existence check and creation block (lines ~82-98 in current file)

5. **Insert** `meeting_records` with `thread_id: null` instead of `thread_id: threadId`

6. **After** transcript upload succeeds, add the auto-summary:
```typescript
// --- Auto-summary via generateObject ---
await updateMeetingRecordStatus(supabase, meetingRecordId, { status: "summarizing" });

const summaryPrompt = buildSummaryPrompt(transcription.text, notes);
const { object: summaryResult } = await generateObject({
  model: gateway(COMPACTION_MODEL, gatewayProviderOptions),
  schema: z.object({
    title: z.string().describe("Short meeting title, 3-8 words"),
    summary: z.string().describe("Markdown bullet-point summary of the meeting"),
  }),
  prompt: summaryPrompt,
  providerOptions: gatewayProviderOptions,
});

await updateMeetingRecordStatus(supabase, meetingRecordId, {
  status: "completed",
  title: summaryResult.title,
  summary: summaryResult.summary,
});
```

7. **Remove** the `createMessage` call and the `runMeetingFollowUp` call

8. **Update** the return:
```typescript
return Response.json({
  success: true,
  meetingRecordId,
  transcriptPath,
  title: summaryResult.title,
  summary: summaryResult.summary,
});
```

9. For the **idempotency** early return, also return title/summary from the existing record:
```typescript
return Response.json({
  success: true,
  meetingRecordId: existingRecord.meeting_record_id,
  transcriptPath: existingRecord.transcript_path,
  title: existingRecord.title ?? null,
  summary: existingRecord.summary ?? null,
  deduplicated: true,
});
```
(Update the `.select()` to include `title, summary` in the fields.)

**Step 4: Run tests to verify they pass**

```bash
npx vitest run app/api/meetings/ingest/route.test.ts
```
Expected: PASS

**Step 5: Also run upload-url tests to make sure nothing broke**

```bash
npx vitest run app/api/meetings/upload-url/route.test.ts
```
Expected: PASS (upload-url doesn't reference threadId in schema — check this)

**Step 6: Commit**

```bash
git add app/api/meetings/ingest/route.ts app/api/meetings/ingest/route.test.ts src/lib/meetings/summary-prompt.ts
git commit -m "feat(pr70): ingest route auto-summary — remove threadId + runMeetingFollowUp, add generateObject"
```

---

### Task 6: Sidebar Navigation

Small change, fast to verify.

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx:64-67`

**Step 1: Add Meetings to databaseNavItems**

In `src/components/layout/app-sidebar.tsx`, find `databaseNavItems` (line ~65) and add:

```typescript
const databaseNavItems: NavigationItem[] = [
  { label: "Channels", href: "/channels", icon: "channels" },
  { label: "Meetings", href: "/meetings", icon: "meeting" },
];
```

The `meeting` icon is already registered in `src/components/icons/app-icons.tsx:146` as `CalendarDaysIcon`.

**Step 2: Verify visually**

```bash
npm run dev
```
Navigate to the app. Verify "Meetings" appears in the DATABASE section of the sidebar with a calendar icon. Click it — it should navigate to `/meetings` (404 for now is expected).

**Step 3: Commit**

```bash
git add src/components/layout/app-sidebar.tsx
git commit -m "feat(pr70): add Meetings to sidebar DATABASE section"
```

---

### Task 7: TanStack Query Hooks

Data layer for the meetings pages.

**Files:**
- Create: `src/hooks/use-meetings.ts`
- Reference: `src/hooks/use-record-notes.ts` — follow this pattern exactly

**Step 1: Write the hooks**

```typescript
// src/hooks/use-meetings.ts
/**
 * TanStack Query hooks for meeting records.
 * Follows the use-record-notes.ts pattern: query key factory, fetch functions,
 * queryOptions builder, Realtime invalidation.
 * @module hooks/use-meetings
 */
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime-table";

/** Query key factory for meetings cache. */
export const meetingKeys = {
  all: ["meetings"] as const,
  lists: () => [...meetingKeys.all, "list"] as const,
  list: (clientId: string) => [...meetingKeys.lists(), clientId] as const,
  details: () => [...meetingKeys.all, "detail"] as const,
  detail: (id: string) => [...meetingKeys.details(), id] as const,
};

export interface MeetingRecord {
  meeting_record_id: string;
  title: string | null;
  summary: string | null;
  duration_seconds: number | null;
  notes: string | null;
  status: string;
  transcript_path: string | null;
  audio_path: string;
  thread_id: string | null;
  created_at: string;
  updated_at: string;
}

async function fetchMeetings(clientId: string): Promise<MeetingRecord[]> {
  const { data, error } = await supabase
    .from("meeting_records")
    .select("meeting_record_id, title, summary, duration_seconds, notes, status, transcript_path, audio_path, thread_id, created_at, updated_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as MeetingRecord[];
}

async function fetchMeeting(meetingId: string): Promise<MeetingRecord | null> {
  const { data, error } = await supabase
    .from("meeting_records")
    .select("meeting_record_id, title, summary, duration_seconds, notes, status, transcript_path, audio_path, thread_id, created_at, updated_at")
    .eq("meeting_record_id", meetingId)
    .maybeSingle();

  if (error) throw error;
  return data as MeetingRecord | null;
}

export function meetingsQueryOptions(clientId: string) {
  return queryOptions({
    queryKey: meetingKeys.list(clientId),
    queryFn: () => fetchMeetings(clientId),
  });
}

export function meetingQueryOptions(meetingId: string) {
  return queryOptions({
    queryKey: meetingKeys.detail(meetingId),
    queryFn: () => fetchMeeting(meetingId),
    enabled: Boolean(meetingId),
  });
}

/** Hook to fetch all meetings for the current client with Realtime invalidation. */
export function useMeetings() {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "meeting_records",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: clientId ? [meetingKeys.list(clientId)] : [],
    enabled: Boolean(clientId),
  });

  return useQuery({
    ...meetingsQueryOptions(clientId ?? ""),
    enabled: Boolean(clientId),
  });
}

/** Hook to fetch a single meeting by ID. */
export function useMeeting(meetingId: string) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "meeting_records",
    filter: `meeting_record_id=eq.${meetingId}`,
    queryKeys: [meetingKeys.detail(meetingId)],
    enabled: Boolean(meetingId),
  });

  return useQuery({
    ...meetingQueryOptions(meetingId),
    enabled: Boolean(meetingId),
  });
}
```

**Step 2: Verify it compiles**

```bash
npx tsc --noEmit src/hooks/use-meetings.ts
```

If `useClientId` or `useRealtimeTable` have different signatures, adapt — check `src/hooks/use-record-notes.ts` for the exact pattern.

**Step 3: Commit**

```bash
git add src/hooks/use-meetings.ts
git commit -m "feat(pr70): TanStack Query hooks for meeting records"
```

---

### Task 8: Meetings List Page

The `/meetings` route — date-grouped list of meetings.

**Files:**
- Create: `app/(dashboard)/meetings/page.tsx`
- Create: `src/components/meetings/meetings-list.tsx`
- Create: `src/components/meetings/meeting-row.tsx`
- Reference: `app/(dashboard)/tasks/page.tsx` — page structure
- Reference: design doc UX wireframes — "Meetings list page" section

**Step 1: Create the meeting row component**

```typescript
// src/components/meetings/meeting-row.tsx
"use client";

import Link from "next/link";
import type { MeetingRecord } from "@/hooks/use-meetings";

interface MeetingRowProps {
  meeting: MeetingRecord;
}

/** Formats duration_seconds as "XX min". */
function formatMeetingDuration(seconds: number | null): string {
  if (!seconds) return "";
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

/** Formats ISO timestamp as "3:15p" style time. */
function formatMeetingTime(isoDate: string): string {
  const date = new Date(isoDate);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "p" : "a";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")}${ampm}`;
}

export function MeetingRow({ meeting }: MeetingRowProps) {
  const title = meeting.title || "Untitled meeting";
  const duration = formatMeetingDuration(meeting.duration_seconds);
  const time = formatMeetingTime(meeting.created_at);

  return (
    <Link
      href={`/meetings/${meeting.meeting_record_id}`}
      className="flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-muted/50 transition-colors group"
    >
      <span className="text-sm font-medium text-foreground truncate">{title}</span>
      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-3">
        {duration && <span>{duration}</span>}
        <span>{time}</span>
      </div>
    </Link>
  );
}
```

**Step 2: Create the meetings list (date-grouped)**

```typescript
// src/components/meetings/meetings-list.tsx
"use client";

import type { MeetingRecord } from "@/hooks/use-meetings";
import { MeetingRow } from "./meeting-row";

interface MeetingsListProps {
  meetings: MeetingRecord[];
}

/** Groups meetings by date label: Today, Yesterday, or a named date. */
function groupByDate(meetings: MeetingRecord[]): Map<string, MeetingRecord[]> {
  const groups = new Map<string, MeetingRecord[]>();
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  for (const meeting of meetings) {
    const dateStr = meeting.created_at.split("T")[0];
    let label: string;

    if (dateStr === todayStr) {
      label = "Today";
    } else if (dateStr === yesterdayStr) {
      label = "Yesterday";
    } else {
      label = new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }

    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(meeting);
  }

  return groups;
}

export function MeetingsList({ meetings }: MeetingsListProps) {
  if (meetings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">No meetings yet</p>
        <p className="text-xs mt-1">Click &quot;New Meeting&quot; to record your first one.</p>
      </div>
    );
  }

  const groups = groupByDate(meetings);

  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([label, groupMeetings]) => (
        <div key={label}>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/50 px-3 mb-1">
            {label}
          </h3>
          <div className="space-y-0.5">
            {groupMeetings.map((meeting) => (
              <MeetingRow key={meeting.meeting_record_id} meeting={meeting} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 3: Create the page**

```typescript
// app/(dashboard)/meetings/page.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AppIcon } from "@/components/icons/app-icons";
import { useMeetings } from "@/hooks/use-meetings";
import { MeetingsList } from "@/components/meetings/meetings-list";
// MeetingRecordingView will be created in Task 10
// import { MeetingRecordingView } from "@/components/meetings/meeting-recording-view";

export default function MeetingsPage() {
  const { data: meetings, isLoading } = useMeetings();
  const [isRecording, setIsRecording] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Loading meetings...</p>
      </div>
    );
  }

  // TODO Task 10: if (isRecording) return <MeetingRecordingView onDone={() => setIsRecording(false)} />;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h1 className="text-lg font-semibold">Meetings</h1>
        <Button size="sm" onClick={() => setIsRecording(true)}>
          <AppIcon name="meeting" className="h-4 w-4 mr-1.5" />
          New Meeting
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <MeetingsList meetings={meetings ?? []} />
      </div>
    </div>
  );
}
```

**Step 4: Verify visually**

```bash
npm run dev
```
Navigate to `/meetings`. Verify the page renders with header, "New Meeting" button, and empty state (or meeting rows if any exist).

**Step 5: Commit**

```bash
git add app/\(dashboard\)/meetings/page.tsx src/components/meetings/meetings-list.tsx src/components/meetings/meeting-row.tsx
git commit -m "feat(pr70): meetings list page with date-grouped rows"
```

---

### Task 9: Meeting Detail Page

The `/meetings/[id]` route — summary, collapsible transcript, notes, "Send to agent".

**Files:**
- Create: `app/(dashboard)/meetings/[id]/page.tsx`
- Create: `src/components/meetings/summary-view.tsx`
- Create: `src/components/meetings/transcript-section.tsx`
- Reference: design doc UX wireframes — "Meeting detail page" section
- Reference: `src/lib/meetings/format-helpers.ts` — from Task 2

**Step 1: Create summary-view component**

```typescript
// src/components/meetings/summary-view.tsx
"use client";

import ReactMarkdown from "react-markdown";

interface SummaryViewProps {
  summary: string | null;
  status: string;
}

export function SummaryView({ summary, status }: SummaryViewProps) {
  if (status === "summarizing") {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span className="text-sm">Generating summary...</span>
      </div>
    );
  }

  if (!summary) {
    return (
      <p className="text-sm text-muted-foreground py-4">No summary available.</p>
    );
  }

  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown>{summary}</ReactMarkdown>
    </div>
  );
}
```

**Step 2: Create transcript-section component (collapsible)**

```typescript
// src/components/meetings/transcript-section.tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatRecordingTime, cleanStopWords } from "@/lib/meetings/format-helpers";

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptSectionProps {
  /** Raw transcript text (when segments unavailable). */
  transcriptText?: string;
  /** Segment-level transcript with timestamps. */
  segments?: TranscriptSegment[];
}

export function TranscriptSection({ transcriptText, segments }: TranscriptSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasContent = (segments && segments.length > 0) || (transcriptText && transcriptText.trim().length > 0);
  if (!hasContent) return null;

  return (
    <div className="border-t pt-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
      >
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Transcript
      </button>

      {isOpen && (
        <div className="mt-3 space-y-2">
          {segments && segments.length > 0 ? (
            segments.map((segment, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span className="text-xs text-muted-foreground font-mono shrink-0 mt-0.5">
                  {formatRecordingTime(segment.start)}
                </span>
                <span className="text-foreground">{cleanStopWords(segment.text)}</span>
              </div>
            ))
          ) : transcriptText ? (
            <p className="text-sm text-foreground whitespace-pre-wrap">{transcriptText}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Create the detail page**

```typescript
// app/(dashboard)/meetings/[id]/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMeeting } from "@/hooks/use-meetings";
import { SummaryView } from "@/components/meetings/summary-view";
import { TranscriptSection } from "@/components/meetings/transcript-section";

function formatDetailDuration(seconds: number | null): string {
  if (!seconds) return "";
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

function formatDetailDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function countNotes(notes: string | null): number {
  if (!notes) return 0;
  return notes.split("\n").map((l) => l.trim()).filter((l) => l.length > 0).length;
}

export default function MeetingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: meeting, isLoading } = useMeeting(params.id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Loading meeting...</p>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-sm text-muted-foreground">Meeting not found.</p>
        <Link href="/meetings" className="text-sm text-primary underline">Back to meetings</Link>
      </div>
    );
  }

  const noteCount = countNotes(meeting.notes);

  const handleSendToAgent = async () => {
    // TODO Task 11: POST /api/meetings/[id]/send-to-agent → navigate to thread
    // For now, just log
    console.log("Send to agent:", meeting.meeting_record_id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <Link href="/meetings" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="h-3.5 w-3.5" />
          Meetings
        </Link>
        <h1 className="text-lg font-semibold">{meeting.title || "Untitled meeting"}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatDetailDate(meeting.created_at)}
          {meeting.duration_seconds ? ` \u00b7 ${formatDetailDuration(meeting.duration_seconds)}` : ""}
          {noteCount > 0 ? ` \u00b7 ${noteCount} note${noteCount !== 1 ? "s" : ""}` : ""}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* Summary */}
        <section>
          <h2 className="text-sm font-semibold mb-2">Summary</h2>
          <SummaryView summary={meeting.summary} status={meeting.status} />
        </section>

        {/* Transcript (collapsible, default closed) */}
        <TranscriptSection transcriptText={undefined} segments={undefined} />
        {/* TODO: Load transcript from storage via transcript_path and parse segments */}

        {/* Notes */}
        {meeting.notes && meeting.notes.trim().length > 0 && (
          <section className="border-t pt-3">
            <h2 className="text-sm font-semibold mb-2">Notes</h2>
            <p className="text-sm text-foreground whitespace-pre-wrap">{meeting.notes}</p>
          </section>
        )}
      </div>

      {/* Footer — Send to agent */}
      <div className="border-t px-4 py-3">
        <Button
          onClick={handleSendToAgent}
          disabled={!meeting.thread_id && meeting.status !== "completed"}
          variant="default"
          className="w-full sm:w-auto"
        >
          {meeting.thread_id ? "Open agent thread" : "Send to agent"}
        </Button>
      </div>
    </div>
  );
}
```

**Step 4: Verify visually**

```bash
npm run dev
```
Create a test meeting via the ingest route (or if any exist from PR 68). Navigate to `/meetings/[id]`. Verify: back link, title, date/duration/notes metadata, summary markdown, collapsible transcript header, notes, and "Send to agent" button.

**Step 5: Commit**

```bash
git add app/\(dashboard\)/meetings/\[id\]/page.tsx src/components/meetings/summary-view.tsx src/components/meetings/transcript-section.tsx
git commit -m "feat(pr70): meeting detail page with summary, transcript, notes, send-to-agent"
```

---

### Task 10: Recording Flow on Meetings Surface

Move recording from chat to meetings. This is the most complex frontend task.

**Files:**
- Create: `src/components/meetings/meeting-recording-view.tsx`
- Create: `src/hooks/meetings/use-meeting-recording.ts`
- Modify: `app/(dashboard)/meetings/page.tsx` — wire up recording state
- Reference: `src/components/chat/recording-bar.tsx` — reuse
- Reference: `src/components/chat/meeting-notepad.tsx` — reuse
- Reference: design doc UX wireframes — "Recording state" section

**Step 1: Create the recording state hook**

This hook manages the full lifecycle: idle → recording → stopping → uploading → transcribing → done.

```typescript
// src/hooks/meetings/use-meeting-recording.ts
/**
 * Recording state machine for the meetings surface.
 * Manages MediaRecorder lifecycle, upload, and ingest call.
 * @module hooks/meetings/use-meeting-recording
 */
"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type RecordingStatus = "idle" | "recording" | "paused" | "stopping" | "uploading" | "transcribing" | "done" | "error";

interface UseMeetingRecordingReturn {
  status: RecordingStatus;
  elapsedSeconds: number;
  notes: string;
  setNotes: (notes: string) => void;
  errorMessage: string | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<void>;
}

export function useMeetingRecording(): UseMeetingRecordingReturn {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [notes, setNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedDurationRef = useRef<number>(0);
  const pauseStartRef = useRef<number>(0);

  const router = useRouter();

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const now = Date.now();
      const active = (now - startTimeRef.current - pausedDurationRef.current) / 1000;
      setElapsedSeconds(Math.floor(active));
    }, 500);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(1000); // collect chunks every 1s
      mediaRecorderRef.current = recorder;
      startTimeRef.current = Date.now();
      pausedDurationRef.current = 0;
      setElapsedSeconds(0);
      setStatus("recording");
      setErrorMessage(null);
      startTimer();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to start recording");
      setStatus("error");
    }
  }, [startTimer]);

  const pause = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      pauseStartRef.current = Date.now();
      setStatus("paused");
      stopTimer();
    }
  }, [stopTimer]);

  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      pausedDurationRef.current += Date.now() - pauseStartRef.current;
      mediaRecorderRef.current.resume();
      setStatus("recording");
      startTimer();
    }
  }, [startTimer]);

  const stop = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    setStatus("stopping");
    stopTimer();

    // Wait for final data
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });

    // Stop all tracks
    recorder.stream.getTracks().forEach((t) => t.stop());

    const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
    const idempotencyKey = crypto.randomUUID();

    try {
      // 1. Get presigned upload URL
      setStatus("uploading");
      const uploadRes = await fetch("/api/meetings/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: "recording.webm",
          contentType: "audio/webm",
          durationSeconds: elapsedSeconds,
        }),
      });

      if (!uploadRes.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl, storagePath, token } = await uploadRes.json();

      // 2. Upload audio via presigned URL
      await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "audio/webm",
          Authorization: `Bearer ${token}`,
        },
        body: audioBlob,
      });

      // 3. Ingest (transcribe + auto-summarize)
      setStatus("transcribing");
      const ingestRes = await fetch("/api/meetings/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath,
          durationSeconds: elapsedSeconds,
          notes,
          idempotencyKey,
        }),
      });

      if (!ingestRes.ok) throw new Error("Ingest failed");
      const { meetingRecordId } = await ingestRes.json();

      // 4. Navigate to detail page
      setStatus("done");
      router.push(`/meetings/${meetingRecordId}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Recording failed");
      setStatus("error");
    }
  }, [elapsedSeconds, notes, router, stopTimer]);

  return { status, elapsedSeconds, notes, setNotes, errorMessage, start, pause, resume, stop };
}
```

**Step 2: Create the recording view component**

```typescript
// src/components/meetings/meeting-recording-view.tsx
"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Pause, Play, Square } from "lucide-react";
import { useMeetingRecording, type RecordingStatus } from "@/hooks/meetings/use-meeting-recording";
import { formatDuration } from "@/lib/meetings/format-helpers";

interface MeetingRecordingViewProps {
  onDone: () => void;
}

function StatusMessage({ status }: { status: RecordingStatus }) {
  switch (status) {
    case "stopping": return <span>Stopping...</span>;
    case "uploading": return <span>Uploading audio...</span>;
    case "transcribing": return <span>Transcribing &amp; summarizing...</span>;
    case "error": return <span className="text-destructive">Something went wrong</span>;
    default: return null;
  }
}

export function MeetingRecordingView({ onDone }: MeetingRecordingViewProps) {
  const { status, elapsedSeconds, notes, setNotes, errorMessage, start, pause, resume, stop } = useMeetingRecording();

  // Auto-start recording when component mounts
  useEffect(() => {
    if (status === "idle") {
      start();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isProcessing = ["stopping", "uploading", "transcribing"].includes(status);

  return (
    <div className="flex flex-col h-full">
      {/* Recording bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <div className={`w-2.5 h-2.5 rounded-full ${status === "paused" ? "bg-warning" : "bg-destructive animate-pulse"}`} />
        <span className="font-mono text-sm">{formatDuration(elapsedSeconds)}</span>

        <div className="ml-auto flex items-center gap-2">
          {status === "recording" && (
            <Button size="icon-sm" variant="ghost" onClick={pause}>
              <Pause className="h-4 w-4" />
            </Button>
          )}
          {status === "paused" && (
            <Button size="icon-sm" variant="ghost" onClick={resume}>
              <Play className="h-4 w-4" />
            </Button>
          )}
          <Button size="icon-sm" variant="destructive" onClick={stop} disabled={isProcessing}>
            <Square className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Processing status */}
      {isProcessing && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 text-sm text-muted-foreground">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <StatusMessage status={status} />
        </div>
      )}

      {/* Error */}
      {status === "error" && errorMessage && (
        <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm">
          {errorMessage}
          <Button variant="link" size="sm" className="ml-2" onClick={onDone}>Back to meetings</Button>
        </div>
      )}

      {/* Notepad */}
      <div className="flex-1 px-4 py-3">
        <textarea
          className="w-full h-full resize-none bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/50"
          placeholder="Type notes during your meeting..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          autoFocus
          disabled={isProcessing}
        />
      </div>
    </div>
  );
}
```

**Step 3: Wire it into the meetings page**

Update `app/(dashboard)/meetings/page.tsx` — uncomment the `MeetingRecordingView` import and the conditional render:

```typescript
import { MeetingRecordingView } from "@/components/meetings/meeting-recording-view";

// In the component body, replace the TODO comment:
if (isRecording) {
  return <MeetingRecordingView onDone={() => setIsRecording(false)} />;
}
```

**Step 4: Verify visually**

```bash
npm run dev
```
Navigate to `/meetings`, click "New Meeting". Verify: recording bar appears, timer counts up, notepad is editable, pause/resume work, stop triggers upload + transcription status messages, then navigates to the detail page.

**Step 5: Commit**

```bash
git add src/hooks/meetings/use-meeting-recording.ts src/components/meetings/meeting-recording-view.tsx app/\(dashboard\)/meetings/page.tsx
git commit -m "feat(pr70): recording flow on meetings surface — record, upload, auto-summarize, navigate"
```

---

### Task 11: Agent Handoff — "Send to Agent"

API route that creates a thread + user message + starts agent run.

**Files:**
- Create: `app/api/meetings/[id]/send-to-agent/route.ts`
- Create: `app/api/meetings/[id]/send-to-agent/route.test.ts`
- Modify: `app/(dashboard)/meetings/[id]/page.tsx` — wire up button
- Reference: `src/lib/runner/run-meeting-followup.ts` — patterns for `runAgent` calls
- Reference: design doc — "Agent Handoff Prompt Template" section

**Step 1: Write the failing test**

```typescript
// app/api/meetings/[id]/send-to-agent/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockJsonError,
  mockResolveClientId,
  mockRunAgent,
  mockCreateMessage,
  mockMeetingSelect,
  mockMeetingUpdate,
  mockThreadInsert,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockJsonError: vi.fn((msg: string, status: number) => Response.json({ error: msg }, { status })),
  mockResolveClientId: vi.fn(),
  mockRunAgent: vi.fn(),
  mockCreateMessage: vi.fn(),
  mockMeetingSelect: vi.fn(),
  mockMeetingUpdate: vi.fn(),
  mockThreadInsert: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  jsonError: (...args: unknown[]) => mockJsonError(...args),
}));
vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));
vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: (...args: unknown[]) => mockRunAgent(...args),
}));
vi.mock("@/lib/chat/messages", () => ({
  createMessage: (...args: unknown[]) => mockCreateMessage(...args),
}));

import { POST } from "./route";

describe("POST /api/meetings/[id]/send-to-agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "meeting_records") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: mockMeetingSelect,
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: mockMeetingUpdate,
              }),
            };
          }
          if (table === "conversation_threads") {
            return { insert: mockThreadInsert };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      },
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("client-1");
    mockMeetingSelect.mockResolvedValue({
      data: {
        meeting_record_id: "meeting-1",
        title: "Portfolio Review",
        summary: "- Discussed portfolio\n- Follow up Thursday",
        notes: "call back Thursday",
        duration_seconds: 2700,
        transcript_path: "home/meetings/2026-04-06-meeting-meeting-1.md",
        thread_id: null,
        created_at: "2026-04-06T09:30:00.000Z",
      },
      error: null,
    });
    mockThreadInsert.mockResolvedValue({ error: null });
    mockMeetingUpdate.mockResolvedValue({ error: null });
    mockCreateMessage.mockResolvedValue({ message_id: "msg-1" });
    mockRunAgent.mockResolvedValue({ status: "streaming", streamResult: { consumeStream: vi.fn() } });
  });

  it("creates a thread, user message, and returns the threadId", async () => {
    const response = await POST(
      new Request("http://localhost/api/meetings/meeting-1/send-to-agent", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "meeting-1" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.threadId).toBeDefined();
    expect(mockCreateMessage).toHaveBeenCalled();
    expect(mockRunAgent).toHaveBeenCalled();
  });
});
```

**Step 2: Run to verify it fails**

```bash
npx vitest run app/api/meetings/\[id\]/send-to-agent/route.test.ts
```
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// app/api/meetings/[id]/send-to-agent/route.ts
/**
 * Creates a chat thread pre-loaded with meeting context and starts an agent run.
 * @module app/api/meetings/[id]/send-to-agent/route
 */
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { createMessage } from "@/lib/chat/messages";
import { runAgent } from "@/lib/runner/run-agent";

function buildHandoffMessage(meeting: {
  title: string | null;
  summary: string | null;
  notes: string | null;
  duration_seconds: number | null;
  transcript_path: string | null;
  created_at: string;
}): string {
  const date = new Date(meeting.created_at).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const durationMinutes = meeting.duration_seconds
    ? Math.max(1, Math.round(meeting.duration_seconds / 60))
    : 0;

  return `A meeting was just recorded and auto-summarized. Review the summary and notes below, then help the user process it.

## What to do

1. Read the summary and notes. Identify people, companies, and deals mentioned.
2. Search the CRM for matches. If you find a likely match, suggest linking the meeting to that record. Ask the user to confirm before linking.
3. Look for actionable items: tasks to create, deal stages to update, follow-up emails to draft, personal details worth remembering.
4. Present what you found and what you'd recommend. Let the user decide what to act on.

If you need more detail than the summary provides, the full transcript is at \`/agent/${meeting.transcript_path}\` \u2014 use read_file to access it.

## Meeting Details

- **Date:** ${date}
- **Duration:** ${durationMinutes} minutes

## Summary

${meeting.summary || "(No summary available)"}

## User Notes

${meeting.notes?.trim() || "(No notes taken)"}`;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;

  const { supabase, userId } = authResult;
  const { id: meetingId } = await params;

  try {
    const clientId = await resolveClientId(supabase, userId);

    // Fetch meeting
    const { data: meeting, error: meetingError } = await supabase
      .from("meeting_records")
      .select("meeting_record_id, title, summary, notes, duration_seconds, transcript_path, thread_id, created_at")
      .eq("meeting_record_id", meetingId)
      .eq("client_id", clientId)
      .single();

    if (meetingError || !meeting) {
      return jsonError("Meeting not found", 404);
    }

    // If already has a thread, return it
    if (meeting.thread_id) {
      return Response.json({ success: true, threadId: meeting.thread_id });
    }

    // Create thread
    const threadId = crypto.randomUUID();
    const { error: threadError } = await supabase
      .from("conversation_threads")
      .insert({ thread_id: threadId, client_id: clientId, title: meeting.title });

    if (threadError) {
      return jsonError("Failed to create thread", 500);
    }

    // Link thread to meeting
    await supabase
      .from("meeting_records")
      .update({ thread_id: threadId, updated_at: new Date().toISOString() })
      .eq("meeting_record_id", meetingId);

    // Create handoff user message
    const handoffContent = buildHandoffMessage(meeting);
    await createMessage(supabase, {
      thread_id: threadId,
      role: "user",
      content: handoffContent,
      parts: [{ type: "text", text: handoffContent }],
    });

    // Fire agent run (don't await — let it stream)
    void runAgent(
      {
        clientId,
        threadId,
        input: "",
        triggerType: "pulse",
        channel: "web",
        consumeMessageQuota: false,
      },
      supabase,
    ).catch((err) => console.error("[send-to-agent] Agent run failed:", err));

    return Response.json({ success: true, threadId });
  } catch (error) {
    console.error("[send-to-agent] Error:", error);
    return jsonError("Failed to send to agent", 500);
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run app/api/meetings/\[id\]/send-to-agent/route.test.ts
```
Expected: PASS

**Step 5: Wire up the button in the detail page**

Update `app/(dashboard)/meetings/[id]/page.tsx` — replace the `handleSendToAgent` stub:

```typescript
const handleSendToAgent = async () => {
  const res = await fetch(`/api/meetings/${meeting.meeting_record_id}/send-to-agent`, {
    method: "POST",
  });
  if (!res.ok) return;
  const { threadId } = await res.json();
  router.push(`/chat/${threadId}`);
};
```

**Step 6: Commit**

```bash
git add app/api/meetings/\[id\]/send-to-agent/ app/\(dashboard\)/meetings/\[id\]/page.tsx
git commit -m "feat(pr70): send-to-agent — thread creation + handoff prompt + agent run"
```

---

### Task 12: search_meetings Agent Tool

New tool following the existing factory pattern.

**Files:**
- Create: `src/lib/runner/tools/meetings/search.ts`
- Create: `src/lib/runner/tools/meetings/index.ts`
- Create: `src/lib/runner/tools/meetings/__tests__/search.test.ts`
- Modify: `src/lib/runner/tools/index.ts` — add export
- Modify: `src/lib/runner/tool-registry.ts` — register
- Reference: `src/lib/runner/tools/crm/search.ts` — pattern to follow

**Step 1: Write the failing test**

```typescript
// src/lib/runner/tools/meetings/__tests__/search.test.ts
import { describe, expect, it, vi } from "vitest";
import { createMeetingTools } from "../index";

function createMockSupabase(data: unknown[] = [], error: unknown = null) {
  const limit = vi.fn().mockResolvedValue({ data, error });
  const order = vi.fn().mockReturnValue({ limit });
  const eq = vi.fn().mockReturnValue({ order, or: vi.fn().mockReturnValue({ order }) });
  const select = vi.fn().mockReturnValue({ eq });

  return {
    from: vi.fn().mockReturnValue({ select }),
  } as any;
}

describe("search_meetings tool", () => {
  it("returns meetings for the given client", async () => {
    const mockMeetings = [
      { meeting_record_id: "m1", title: "Standup", summary: "- daily sync", duration_seconds: 600, notes: null, created_at: "2026-04-06T09:00:00Z", status: "completed" },
    ];
    const supabase = createMockSupabase(mockMeetings);
    const tools = createMeetingTools(supabase, "client-1");

    const result = await tools.search_meetings.execute({ limit: 10 }, { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal });
    expect(result).toEqual({ success: true, entity: mockMeetings });
  });

  it("returns error on Supabase failure", async () => {
    const supabase = createMockSupabase(null, { message: "DB error" });
    const tools = createMeetingTools(supabase, "client-1");

    const result = await tools.search_meetings.execute({ limit: 10 }, { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal });
    expect(result).toEqual({ success: false, error: "DB error" });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/runner/tools/meetings/__tests__/search.test.ts
```
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/lib/runner/tools/meetings/search.ts
/**
 * Agent tool for searching past meeting recordings.
 * @module lib/runner/tools/meetings/search
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database";

export function createSearchMeetingsTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const search_meetings = tool({
    description:
      "Search past meeting recordings by keyword, date range, or linked CRM record. Returns title, summary, duration, and creation date.",
    parameters: z.object({
      query: z.string().optional().describe("Keyword search in title, notes, or summary"),
      dateFrom: z.string().optional().describe("ISO date lower bound (inclusive)"),
      dateTo: z.string().optional().describe("ISO date upper bound (inclusive)"),
      linkedContactId: z.string().uuid().optional().describe("Filter by linked contact"),
      linkedDealId: z.string().uuid().optional().describe("Filter by linked deal"),
      limit: z.number().int().min(1).max(20).optional().default(10),
    }),
    execute: async ({ query, dateFrom, dateTo, linkedContactId, linkedDealId, limit }) => {
      let q = supabase
        .from("meeting_records")
        .select("meeting_record_id, title, summary, duration_seconds, notes, created_at, status")
        .eq("client_id", clientId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (query) {
        q = q.or(`title.ilike.%${query}%,notes.ilike.%${query}%,summary.ilike.%${query}%`);
      }
      if (dateFrom) q = q.gte("created_at", dateFrom);
      if (dateTo) q = q.lte("created_at", dateTo);
      if (linkedContactId) q = q.eq("linked_contact_id", linkedContactId);
      if (linkedDealId) q = q.eq("linked_deal_id", linkedDealId);

      const { data, error } = await q;
      if (error) return { success: false as const, error: error.message };
      return { success: true as const, entity: data };
    },
  });

  return { search_meetings };
}
```

```typescript
// src/lib/runner/tools/meetings/index.ts
/**
 * Meeting tools barrel.
 * @module lib/runner/tools/meetings
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createSearchMeetingsTool } from "./search";

export function createMeetingTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  return {
    ...createSearchMeetingsTool(supabase, clientId),
  };
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/runner/tools/meetings/__tests__/search.test.ts
```
Expected: PASS

**Step 5: Register in tool-registry**

Add to `src/lib/runner/tools/index.ts`:
```typescript
export { createMeetingTools } from "./meetings";
```

Add to `src/lib/runner/tool-registry.ts` — inside `createRunnerTools()`, add:
```typescript
...createMeetingTools(supabase, clientId),
```

Find the exact insertion point by reading `tool-registry.ts`. It should be alongside the other `create*Tools()` calls.

**Step 6: Commit**

```bash
git add src/lib/runner/tools/meetings/ src/lib/runner/tools/index.ts src/lib/runner/tool-registry.ts
git commit -m "feat(pr70): search_meetings agent tool"
```

---

### Task 13: Chat Cleanup — Remove Mic Button

Remove recording UI from the chat surface (R10).

**Files:**
- Modify: `src/components/chat/chat-panel.tsx` (or wherever the mic button lives)
- Reference: `src/components/chat/recording-bar.tsx` — identify import sites
- Reference: `src/components/chat/meeting-notepad.tsx` — identify import sites

**Step 1: Find the mic button**

```bash
# Find where the mic icon / recording trigger is in chat
grep -rn "Mic\|recording\|mic" src/components/chat/chat-panel*.tsx | head -20
```

**Step 2: Remove the mic button and recording state from the chat composer**

This will vary depending on what's there. The goal is:
- Remove the mic button from the chat input/composer
- Remove any import of `recording-bar.tsx` or `meeting-notepad.tsx` from chat components
- Keep those files in `src/components/chat/` for now (the meetings surface imports them via the new `meeting-recording-view.tsx`, or they've been replaced)

**Step 3: Verify visually**

```bash
npm run dev
```
Navigate to `/chat`. Verify there is no microphone button in the composer. The chat should look clean — only text input + send button + attachment button.

**Step 4: Run all tests to verify nothing broke**

```bash
npx vitest run
```

**Step 5: Commit**

```bash
git add src/components/chat/
git commit -m "feat(pr70): remove meeting recording UI from chat composer (R10)"
```

---

### Task 14: Final Integration Test

Run the full suite and manually test the end-to-end flow.

**Step 1: Run all tests**

```bash
npx vitest run
```
All should pass.

**Step 2: Manual end-to-end test**

1. Navigate to `/meetings` — verify empty state or existing meetings
2. Click "New Meeting" — verify recording bar + notepad appear
3. Speak for 10-20 seconds, type a note
4. Click stop — verify upload → transcribing status messages
5. Verify auto-navigate to `/meetings/[id]` with title + summary
6. Click "Transcript" → verify it expands with `[MM:SS]` segments
7. Click "Send to agent" → verify new chat thread opens with handoff context
8. Agent responds with CRM suggestions
9. Back to `/meetings` — verify the meeting appears in the list with correct date grouping

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(pr70): meetings surface complete — recording, auto-summary, agent handoff"
```

---

## Relevant Files Summary

### Created
- `src/lib/meetings/summary-prompt.ts`
- `src/lib/meetings/__tests__/summary-prompt.test.ts`
- `src/lib/meetings/format-helpers.ts`
- `src/lib/meetings/__tests__/format-helpers.test.ts`
- `src/lib/transcription/__tests__/groq-whisper.test.ts`
- `supabase/migrations/YYYYMMDDHHMMSS_meetings_surface.sql`
- `src/hooks/use-meetings.ts`
- `src/hooks/meetings/use-meeting-recording.ts`
- `src/components/meetings/meetings-list.tsx`
- `src/components/meetings/meeting-row.tsx`
- `src/components/meetings/summary-view.tsx`
- `src/components/meetings/transcript-section.tsx`
- `src/components/meetings/meeting-recording-view.tsx`
- `app/(dashboard)/meetings/page.tsx`
- `app/(dashboard)/meetings/[id]/page.tsx`
- `app/api/meetings/[id]/send-to-agent/route.ts`
- `app/api/meetings/[id]/send-to-agent/route.test.ts`
- `src/lib/runner/tools/meetings/search.ts`
- `src/lib/runner/tools/meetings/index.ts`
- `src/lib/runner/tools/meetings/__tests__/search.test.ts`

### Modified
- `src/lib/transcription/groq-whisper.ts`
- `app/api/meetings/ingest/route.ts`
- `app/api/meetings/ingest/route.test.ts`
- `src/components/layout/app-sidebar.tsx`
- `src/lib/runner/tools/index.ts`
- `src/lib/runner/tool-registry.ts`
- `src/components/chat/chat-panel.tsx` (remove mic button)
- `src/types/database.ts` (regenerated)
