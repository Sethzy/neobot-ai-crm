---
title: "feat: Meeting Recorder — Browser-Native Recording with Agent Post-Processing"
type: feat
status: active
date: 2026-04-06
origin: docs/product/ideations/2026-04-06-meeting-recorder-requirements.md
---

# feat: Meeting Recorder — Browser-Native Recording with Agent Post-Processing

## Overview

Add a meeting recorder to Sunder's web app. User clicks Record in the chat thread, the thread area becomes a notepad for jotting notes while mic captures audio, and when they stop the agent transcribes the recording, suggests a CRM link, posts a merged summary, and offers a checklist of follow-up actions. No extension, no desktop app, no install — pure browser APIs.

This is the feature that makes Sunder indispensable for advisory sales professionals. Every meeting compounds the agent's memory. Every call makes the CRM more accurate without the user touching it.

## Problem Statement

Advisory sales users are on calls all day. After each call they manually update CRM records, create follow-up tasks, and draft emails. This is tedious, error-prone, and the first thing dropped when busy. Meeting context gets lost.

Users can already paste transcripts into chat and the agent processes them. But that requires recording separately, then copy-pasting. The gap is a zero-friction way to record directly in Sunder so the agent pipeline fires automatically. (see origin: `docs/product/ideations/2026-04-06-meeting-recorder-requirements.md`)

## Proposed Solution

Mic-only recording via `getUserMedia` — matching Notion's browser behavior. Recording controls and a notepad replace the chat thread during recording. After stop, audio uploads to Supabase Storage, gets transcribed by Groq Whisper Turbo ($0.04/hr, 228x realtime), and an agent run processes the transcript + user notes to suggest CRM links and follow-up actions.

**Key decisions carried forward from origin:**
- Mic-only for v1 (no getDisplayMedia tab capture — UX too unfamiliar)
- Groq Whisper Turbo batch transcription (near-free, insanely fast)
- Agent suggests CRM link, user confirms (never auto-links)
- Summary + suggested actions checklist (not auto-execute)
- Notepad during recording (user notes merged with transcript, treated as authoritative)
- Mobile = "Best for in-person conversations" (same positioning as Notion)
- Desktop app path = white-label Meetily later if needed, not build from scratch

## Technical Approach

### Architecture

```
┌───────────────────────────────────────────────┐
│  CLIENT (Browser)                             │
│                                               │
│  getUserMedia({ audio: true })                │
│    → MediaRecorder (audio/webm or audio/mp4)  │
│    → Blob chunks accumulated in memory        │
│    → On stop: combine → upload via presigned  │
│      URL directly to Supabase Storage         │
│    → POST /api/meetings/ingest with metadata  │
│      (storage path, duration, notes text,     │
│       client-generated idempotency key)       │
└──────────────────┬────────────────────────────┘
                   │
                   ▼
┌───────────────────────────────────────────────┐
│  API: POST /api/meetings/ingest               │
│  (Durable state machine — idempotent)         │
│                                               │
│  1. Validate request (auth, metadata schema)  │
│  2. Upsert meeting_records row with status    │
│     'uploaded' using idempotency_key          │
│     (dedup: if already exists, return early)  │
│  3. Update status → 'transcribing'           │
│  4. Call Groq Whisper API (batch)             │
│     - Pass Supabase Storage signed URL        │
│       directly to Groq (no download/reupload) │
│     - ~15 seconds for 60 min of audio         │
│     - export const maxDuration = 300          │
│  5. Save transcript to Supabase Storage       │
│     /{clientId}/meetings/{date}-{slug}.md     │
│  6. Update status → 'transcribed'            │
│  7. Create a compact thread event message:    │
│     "[Meeting recorded: 45 min, 3 notes]"     │
│     (NOT the full transcript — just a pointer │
│      to meeting_record_id + transcript path)  │
│  8. Fire background agent run via             │
│     runMeetingFollowUp() — consumes stream    │
│     to completion like run-autopilot.ts       │
└──────────────────┬────────────────────────────┘
                   │
                   ▼
┌───────────────────────────────────────────────┐
│  AGENT RUN (background-consumed)              │
│                                               │
│  runMeetingFollowUp() — thin wrapper around   │
│  runAgent() that consumes the stream to       │
│  completion (same pattern as run-autopilot.ts │
│  lines 51-78: consumeStream + onError)        │
│                                               │
│  Meeting-specific instructions injected via   │
│  `instructions` param. Agent reads transcript │
│  via read_file tool, NOT from thread history. │
│                                               │
│  Uses existing tools:                         │
│    → read_file (load transcript from storage) │
│    → crm_search, crm_update, crm_create      │
│    → write_file (save summary to memory)      │
│    → ask_user_question (confirm CRM link)     │
│    → create_interaction (log the meeting)     │
└───────────────────────────────────────────────┘
```

### Why This Architecture

- **Presigned URL upload** — Vercel functions have a ~4.5MB body limit. Audio files are 10-40MB. Upload directly to Supabase Storage via presigned URL, then notify the API with just the metadata. This follows the pattern used by `app/api/crm/attachments/upload/route.ts`. (see origin for file size estimates: ~14MB/30min, ~29MB/60min)
- **Groq URL input, not download/reupload** — Pass Supabase Storage signed URL directly to Groq's speech-to-text API instead of downloading and re-uploading the audio through the Vercel function. Reduces memory pressure and latency. Set `export const maxDuration = 300` per [Vercel docs](https://vercel.com/docs/functions/configuring-functions/duration).
- **Durable state machine** — meeting_records row created FIRST with `uploaded` status and an idempotency_key (client-generated UUID). Pipeline updates status through `transcribing` → `transcribed` → `linked` → `complete`. Retries are safe — same idempotency_key returns existing record. Prevents duplicate transcriptions, duplicate messages, and duplicate agent runs.
- **Compact thread event, not raw transcript** — The full transcript is NOT stored as a chat message. Instead, a compact event message is created: `"[Meeting recorded: 45 min, 3 notes — meeting_record_id: {id}]"`. This avoids bloating thread history with long transcripts that would tax every future agent run on that thread. The agent reads the transcript via `read_file` tool when it needs it.
- **Background-consumed agent run** — The post-meeting agent run uses a `runMeetingFollowUp()` helper that follows the exact pattern from `run-autopilot.ts:51-78`: call `runAgent()`, then `consumeStream({ onError })` to block until the full stream (including `onFinish` / `finalizeRun`) completes. This prevents the failure mode where the ingest route returns success but the agent run never finalizes.
- **Agent reads transcript via tool, not thread history** — Meeting-specific instructions tell the agent to `read_file` the transcript path. This keeps the transcript out of the default conversation context and only loads it when the agent explicitly needs it.

### Implementation Phases

#### Phase 1: Upload + Transcription Pipeline (Backend)

Build the server-side pipeline first so it can be tested independently.

**1a. Presigned upload endpoint**

New API route: `app/api/meetings/upload-url/route.ts`
- Accepts: `{ filename, contentType, durationSeconds }`
- Validates: auth, content type is audio (webm/mp4/ogg/mpeg/wav)
- Generates presigned upload URL to `{clientId}/meetings/raw/{uuid}.{ext}`
- Returns: `{ uploadUrl, storagePath }`
- Pattern: follow `app/api/files/upload/route.ts` auth + validation pattern

**1b. Ingest endpoint (durable state machine)**

New API route: `app/api/meetings/ingest/route.ts`
- Accepts: `{ storagePath, durationSeconds, notes, threadId, idempotencyKey }`
- `export const maxDuration = 300` (Vercel extended timeout)
- Validates: auth, storagePath, idempotencyKey
- Pipeline:
  1. Upsert `meeting_records` row with `idempotency_key` and status `uploaded`. If row already exists with same key, return the existing record (dedup).
  2. Update status → `transcribing`
  3. Generate signed URL for the audio file in Supabase Storage
  4. Pass signed URL to Groq Whisper API (`whisper-large-v3-turbo`) — Groq fetches the audio directly, no download through the function
  5. Save transcript markdown to `{clientId}/meetings/{date}-{slug}.md`
  6. Update status → `transcribed`, set `transcript_path`
  7. Create compact thread event message: `"[Meeting recorded: {duration} min, {noteCount} notes]"` — NOT the full transcript
  8. Call `runMeetingFollowUp()` (see 1e) to fire background agent run
  9. Update status → `processing_complete`
- Returns: `{ success, meetingRecordId, transcriptPath }`
- On error at any step: status stays at last successful state, safe to retry

**1c. Database: meeting_records table**

```sql
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

-- RLS: tenant isolation (matches repo convention — public.get_my_client_id())
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

Status lifecycle: `uploaded` → `transcribing` → `transcribed` → `linked` → `complete`

Notes on schema:
- Uses `meeting_record_id` (not `id`) per repo convention (`contact_id`, `company_id`, `deal_id`)
- Uses `public.get_my_client_id()` for RLS per repo convention (not `active_client_id()`)
- `linked_contact_id`, `linked_company_id`, `linked_deal_id` are nullable FKs (not references — soft links for v1, agent updates them after user confirms)
- `idempotency_key` + `client_id` unique constraint prevents duplicate processing on retry

**1d. Groq Whisper integration**

New utility: `src/lib/transcription/groq-whisper.ts`
- Wraps Groq's audio transcription API
- Input: signed URL to audio file (Groq fetches directly — no download through our function)
- Output: `{ text: string, segments?: Array<{ start, end, text }> }`
- Uses Groq's `url` input parameter per [Groq docs](https://console.groq.com/docs/speech-to-text)
- Handles error cases: file too large, unsupported format, rate limit
- Fallback: AssemblyAI batch API if Groq fails (noted in origin doc)

**1e. Background agent runner for meetings**

New utility: `src/lib/runner/run-meeting-followup.ts`
- Thin wrapper around `runAgent()` following the exact pattern from `run-autopilot.ts:35-92`
- Calls `runAgent()` with `triggerType: "pulse"`, `instructions: meetingInstructions`
- Consumes the returned stream to completion via `consumeStream({ onError })` — blocks until `onFinish` / `finalizeRun` completes
- This prevents the failure mode where the ingest route returns success but the agent run never persists its output
- Returns: `{ status: "completed" } | { status: "failed", error: string }`

**Acceptance criteria:**
- [ ] Presigned URL endpoint generates valid upload URLs for audio MIME types
- [ ] Audio file uploads to Supabase Storage via presigned URL
- [ ] Ingest endpoint creates meeting_records row FIRST, then transcribes (idempotent on retry)
- [ ] Groq receives signed URL directly (no download through Vercel function)
- [ ] Transcript saved to Supabase Storage, NOT as chat message content
- [ ] Compact thread event message created (not full transcript)
- [ ] Agent run fires via runMeetingFollowUp() and stream is consumed to completion
- [ ] Duplicate ingest calls with same idempotencyKey return existing record
- [ ] meeting_records status lifecycle tracks correctly through all states
- [ ] End-to-end: upload audio file → agent posts summary in thread within 2 minutes

#### Phase 2: Recording UI (Client-Side)

Build the browser recording experience.

**2a. Audio recorder hook**

New hook: `src/hooks/use-audio-recorder.ts`
- Manages `getUserMedia` → `MediaRecorder` lifecycle
- States: `idle` | `recording` | `paused` | `uploading`
- Handles:
  - MIME type detection via `MediaRecorder.isTypeSupported()` (prefer `audio/webm;codecs=opus`, fall back to `audio/mp4`)
  - Start/pause/resume/stop controls
  - Accumulate chunks in memory via `ondataavailable`
  - Combine chunks into single Blob on stop
  - Upload flow: get presigned URL → PUT blob → POST ingest metadata
  - Elapsed time tracking
  - Waveform data via `AnalyserNode` for visual feedback
- Returns: `{ state, elapsedSeconds, waveformData, start, pause, resume, stop, error }`

**2b. Recording bar component**

New component: `src/components/chat/recording-bar.tsx`
- Renders at top of thread area during recording
- Shows: red dot, elapsed timer (`MM:SS`), live waveform visualization, pause button, stop button
- Waveform: simple canvas or SVG bar visualization from `AnalyserNode` frequency data
- Pause toggles to resume icon
- Stop triggers upload flow

**2c. Meeting notepad component**

New component: `src/components/chat/meeting-notepad.tsx`
- Plain `<textarea>` that replaces the message list during recording
- Placeholder: "Type notes during your meeting..."
- Auto-grows with content
- Enter = new line (NOT submit)
- Notes stored in local React state
- On stop: notes text passed to upload flow

**2d. Chat panel integration**

Modify: `src/components/chat/chat-panel.tsx`
- Add 🎙 button to chat composer (next to 📎 attach button)
- When `isRecording`:
  - Hide message list
  - Show `<RecordingBar />` pinned to top
  - Show `<MeetingNotepad />` in the thread area
  - Hide normal input bar
- When recording stops:
  - Restore message list
  - Show upload progress as inline system message
  - Restore normal input bar

**2e. Upload progress component**

New component: `src/components/chat/upload-progress.tsx`
- Inline card in the thread showing: upload progress bar, "Uploading recording... X%", "Transcribing...", "✓ Uploaded · Transcribing... 45 min recording · 3 notes"
- Transitions through states: uploading → transcribing → done (agent takes over)

**2f. Mobile adaptations**

- Same components, responsive layout
- On mobile browsers: show note at bottom of notepad: "Best for in-person conversations (AI only hears your microphone)"
- Detect mobile via viewport width or user agent

**Acceptance criteria:**
- [ ] 🎙 button visible in chat composer on desktop and mobile
- [ ] Clicking Record starts mic capture, thread transforms to notepad + recording bar
- [ ] Waveform visualization provides visual feedback that mic is active
- [ ] Pause/resume works correctly
- [ ] User can type notes in the notepad during recording
- [ ] Stop combines audio chunks, uploads via presigned URL, shows progress
- [ ] Thread restores to normal chat after upload completes
- [ ] Mobile shows "in-person conversations" note
- [ ] Works on Chrome, Edge, Firefox (desktop), Safari + Chrome (mobile)

#### Phase 3: Agent Post-Processing (Prompt Engineering + CRM Flow)

Wire the agent to process meeting transcripts intelligently.

**3a. Meeting-specific agent instructions**

New file: `src/lib/ai/meeting-prompt.ts`
- Exported function that generates meeting-specific instructions
- Injected into the agent run when processing a meeting
- Instructions cover:
  1. Read the transcript and user notes (notes are authoritative — override transcript)
  2. Search CRM for people/companies/deals mentioned
  3. Use `ask_user_question` to confirm: "This sounds like a call with [Name] — [Deal]. Link to their record? [Confirm / Change]"
  4. If no match: ask who it was. Offer to create new contact or save unlinked.
  5. Write meeting summary to `memory/meetings/{date}-{name}.md` via `write_file`
  6. Present suggested actions as a checklist (create tasks, update deal, draft follow-up)
  7. Execute only the actions the user selects

**3b. CRM link confirmation flow**

Uses existing `ask_user_question` tool pattern (`src/lib/runner/tools/utility/ask-user-question.ts`).
- Agent searches CRM, finds best match
- Presents single-select: "Link to [Person]'s record? [Confirm / Change / Save unlinked]"
- On "Change": agent asks who, searches again
- On "Save unlinked": saves to `{clientId}/meetings/unlinked/{date}.md`
- On confirm: updates `meeting_records.linked_person_id` and saves transcript under person's memory path

**3c. Summary + suggested actions**

Agent generates a structured response:
- Meeting summary (bullet points, merged from transcript + notes, notes marked with ← note)
- Suggested actions as a checklist with pre-checked defaults:
  - Create task (from action items found in transcript/notes)
  - Update deal stage (if stage change discussed)
  - Draft follow-up email (if follow-up warranted)
  - Note personal details (rapport builders)

**Decision for planning:** No new UI components or tools for action selection. The agent proposes follow-up actions as a numbered list in natural language, and the user responds conversationally ("do 1 and 3", "all of them", "skip the deal update"). The agent already has every tool it needs (`crm_create`, `crm_update`, `write_file`, approval gate for emails). Zero new code for this step.

Keep `ask_user_question` for the simple CRM-link confirm/change step where it works well. A structured checklist UI can be added later as polish if users want it.

**3d. Follow-up email draft**

Agent drafts the email using transcript context + CRM data. Presents it inline in the chat. Uses existing approval pattern:
- Agent posts the draft as a text message
- Follows with `ask_user_question`: "Approve this follow-up? [Approve & Send / Edit / Discard]"
- On "Approve & Send": agent sends via existing email/messaging tools (or queues for approval if external-facing)
- On "Edit": user types edits, agent revises
- On "Discard": agent acknowledges, moves on

**Acceptance criteria:**
- [ ] Agent correctly reads transcript + notes, with notes taking priority
- [ ] Agent searches CRM and suggests correct person/company/deal match
- [ ] User can confirm, change, or save unlinked via ask_user_question
- [ ] Meeting summary is written to person's memory path
- [ ] Suggested actions appear as selectable checklist
- [ ] Agent executes only user-selected actions
- [ ] Follow-up email draft uses transcript context and relationship details
- [ ] End-to-end: record → stop → link → summary → select actions → done in <2 minutes

## System-Wide Impact

### Interaction Graph

1. User clicks Record → `getUserMedia` permission prompt (first time only)
2. Recording stop → presigned URL fetch → PUT to Supabase Storage → POST to `/api/meetings/ingest`
3. Ingest route → Groq Whisper API → save transcript → insert meeting_records → create user message → `runAgent()`
4. Agent run → `crm_search` → `ask_user_question` (CRM link) → `write_file` (summary) → `ask_user_question` (suggested actions) → CRM tools (create tasks, update deal) → `ask_user_question` (approve follow-up)

### Error Propagation

- **Mic permission denied** → show error in UI, don't start recording
- **MediaRecorder not supported** → show "Recording not supported in this browser"
- **Upload fails** → retry button in upload progress card (audio still in memory)
- **Groq API fails** → fall back to AssemblyAI batch, or show error + retry. meeting_records stays at `transcribing` — safe to retry.
- **Groq rate limit** → queue and retry with backoff, or fall back
- **Agent run fails** → meeting_records stays at `transcribed`. Transcript is safe in storage. Agent can be re-triggered. `runMeetingFollowUp()` catches errors and returns `{ status: "failed" }` without throwing (same as `run-autopilot.ts:84-91`).
- **Network retry during ingest** → idempotency_key prevents duplicate meeting_records rows, duplicate transcriptions, and duplicate agent runs. Same key = return existing record.

### State Lifecycle Risks

- **Partial upload** → presigned URL expires (1 hour). If upload stalls, user retries.
- **Tab closed during recording** → audio lost (no IndexedDB in v1). Acceptable for v1 — add crash recovery later.
- **Transcription succeeds but agent run fails** → `meeting_records.status` stays at `transcribed`. Transcript is safe. User can trigger reprocessing manually.
- **Agent links to wrong person** → user corrects via "Change" flow. meeting_records.linked_contact_id updated.
- **Duplicate ingest calls** → idempotency_key + client_id unique constraint. Second call returns existing record without re-processing.
- **Full transcript NOT in thread history** → stored as a storage artifact, loaded on-demand via `read_file`. No context-cost penalty on future thread runs.

### Integration Test Scenarios

1. Record 5-minute audio → upload → transcribe → agent suggests correct CRM match → user confirms → summary saved to correct person's memory
2. Record on mobile Safari → upload WebM/MP4 → Groq accepts format → transcript generated
3. Record with notes typed → notes appear in merged summary, overriding transcript where contradicting
4. No CRM match → agent asks who → user provides name → agent creates contact → links transcript
5. Groq API down → fallback to AssemblyAI → transcript still generated (degraded latency)

## Acceptance Criteria

### Functional Requirements (from origin R1-R9)

- [ ] R1: User can start/stop mic recording from a button in the chat composer
- [ ] R2: Recording bar shows red dot, timer, waveform, pause, stop — replaces input area
- [ ] R3: Audio uploads on stop with progress indicator in thread
- [ ] R4: Groq Whisper transcribes audio; transcript saved to Supabase Storage
- [ ] R5: Agent suggests CRM link; user confirms/changes/saves unlinked
- [ ] R6: Agent posts summary + suggested action checklist; executes user selections
- [ ] R7: Mobile works mic-only with "Best for in-person conversations" note
- [ ] R8: Transcript saved to linked person's memory path
- [ ] R9: Notepad replaces thread during recording; notes merged into summary

### Non-Functional Requirements

- [ ] End-to-end flow completes in under 2 minutes for 60-minute recording
- [ ] Transcription cost under $0.10 per hour of audio
- [ ] Works on Chrome, Edge, Firefox (desktop) and Safari, Chrome (mobile)
- [ ] Audio files under 50MB upload reliably

### Quality Gates

- [ ] Unit tests for `use-audio-recorder` hook (mock MediaRecorder)
- [ ] Unit tests for Groq Whisper integration (mock API responses)
- [ ] Integration test for upload → transcribe → agent run pipeline
- [ ] Manual QA on Chrome, Safari mobile, Firefox

## Success Metrics

- Users record meetings directly in Sunder (vs. paste transcript)
- Time from meeting end to CRM updated: <2 minutes
- Transcription accuracy acceptable without diarization
- Cost per user: <$10/mo at heavy usage (4 hrs/day)

## Dependencies & Prerequisites

- **Groq API key** — needs to be provisioned and added to environment
- **Supabase Storage** — `agent-files` bucket already exists; meetings path just needs to be allowed in download routes
- **Existing infrastructure** — runner, CRM tools, ask_user_question, write_file, approval gate — all shipped
- **Browser APIs** — `getUserMedia`, `MediaRecorder`, `AnalyserNode` — standard, no polyfills needed for target browsers

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Tab closed during recording → audio lost | Medium | Medium | Accept for v1. Add IndexedDB persistence in v2. |
| Groq rate limits at scale | Low | Medium | Fall back to AssemblyAI batch ($0.15/hr) |
| Agent can't infer speakers without diarization | Medium | Low | Bolt on AssemblyAI diarization if needed. Low effort. |
| iOS Safari suspends mic in background | Medium | Medium | "Keep Sunder open" warning. PWA silent audio hack later. |
| MediaRecorder format varies by browser | Low | Low | Runtime detection via `isTypeSupported()`. Groq accepts both WebM and MP4. |
| Presigned URL expires before upload completes | Low | Low | 1-hour expiry. Refresh if needed. |

## Scope Boundaries (from origin)

- No getDisplayMedia / tab audio capture (v2)
- No Chrome extension (v2)
- No desktop app (white-label Meetily if needed)
- No real-time streaming transcription
- No live transcript panel during recording
- No calendar integration
- No diarization (agent infers from context)
- No IndexedDB crash recovery
- No video recording
- No audio playback

## Future Considerations

- **v2: Tab audio capture** — `getDisplayMedia` for headphone + browser meeting case. Adds picker dialog UX.
- **v2: Chrome extension** — removes picker dialog. `tabCapture` API = one click.
- **v3: Desktop app** — white-label Meetily (MIT, Tauri) for system audio capture. Covers phone calls + native Zoom/Teams.
- **v3: Diarization** — AssemblyAI batch ($0.15/hr) or pyannote.audio self-hosted for speaker labels.
- **v4: Real-time streaming** — WebSocket to AssemblyAI/Deepgram for live transcript panel.
- **v4: Calendar integration** — auto-detect meetings, pre-pull CRM context.

## Sources & References

### Origin

- **Origin document:** [docs/product/ideations/2026-04-06-meeting-recorder-requirements.md](docs/product/ideations/2026-04-06-meeting-recorder-requirements.md) — Key decisions: mic-only v1, Groq Whisper, agent-suggests-user-confirms CRM link, summary + suggested actions checklist, notepad during recording.

### Internal References

- Upload pattern: `app/api/files/upload/route.ts`
- Storage client: `src/lib/storage/agent-files.ts`
- Chat composer: `src/components/chat/chat-composer.tsx:89`
- Chat panel: `src/components/chat/chat-panel.tsx:107`
- Agent runner: `src/lib/runner/run-agent.ts`
- Tool registry: `src/lib/runner/tool-registry.ts:37`
- CRM tools: `src/lib/runner/tools/crm/`
- Storage tools: `src/lib/runner/tools/storage/index.ts`
- Ask user question: `src/lib/runner/tools/utility/ask-user-question.ts`
- System prompt: `src/lib/ai/system-prompt.ts`
- Context assembly: `src/lib/runner/context.ts:45`
- Approval gate: `src/lib/runner/safety-gates.ts`
- Attachment config: `src/lib/chat/attachment-config.ts`

### External References

- [RecordRTC](https://github.com/muaz-khan/RecordRTC) (6.9k stars) — cross-browser MediaRecorder wrapper
- [addpipe/getDisplayMedia-demo](https://github.com/addpipe/getDisplayMedia-demo) — AudioContext mixing pattern reference
- [webrtcHacks — getDisplayMedia with audio](https://webrtchacks.com/jitsi-recording-getdisplaymedia-audio/) — best walkthrough of mixing gotchas
- [Groq Whisper API docs](https://console.groq.com/docs/speech-text)
- [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MDN MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)

### Prior Research

- `docs/product/ideations/2026-04-05-meeting-recorder-final.md` — full architecture, all options ranked, OSS stack
- `docs/product/ideations/2026-04-05-meeting-recorder-options-ranked.md` — 9 approaches evaluated
- `docs/product/ideations/2026-04-05-meeting-recorder-research-prompt.md` — OSS recorder evaluation
- `docs/product/ideations/2026-04-05-web-app-audio-capture-research-prompt.md` — browser audio capture patterns
