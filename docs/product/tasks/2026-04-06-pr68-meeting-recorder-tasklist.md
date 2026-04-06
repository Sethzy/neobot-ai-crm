# Meeting Recorder Implementation Plan

**PR:** PR 68: Meeting recorder — browser-native recording + Groq transcription + agent post-processing
**Decisions:** (Out-of-plan feature — no architecture decision IDs)
**Goal:** Users can record meetings directly in the Sunder web app, get an AI-generated transcript + summary, and have the agent suggest CRM-linked follow-up actions.

**Architecture:** Browser-native mic recording via `getUserMedia` → presigned URL upload to Supabase Storage → Groq Whisper Turbo batch transcription ($0.04/hr, 228x realtime) → durable state machine in `meeting_records` table → background-consumed agent run via `runMeetingFollowUp()` (same stream consumption pattern as `run-autopilot.ts`). Agent reads transcript via `read_file` tool (NOT from thread history), suggests CRM link via `ask_user_question`, posts summary + numbered follow-up actions.

**Tech Stack:** getUserMedia, MediaRecorder, Web Audio API (AnalyserNode), Groq Whisper API, Supabase Storage + RLS, Vercel Functions (maxDuration=300), AI SDK runAgent()

**Origin:** `docs/product/ideations/2026-04-06-meeting-recorder-requirements.md`
**Plan:** `docs/product/plans/2026-04-06-001-feat-meeting-recorder-plan.md`

---

## Relevant Files

### Create
- `supabase/migrations/20260406000000_create_meeting_records.sql`
- `src/lib/transcription/groq-whisper.ts`
- `src/lib/transcription/__tests__/groq-whisper.test.ts`
- `src/lib/runner/run-meeting-followup.ts`
- `src/lib/runner/__tests__/run-meeting-followup.test.ts`
- `src/lib/ai/meeting-prompt.ts`
- `src/lib/ai/__tests__/meeting-prompt.test.ts`
- `app/api/meetings/upload-url/route.ts`
- `app/api/meetings/ingest/route.ts`
- `src/hooks/use-audio-recorder.ts`
- `src/hooks/__tests__/use-audio-recorder.test.ts`
- `src/components/chat/recording-bar.tsx`
- `src/components/chat/meeting-notepad.tsx`
- `src/components/chat/upload-progress.tsx`

### Modify
- `src/components/chat/chat-composer.tsx` (add 🎙 record button)
- `src/components/chat/chat-panel.tsx` (recording state switching)
- `src/types/database.ts` (regenerate after migration)
- `.env.example` (add GROQ_API_KEY)

---

## Task 1: Database — meeting_records table

**Files:**
- Create: `supabase/migrations/20260406000000_create_meeting_records.sql`
- Modify: `src/types/database.ts` (regenerate)

**Step 1: Write the migration**

```sql
-- supabase/migrations/20260406000000_create_meeting_records.sql

create table public.meeting_records (
  meeting_record_id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  thread_id uuid not null,
  idempotency_key text not null,
  audio_path text not null,
  transcript_path text,
  duration_seconds integer,
  notes text,
  linked_contact_id uuid,
  linked_company_id uuid,
  linked_deal_id uuid,
  status text not null default 'uploaded',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint meeting_records_idempotency_key_client_id_unique
    unique (idempotency_key, client_id)
);

alter table public.meeting_records enable row level security;

create policy "Users can read own meeting records"
  on public.meeting_records for select
  using (client_id = public.get_my_client_id());

create policy "Users can insert own meeting records"
  on public.meeting_records for insert
  with check (client_id = public.get_my_client_id());

create policy "Users can update own meeting records"
  on public.meeting_records for update
  using (client_id = public.get_my_client_id())
  with check (client_id = public.get_my_client_id());
```

**Step 2: Apply the migration locally**

Run: `npx supabase db push`
Expected: Migration applies successfully, `meeting_records` table created.

**Step 3: Regenerate TypeScript types**

Run: `npx supabase gen types typescript --local > src/types/database.ts`
Expected: `database.ts` now includes `meeting_records` table type with all columns.

**Step 4: Verify types include meeting_records**

Open `src/types/database.ts` and confirm `meeting_records` appears with `meeting_record_id`, `idempotency_key`, `status`, etc.

**Step 5: Commit**

```bash
git add supabase/migrations/20260406000000_create_meeting_records.sql src/types/database.ts
git commit -m "feat(pr68): meeting_records table with RLS and idempotency"
```

---

## Task 2: Groq Whisper Integration

**Files:**
- Create: `src/lib/transcription/groq-whisper.ts`
- Create: `src/lib/transcription/__tests__/groq-whisper.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/transcription/__tests__/groq-whisper.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("transcribeAudio", () => {
  beforeEach(() => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
  });

  it("throws if GROQ_API_KEY is not set", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const { transcribeAudio } = await import("../groq-whisper");
    await expect(
      transcribeAudio({ audioUrl: "https://example.com/audio.webm" })
    ).rejects.toThrow("GROQ_API_KEY");
  });

  it("returns transcript text from Groq response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: "Hello, this is a test meeting." }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { transcribeAudio } = await import("../groq-whisper");
    const result = await transcribeAudio({
      audioUrl: "https://example.com/audio.webm",
    });

    expect(result.text).toBe("Hello, this is a test meeting.");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws on non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Rate limited"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { transcribeAudio } = await import("../groq-whisper");
    await expect(
      transcribeAudio({ audioUrl: "https://example.com/audio.webm" })
    ).rejects.toThrow("Groq transcription failed");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/transcription/__tests__/groq-whisper.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/lib/transcription/groq-whisper.ts
/**
 * Groq Whisper speech-to-text integration.
 * Uses Groq's OpenAI-compatible audio transcription API.
 * @module lib/transcription/groq-whisper
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";

export interface TranscribeAudioInput {
  /** Signed URL to the audio file — Groq fetches it directly. */
  audioUrl: string;
  /** Optional language hint (ISO 639-1). Defaults to auto-detect. */
  language?: string;
}

export interface TranscribeAudioResult {
  /** The transcribed text. */
  text: string;
}

/**
 * Transcribes audio using Groq's Whisper API.
 * Downloads the audio from the provided URL and sends it to Groq.
 * Groq does not support URL input directly — we fetch the audio
 * and send it as a file in a multipart form.
 */
export async function transcribeAudio({
  audioUrl,
  language,
}: TranscribeAudioInput): Promise<TranscribeAudioResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  // Fetch the audio file from storage
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
  }
  const audioBlob = await audioResponse.blob();

  // Build multipart form
  const formData = new FormData();
  formData.append("file", audioBlob, "recording.webm");
  formData.append("model", GROQ_MODEL);
  formData.append("response_format", "json");
  if (language) {
    formData.append("language", language);
  }

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Groq transcription failed (${response.status}): ${errorText}`
    );
  }

  const data = await response.json();
  return { text: data.text };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/transcription/__tests__/groq-whisper.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/lib/transcription/groq-whisper.ts src/lib/transcription/__tests__/groq-whisper.test.ts
git commit -m "feat(pr68): Groq Whisper transcription integration"
```

---

## Task 3: Presigned Upload URL Endpoint

**Files:**
- Create: `app/api/meetings/upload-url/route.ts`

**Step 1: Write the endpoint**

```typescript
// app/api/meetings/upload-url/route.ts
/**
 * Generates a presigned upload URL for meeting audio files.
 * Client uploads directly to Supabase Storage, then calls /api/meetings/ingest.
 * @module app/api/meetings/upload-url/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";

const BUCKET_ID = "agent-files";
const UPLOAD_URL_EXPIRY_SECONDS = 60 * 60; // 1 hour

const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-m4a",
]);

/** Max audio file size: 50 MB (covers ~90 min at 64kbps). */
const MAX_AUDIO_SIZE_BYTES = 50 * 1024 * 1024;

const requestSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().refine((ct) => ALLOWED_AUDIO_TYPES.has(ct), {
    message: "Unsupported audio format",
  }),
  durationSeconds: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        parsed.error.issues.map((i) => i.message).join(", "),
        400
      );
    }

    const { contentType } = parsed.data;
    const clientId = await resolveClientId(supabase, userId);
    const ext = contentType.split("/").pop() ?? "webm";
    const uuid = crypto.randomUUID();
    const storagePath = `${clientId}/meetings/raw/${uuid}.${ext}`;

    const { data, error } = await supabase.storage
      .from(BUCKET_ID)
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      return jsonError("Failed to generate upload URL", 500);
    }

    return Response.json({
      uploadUrl: data.signedUrl,
      storagePath,
      token: data.token,
    });
  } catch {
    return jsonError("Invalid request body", 400);
  }
}
```

**Step 2: Test manually with curl (after dev server is running)**

Run: `curl -X POST http://localhost:3000/api/meetings/upload-url -H "Content-Type: application/json" -H "Cookie: <your-auth-cookie>" -d '{"filename":"test.webm","contentType":"audio/webm"}'`
Expected: `{ "uploadUrl": "https://...", "storagePath": "...", "token": "..." }`

**Step 3: Commit**

```bash
git add app/api/meetings/upload-url/route.ts
git commit -m "feat(pr68): presigned upload URL endpoint for meeting audio"
```

---

## Task 4: Ingest Endpoint (Durable State Machine)

**Files:**
- Create: `app/api/meetings/ingest/route.ts`

**Step 1: Write the ingest endpoint**

```typescript
// app/api/meetings/ingest/route.ts
/**
 * Meeting ingest pipeline — durable state machine.
 * Creates meeting_records row first (idempotent), transcribes via Groq,
 * saves transcript, fires background agent run.
 * @module app/api/meetings/ingest/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { transcribeAudio } from "@/lib/transcription/groq-whisper";
import { runMeetingFollowUp } from "@/lib/runner/run-meeting-followup";

export const maxDuration = 300;

const BUCKET_ID = "agent-files";
const SIGNED_URL_EXPIRY = 60 * 60;

const ingestSchema = z.object({
  storagePath: z.string().min(1),
  durationSeconds: z.number().int().positive(),
  notes: z.string().optional().default(""),
  threadId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

export async function POST(request: Request) {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  try {
    const body = await request.json();
    const parsed = ingestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        parsed.error.issues.map((i) => i.message).join(", "),
        400
      );
    }

    const { storagePath, durationSeconds, notes, threadId, idempotencyKey } =
      parsed.data;
    const clientId = await resolveClientId(supabase, userId);

    // Step 1: Upsert meeting_records (idempotent)
    const { data: existingRecord } = await supabase
      .from("meeting_records")
      .select("meeting_record_id, status, transcript_path")
      .eq("idempotency_key", idempotencyKey)
      .eq("client_id", clientId)
      .maybeSingle();

    if (existingRecord && existingRecord.status !== "uploaded") {
      // Already processed — return existing record
      return Response.json({
        success: true,
        meetingRecordId: existingRecord.meeting_record_id,
        transcriptPath: existingRecord.transcript_path,
        deduplicated: true,
      });
    }

    let meetingRecordId: string;

    if (existingRecord) {
      meetingRecordId = existingRecord.meeting_record_id;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("meeting_records")
        .insert({
          client_id: clientId,
          thread_id: threadId,
          idempotency_key: idempotencyKey,
          audio_path: storagePath,
          duration_seconds: durationSeconds,
          notes: notes || null,
          status: "uploaded",
        })
        .select("meeting_record_id")
        .single();

      if (insertError || !inserted) {
        return jsonError("Failed to create meeting record", 500);
      }
      meetingRecordId = inserted.meeting_record_id;
    }

    // Step 2: Update status → transcribing
    await supabase
      .from("meeting_records")
      .update({ status: "transcribing", updated_at: new Date().toISOString() })
      .eq("meeting_record_id", meetingRecordId);

    // Step 3: Get signed URL for the audio file
    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from(BUCKET_ID)
        .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      return jsonError("Failed to access audio file", 500);
    }

    // Step 4: Transcribe via Groq Whisper
    const transcription = await transcribeAudio({
      audioUrl: signedUrlData.signedUrl,
    });

    // Step 5: Save transcript to storage
    const dateStr = new Date().toISOString().split("T")[0];
    const slug = `meeting-${meetingRecordId.slice(0, 8)}`;
    const transcriptPath = `${clientId}/meetings/${dateStr}-${slug}.md`;
    const durationMin = Math.round(durationSeconds / 60);

    const transcriptContent = [
      `# Meeting Recording — ${dateStr}`,
      `**Duration:** ${durationMin} minutes`,
      notes ? `\n## User Notes\n${notes}` : "",
      `\n## Transcript\n${transcription.text}`,
    ]
      .filter(Boolean)
      .join("\n");

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_ID)
      .upload(transcriptPath, transcriptContent, {
        contentType: "text/markdown",
        upsert: true,
      });

    if (uploadError) {
      return jsonError("Failed to save transcript", 500);
    }

    // Step 6: Update status → transcribed
    await supabase
      .from("meeting_records")
      .update({
        status: "transcribed",
        transcript_path: transcriptPath,
        updated_at: new Date().toISOString(),
      })
      .eq("meeting_record_id", meetingRecordId);

    // Step 7: Create compact thread event message
    const noteCount = notes
      ? notes.split("\n").filter((l) => l.trim()).length
      : 0;
    const eventText = `[Meeting recorded: ${durationMin} min${noteCount > 0 ? `, ${noteCount} notes` : ""}]`;

    await supabase.from("conversation_messages").insert({
      thread_id: threadId,
      role: "user",
      content: eventText,
      parts: JSON.stringify([{ type: "text", text: eventText }]),
    });

    // Step 8: Fire background agent run
    runMeetingFollowUp({
      clientId,
      threadId,
      meetingRecordId,
      transcriptPath,
      notes: notes || "",
      durationMinutes: durationMin,
      supabase,
    }).catch((err) => {
      console.error("[meeting-ingest] Follow-up run failed:", err);
    });

    return Response.json({
      success: true,
      meetingRecordId,
      transcriptPath,
    });
  } catch (err) {
    console.error("[meeting-ingest] Error:", err);
    return jsonError("Meeting ingest failed", 500);
  }
}
```

**Step 2: Commit**

```bash
git add app/api/meetings/ingest/route.ts
git commit -m "feat(pr68): meeting ingest endpoint — durable state machine with Groq transcription"
```

---

## Task 5: Background Agent Runner for Meetings

**Files:**
- Create: `src/lib/runner/run-meeting-followup.ts`
- Create: `src/lib/runner/__tests__/run-meeting-followup.test.ts`
- Create: `src/lib/ai/meeting-prompt.ts`

**Step 1: Write the meeting prompt instructions**

```typescript
// src/lib/ai/meeting-prompt.ts
/**
 * Meeting-specific agent instructions for post-meeting processing.
 * @module lib/ai/meeting-prompt
 */

export interface MeetingPromptInput {
  transcriptPath: string;
  notes: string;
  durationMinutes: number;
}

export function buildMeetingInstructions({
  transcriptPath,
  notes,
  durationMinutes,
}: MeetingPromptInput): string {
  return `You just received a ${durationMinutes}-minute meeting recording that has been transcribed.

## Your Task

1. **Read the transcript** by calling read_file with path "${transcriptPath}".

2. **Identify who the meeting was with.** Search the CRM for people, companies, or deals mentioned in the transcript. Use crm_search to find matches.

3. **Ask the user to confirm the CRM link.** Use ask_user_question with a single_select:
   - If you found a match: "This sounds like a call with [Name] — [Deal/Company]. Link to their record?"
     Options: "Confirm", "Change", "Save unlinked"
   - If no match found: Ask "Who was this call with?" as a free-text question.
   - If user says a name not in CRM, offer to create a new contact.

4. **Write a meeting summary** using write_file. Save to the person's memory folder (e.g., memory/meetings/YYYY-MM-DD-name.md). The summary should include:
   - Key discussion points as bullet points
   - Action items identified
   - Personal details mentioned (rapport builders)
   - Any decisions made

5. **Suggest follow-up actions** as a numbered list. Ask the user which ones to do:
   - Create tasks for action items (include suggested due dates)
   - Update deal stage (if a stage change was discussed)
   - Draft a follow-up email
   - Save personal notes to the person's record

   Ask: "Which of these should I do? (e.g., 'do 1 and 3', 'all', 'skip')"

6. **Execute only the actions the user selects** using existing CRM tools.

## Important Rules

- The user's typed notes take priority over the transcript. If notes say "THURSDAY not friday", trust the notes.
- Do NOT create tasks or update the CRM until the user confirms which actions to take.
- Keep the summary concise — bullet points, not paragraphs.
- The transcript is in the file at ${transcriptPath} — read it with read_file, do not expect it in the conversation.
${notes ? `\n## User Notes (typed during the meeting — these are authoritative)\n${notes}` : ""}`;
}
```

**Step 2: Write the run-meeting-followup wrapper**

```typescript
// src/lib/runner/run-meeting-followup.ts
/**
 * Background-consumed agent runner for post-meeting processing.
 * Follows the exact pattern from run-autopilot.ts: call runAgent(),
 * then consumeStream to block until onFinish/finalizeRun completes.
 * @module lib/runner/run-meeting-followup
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildMeetingInstructions } from "@/lib/ai/meeting-prompt";
import { runAgent } from "@/lib/runner/run-agent";
import type { Database } from "@/types/database";

type ChatSupabaseClient = SupabaseClient<Database>;

export interface RunMeetingFollowUpInput {
  clientId: string;
  threadId: string;
  meetingRecordId: string;
  transcriptPath: string;
  notes: string;
  durationMinutes: number;
  supabase: ChatSupabaseClient;
}

export type RunMeetingFollowUpResult =
  | { status: "completed" }
  | { status: "skipped_busy" }
  | { status: "failed"; error: string };

/**
 * Fires an agent run to process a meeting transcript.
 * Consumes the stream to completion (blocks until onFinish/finalizeRun).
 * Never throws — returns { status: "failed" } on error.
 */
export async function runMeetingFollowUp({
  clientId,
  threadId,
  meetingRecordId,
  transcriptPath,
  notes,
  durationMinutes,
  supabase,
}: RunMeetingFollowUpInput): Promise<RunMeetingFollowUpResult> {
  try {
    const instructions = buildMeetingInstructions({
      transcriptPath,
      notes,
      durationMinutes,
    });

    const result = await runAgent(
      {
        clientId,
        threadId,
        input: "",
        triggerType: "pulse",
        channel: "web",
        consumeMessageQuota: false,
        instructions,
      },
      supabase
    );

    if (result.status === "streaming") {
      let streamError: unknown = null;
      await result.streamResult.consumeStream({
        onError: (error: unknown) => {
          streamError = error;
        },
      });

      if (streamError) {
        const message =
          streamError instanceof Error
            ? streamError.message
            : "Stream consumption failed";
        return { status: "failed", error: message };
      }

      return { status: "completed" };
    }

    return { status: "skipped_busy" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown meeting follow-up error";
    return { status: "failed", error: message };
  }
}
```

**Step 3: Write the test for run-meeting-followup**

```typescript
// src/lib/runner/__tests__/run-meeting-followup.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: vi.fn(),
}));

vi.mock("@/lib/ai/meeting-prompt", () => ({
  buildMeetingInstructions: vi.fn().mockReturnValue("mock instructions"),
}));

describe("runMeetingFollowUp", () => {
  it("returns completed after consuming the stream", async () => {
    const { runAgent } = await import("@/lib/runner/run-agent");
    const { runMeetingFollowUp } = await import("../run-meeting-followup");

    (runAgent as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "streaming",
      streamResult: {
        consumeStream: vi.fn().mockResolvedValue(undefined),
      },
    });

    const result = await runMeetingFollowUp({
      clientId: "test-client",
      threadId: "test-thread",
      meetingRecordId: "test-meeting",
      transcriptPath: "test/path.md",
      notes: "",
      durationMinutes: 45,
      supabase: {} as any,
    });

    expect(result).toEqual({ status: "completed" });
  });

  it("returns failed on stream error", async () => {
    const { runAgent } = await import("@/lib/runner/run-agent");
    const { runMeetingFollowUp } = await import("../run-meeting-followup");

    (runAgent as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "streaming",
      streamResult: {
        consumeStream: vi.fn().mockImplementation(async ({ onError }) => {
          onError(new Error("Stream died"));
        }),
      },
    });

    const result = await runMeetingFollowUp({
      clientId: "test-client",
      threadId: "test-thread",
      meetingRecordId: "test-meeting",
      transcriptPath: "test/path.md",
      notes: "",
      durationMinutes: 45,
      supabase: {} as any,
    });

    expect(result).toEqual({ status: "failed", error: "Stream died" });
  });

  it("returns skipped_busy when thread is busy", async () => {
    const { runAgent } = await import("@/lib/runner/run-agent");
    const { runMeetingFollowUp } = await import("../run-meeting-followup");

    (runAgent as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "queued",
    });

    const result = await runMeetingFollowUp({
      clientId: "test-client",
      threadId: "test-thread",
      meetingRecordId: "test-meeting",
      transcriptPath: "test/path.md",
      notes: "",
      durationMinutes: 45,
      supabase: {} as any,
    });

    expect(result).toEqual({ status: "skipped_busy" });
  });
});
```

**Step 4: Run tests**

Run: `npx vitest run src/lib/runner/__tests__/run-meeting-followup.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/lib/ai/meeting-prompt.ts src/lib/runner/run-meeting-followup.ts src/lib/runner/__tests__/run-meeting-followup.test.ts
git commit -m "feat(pr68): meeting follow-up runner + agent prompt instructions"
```

---

## Task 6: Audio Recorder Hook

**Files:**
- Create: `src/hooks/use-audio-recorder.ts`
- Create: `src/hooks/__tests__/use-audio-recorder.test.ts`

**Step 1: Write the hook**

```typescript
// src/hooks/use-audio-recorder.ts
/**
 * Browser audio recording hook using getUserMedia + MediaRecorder.
 * Manages the full lifecycle: idle → recording → paused → uploading.
 * @module hooks/use-audio-recorder
 */
"use client";

import { useCallback, useRef, useState } from "react";

export type RecorderState = "idle" | "recording" | "paused" | "uploading";

export interface UseAudioRecorderReturn {
  state: RecorderState;
  elapsedSeconds: number;
  error: string | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<Blob | null>;
}

function getPreferredMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedElapsedRef = useRef<number>(0);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const now = Date.now();
      const current =
        pausedElapsedRef.current +
        Math.floor((now - startTimeRef.current) / 1000);
      setElapsedSeconds(current);
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
      setError(null);
      chunksRef.current = [];
      pausedElapsedRef.current = 0;
      setElapsedSeconds(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getPreferredMimeType();
      if (!mimeType) {
        throw new Error("No supported audio format found in this browser");
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(5000); // 5-second chunks
      setState("recording");
      startTimer();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start recording";
      setError(message);
      setState("idle");
    }
  }, [startTimer]);

  const pause = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      stopTimer();
      pausedElapsedRef.current = elapsedSeconds;
      setState("paused");
    }
  }, [elapsedSeconds, stopTimer]);

  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      startTimer();
      setState("recording");
    }
  }, [startTimer]);

  const stop = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        stopTimer();
        streamRef.current?.getTracks().forEach((t) => t.stop());

        const mimeType = recorder.mimeType;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        setState("idle");
        resolve(blob);
      };

      recorder.stop();
    });
  }, [stopTimer]);

  return { state, elapsedSeconds, error, start, pause, resume, stop };
}
```

**Step 2: Write a basic test**

```typescript
// src/hooks/__tests__/use-audio-recorder.test.ts
import { describe, it, expect } from "vitest";

describe("useAudioRecorder", () => {
  it("exports the hook", async () => {
    const mod = await import("../use-audio-recorder");
    expect(typeof mod.useAudioRecorder).toBe("function");
  });
});
```

**Step 3: Run test**

Run: `npx vitest run src/hooks/__tests__/use-audio-recorder.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/hooks/use-audio-recorder.ts src/hooks/__tests__/use-audio-recorder.test.ts
git commit -m "feat(pr68): useAudioRecorder hook — getUserMedia + MediaRecorder lifecycle"
```

---

## Task 7: Recording Bar + Notepad + Upload Progress Components

**Files:**
- Create: `src/components/chat/recording-bar.tsx`
- Create: `src/components/chat/meeting-notepad.tsx`
- Create: `src/components/chat/upload-progress.tsx`

**Step 1: Build the recording bar**

```typescript
// src/components/chat/recording-bar.tsx
/**
 * Recording controls bar — red dot, timer, waveform, pause/stop.
 * Renders at the top of the thread area during recording.
 * @module components/chat/recording-bar
 */
"use client";

import type { RecorderState } from "@/hooks/use-audio-recorder";
import { Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RecordingBarProps {
  state: RecorderState;
  elapsedSeconds: number;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function RecordingBar({
  state,
  elapsedSeconds,
  onPause,
  onResume,
  onStop,
}: RecordingBarProps) {
  const isPaused = state === "paused";

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b bg-surface-secondary">
      <span className={`h-3 w-3 rounded-full ${isPaused ? "bg-muted" : "bg-red-500 animate-pulse"}`} />

      <span className="font-mono text-sm tabular-nums">
        {formatTime(elapsedSeconds)}
      </span>

      <span className="text-xs text-muted-foreground">
        {isPaused ? "Paused" : "Recording"}
      </span>

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="icon"
        onClick={isPaused ? onResume : onPause}
        aria-label={isPaused ? "Resume recording" : "Pause recording"}
      >
        {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      </Button>

      <Button
        variant="destructive"
        size="sm"
        onClick={onStop}
        aria-label="Stop recording"
      >
        <Square className="h-3 w-3 mr-1" />
        Stop
      </Button>
    </div>
  );
}
```

**Step 2: Build the meeting notepad**

```typescript
// src/components/chat/meeting-notepad.tsx
/**
 * Plain text notepad that replaces the thread message list during recording.
 * User types freeform notes — bundled with audio on upload.
 * @module components/chat/meeting-notepad
 */
"use client";

import { useCallback } from "react";

interface MeetingNotepadProps {
  value: string;
  onChange: (value: string) => void;
  isMobile?: boolean;
}

export function MeetingNotepad({
  value,
  onChange,
  isMobile,
}: MeetingNotepadProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  return (
    <div className="flex flex-1 flex-col px-4 py-3">
      <textarea
        className="flex-1 resize-none bg-transparent text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none"
        placeholder="Type notes during your meeting..."
        value={value}
        onChange={handleChange}
        autoFocus
      />
      {isMobile && (
        <p className="mt-2 text-xs text-muted-foreground">
          Best for in-person conversations (AI only hears your microphone).
        </p>
      )}
    </div>
  );
}
```

**Step 3: Build the upload progress component**

```typescript
// src/components/chat/upload-progress.tsx
/**
 * Inline progress card shown in the thread after recording stops.
 * Transitions: uploading → transcribing → done.
 * @module components/chat/upload-progress
 */
"use client";

import { Loader2, Check } from "lucide-react";

export type UploadPhase = "uploading" | "transcribing" | "done" | "error";

interface UploadProgressProps {
  phase: UploadPhase;
  progress?: number;
  durationMinutes?: number;
  noteCount?: number;
  error?: string;
}

export function UploadProgress({
  phase,
  progress,
  durationMinutes,
  noteCount,
  error,
}: UploadProgressProps) {
  if (phase === "error") {
    return (
      <div className="my-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <p className="text-destructive">Upload failed: {error}</p>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border bg-surface-secondary p-3 text-sm">
      <div className="flex items-center gap-2">
        {phase === "done" ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}

        <span>
          {phase === "uploading" && `Uploading recording... ${progress ? `${progress}%` : ""}`}
          {phase === "transcribing" && "Transcribing..."}
          {phase === "done" && "Uploaded · Transcribing..."}
        </span>
      </div>

      {durationMinutes && (
        <p className="mt-1 text-xs text-muted-foreground">
          {durationMinutes} min recording
          {noteCount && noteCount > 0 ? ` · ${noteCount} notes` : ""}
        </p>
      )}
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add src/components/chat/recording-bar.tsx src/components/chat/meeting-notepad.tsx src/components/chat/upload-progress.tsx
git commit -m "feat(pr68): recording bar, meeting notepad, and upload progress components"
```

---

## Task 8: Chat Panel Integration

**Files:**
- Modify: `src/components/chat/chat-composer.tsx`
- Modify: `src/components/chat/chat-panel.tsx`

This is the wiring task — connect the recording hook and components into the existing chat UI. This task requires careful reading of the existing `chat-panel.tsx` and `chat-composer.tsx` to understand the current structure before modifying.

**Step 1: Read the existing files**

Read `src/components/chat/chat-panel.tsx` and `src/components/chat/chat-composer.tsx` fully to understand:
- Where the message list renders
- Where the composer renders
- How state is managed (useChat, etc.)
- Where to add the recording state toggle

**Step 2: Add mic button to chat-composer.tsx**

Add a 🎙 button next to the existing 📎 attachment button. The button calls an `onStartRecording` callback passed as a prop.

Look for the attachment button in `chat-composer.tsx` and add a sibling button:

```tsx
<Button
  variant="ghost"
  size="icon"
  onClick={onStartRecording}
  aria-label="Record meeting"
  className="shrink-0"
>
  <Mic className="h-4 w-4" />
</Button>
```

Import `Mic` from `lucide-react`.

**Step 3: Add recording state to chat-panel.tsx**

Add recording state management:

```tsx
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { RecordingBar } from "@/components/chat/recording-bar";
import { MeetingNotepad } from "@/components/chat/meeting-notepad";
import { UploadProgress, type UploadPhase } from "@/components/chat/upload-progress";

// Inside the component:
const recorder = useAudioRecorder();
const [meetingNotes, setMeetingNotes] = useState("");
const [uploadPhase, setUploadPhase] = useState<UploadPhase | null>(null);
const isRecording = recorder.state === "recording" || recorder.state === "paused";
```

**Step 4: Add conditional rendering**

When `isRecording`, replace the message list and composer with recording bar + notepad:

```tsx
{isRecording ? (
  <>
    <RecordingBar
      state={recorder.state}
      elapsedSeconds={recorder.elapsedSeconds}
      onPause={recorder.pause}
      onResume={recorder.resume}
      onStop={handleStopRecording}
    />
    <MeetingNotepad
      value={meetingNotes}
      onChange={setMeetingNotes}
      isMobile={/* detect mobile */}
    />
  </>
) : (
  <>
    {/* existing message list */}
    {uploadPhase && (
      <UploadProgress
        phase={uploadPhase}
        durationMinutes={Math.round(recorder.elapsedSeconds / 60)}
        noteCount={meetingNotes.split("\n").filter(l => l.trim()).length}
      />
    )}
    {/* existing composer with onStartRecording prop */}
  </>
)}
```

**Step 5: Implement handleStopRecording**

```tsx
const handleStopRecording = useCallback(async () => {
  const blob = await recorder.stop();
  if (!blob) return;

  setUploadPhase("uploading");
  setMeetingNotes("");

  try {
    // 1. Get presigned URL
    const urlRes = await fetch("/api/meetings/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "recording.webm",
        contentType: blob.type || "audio/webm",
      }),
    });
    const { uploadUrl, storagePath, token } = await urlRes.json();

    // 2. Upload audio directly to Supabase Storage
    await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": blob.type || "audio/webm" },
      body: blob,
    });

    setUploadPhase("transcribing");

    // 3. Trigger ingest pipeline
    const idempotencyKey = crypto.randomUUID();
    await fetch("/api/meetings/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storagePath,
        durationSeconds: recorder.elapsedSeconds,
        notes: meetingNotes,
        threadId, // from chat panel props/context
        idempotencyKey,
      }),
    });

    setUploadPhase("done");
    // Agent run was fired by ingest — it will post messages to the thread
    // which will appear via the existing streaming/polling mechanism.
    setTimeout(() => setUploadPhase(null), 3000);
  } catch (err) {
    setUploadPhase("error");
  }
}, [recorder, meetingNotes, threadId]);
```

**Step 6: Test manually**

1. Start dev server: `npm run dev`
2. Open chat thread
3. Click 🎙 button → should see recording bar + notepad
4. Type some notes → verify notepad works
5. Click Stop → should see upload progress → transcribing → agent responds
6. Test on mobile viewport → should see "in-person conversations" note

**Step 7: Commit**

```bash
git add src/components/chat/chat-composer.tsx src/components/chat/chat-panel.tsx
git commit -m "feat(pr68): chat panel integration — record button, state switching, upload flow"
```

---

## Task 9: Environment + Cleanup

**Files:**
- Modify: `.env.example`

**Step 1: Add GROQ_API_KEY to .env.example**

```bash
# Add to .env.example:
# Groq - Speech-to-text (Whisper)
GROQ_API_KEY=
```

**Step 2: Final integration test**

1. Record a ~1 minute test meeting (talk to yourself or play audio)
2. Type notes during recording
3. Stop → verify upload succeeds
4. Verify agent posts CRM link suggestion
5. Confirm the link
6. Verify summary includes your typed notes
7. Test the numbered follow-up actions flow
8. Test on mobile Safari (mic-only + in-person warning)

**Step 3: Commit**

```bash
git add .env.example
git commit -m "feat(pr68): add GROQ_API_KEY to env example"
```

---

## Completion Checklist

- [ ] Task 1: meeting_records migration applied
- [ ] Task 2: Groq Whisper integration tested
- [ ] Task 3: Presigned upload URL endpoint working
- [ ] Task 4: Ingest endpoint with durable state machine
- [ ] Task 5: Background agent runner + meeting prompt
- [ ] Task 6: useAudioRecorder hook
- [ ] Task 7: Recording bar + notepad + upload progress components
- [ ] Task 8: Chat panel integration (record button, state switching, upload)
- [ ] Task 9: Environment + final integration test
