---
date: 2026-04-06
topic: meetings-surface
---

# Meetings Surface — Dedicated Recording & Summary Experience

## Problem Frame

PR 68 shipped a meeting recorder embedded in the chat thread. The backend pipeline works (upload → Groq Whisper transcription → agent run), but the UX is fundamentally broken: meetings and chat are different workflows. Meetings are artifacts — "I recorded something, I want to see what was said." Chat is interactive — "I'm asking the agent to do something." Cramming the artifact into the interactive surface means the user records, sees "Uploaded · Transcribing...", and then nothing visible happens because the agent's response arrives asynchronously with no indication.

This redesign separates meetings into their own first-class surface. Recording, transcription, and auto-summary happen on a dedicated Meetings page. Agent actions (CRM linking, task creation, follow-up emails) become opt-in via "Send to agent," which opens a normal chat thread pre-loaded with meeting context. Inspired by Granola's model where the meeting note is the primary object and AI actions are secondary.

## Requirements

### Meetings Surface

- R1. **Sidebar navigation item.** A "Meetings" tab in the sidebar, placed in the DATABASE section alongside Channels. Navigates to `/meetings`.
- R2. **Meetings list page.** `/meetings` shows all meetings for the current client, grouped by date (Today, Yesterday, older dates). Each row shows: auto-generated title, duration, time. Sorted newest first.
- R3. **New Meeting entry point.** A "New Meeting" button on the meetings list page starts a new recording. This is the only way to start a meeting recording — remove the mic button from the chat composer.
- R4. **Meeting detail page.** `/meetings/[id]` shows a single meeting: title, date, duration, notes count, summary (rendered markdown), transcript (expandable/collapsible), and a "Send to agent" button.

### Recording Flow

- R5. **Recording on the meetings page.** When "New Meeting" is clicked, the page transitions to a recording state: recording bar (red dot, timer, pause, stop) pinned at top, notepad area below for freeform notes during the call. Same recording UX as PR 68 but hosted on the meetings surface instead of the chat thread.
- R6. **On stop: auto-transcribe + auto-summarize.** When the user stops recording: (a) audio uploads to Supabase Storage via presigned URL, (b) ingest route transcribes via Groq Whisper, (c) a simple LLM call generates a structured summary from the transcript + user notes. No full agent run. The meeting detail page renders the result.
- R7. **Auto-generated title.** The summary LLM call also generates a short title for the meeting (e.g., "Portfolio Review with John Smith"). Stored on the meeting record.

### Agent Handoff

- R8. **"Send to agent" button.** On the meeting detail page, a button creates a new chat thread pre-loaded with the meeting context (summary, transcript path, user notes, duration, date). The user is navigated to the new chat thread. The agent's first message acknowledges the meeting and offers to help with CRM linking, task creation, follow-up emails, etc. See [Agent Handoff Prompt Template](#agent-handoff-prompt-template) for the injected context.
- R9. **Agent tool: `search_meetings`.** A new agent tool that queries the `meeting_records` table — search by date range, keyword in transcript/notes/title, or linked CRM record. Allows the agent to reference past meetings during any conversation, not just ones explicitly "sent to agent."

### Cleanup

- R10. **Remove meeting recording from chat.** Remove the mic button from the chat composer. Remove the recording bar, meeting notepad, and upload progress components from the chat panel. The chat surface returns to its pre-PR68 state for messaging. The existing components (`recording-bar.tsx`, `meeting-notepad.tsx`, `upload-progress.tsx`) can be reused on the meetings surface.

## Summary Processing Pipeline

### Architecture

The summary is generated synchronously inside the existing ingest route, after transcription completes. No separate endpoint, no async job. The client waits for the full response.

```
Client clicks Stop
  │
  ▼
POST /api/meetings/upload-url → presigned URL
  │
  ▼
PUT audio to Supabase Storage
  │
  ▼
POST /api/meetings/ingest ─────────────────────────────────────
  │                                                            │
  │  1. Insert meeting_records row     status: uploaded        │
  │  2. Groq Whisper transcription     status: transcribing    │
  │  3. Save transcript to Storage     status: transcribed     │
  │  4. generateObject() for summary   status: summarizing     │
  │  5. Save title + summary to row    status: completed       │
  │                                                            │
  │  Returns: { meetingRecordId, title, summary, transcriptPath }
  ├────────────────────────────────────────────────────────────
  ▼
Client renders meeting detail page immediately from response
```

The ingest route already has `maxDuration = 300`. Transcription takes ~15-30 seconds for a 60-minute recording. The summary LLM call adds ~5-10 seconds. Total: ~25-40 seconds, well within the 300-second limit.

### Model Choice

Use the cheapest/fastest model via `@ai-sdk/gateway`. This is a straightforward summarization task — no tool use, no reasoning, no multi-turn. Gemini Flash 3 (Tier 1 in the gateway) is the right fit. Cost per summary is negligible (~$0.001 for a 60-minute transcript).

### Structured Output

Use Vercel AI SDK `generateObject()` with a Zod schema to get structured output directly — no parsing needed.

```typescript
const result = await generateObject({
  model: gateway("tier-1"),
  schema: z.object({
    title: z.string().describe("Short meeting title, 3-8 words"),
    summary: z.string().describe("Markdown bullet-point summary of the meeting"),
  }),
  prompt: summaryPrompt,
});
```

### Summary Prompt Template

```
You are summarizing a meeting recording for a busy sales professional. They need to quickly see what happened and what needs to follow up.

## Instructions

- Generate a short, descriptive title for this meeting (e.g., "Portfolio Review with John Smith", "New Lead Intro Call", "Team Standup")
- Generate a bullet-point summary of the key points discussed, decisions made, and action items identified
- If User Notes are provided, treat them as authoritative — they override the transcript where they conflict
- Mark bullet points that came from or were influenced by user notes with "← note" at the end
- Keep the summary concise — aim for 5-10 bullet points for a 30-60 min meeting, fewer for shorter meetings
- Use plain language, not jargon
- Lead with the most important items (decisions, action items) before background discussion

## Transcript

{transcript}

## User Notes

{notes}
```

### Data Model Changes

Two new columns on `meeting_records`:

| Column | Type | Purpose |
|---|---|---|
| `title` | TEXT | Auto-generated title for list view and detail page header |
| `summary` | TEXT | Auto-generated markdown summary — stored in Postgres, not Storage |

The `thread_id` column becomes nullable — only populated when user clicks "Send to agent." The status lifecycle updates to: `uploaded` → `transcribing` → `transcribed` → `summarizing` → `completed` | `failed`.

### Client-Side Flow

The client waits synchronously for the ingest response. No Realtime subscription or polling needed for the initial load.

```
[+ New Meeting] clicked
  → Recording state (notepad + recording bar)

Stop clicked
  → "Uploading..." (upload audio to Storage)
  → "Transcribing..." (POST /api/meetings/ingest, waiting for response)
  → Response arrives with { title, summary, transcriptPath }
  → Navigate to /meetings/{id}, render detail page immediately
```

If the user navigates away during processing (e.g., closes tab), the ingest route still completes server-side. When the user returns to `/meetings`, the meeting appears in the list with its title. Clicking into it shows the summary.

## Agent Handoff Prompt Template

When "Send to agent" is clicked, a new chat thread is created with the following injected as the initial user message. The summary and notes are included inline (small context cost). The full transcript is NOT included — the agent is pointed to the file path and can `read_file` if it needs more detail.

```
A meeting was just recorded and auto-summarized. Review the summary and notes below, then help the user process it.

## What to do

1. Read the summary and notes. Identify people, companies, and deals mentioned.
2. Search the CRM for matches. If you find a likely match, suggest linking the meeting to that record. Ask the user to confirm before linking.
3. Look for actionable items: tasks to create, deal stages to update, follow-up emails to draft, personal details worth remembering.
4. Present what you found and what you'd recommend. Let the user decide what to act on.

If you need more detail than the summary provides, the full transcript is at `/agent/{transcriptPath}` — use read_file to access it.

## Meeting Details

- **Date:** {date}
- **Duration:** {durationMinutes} minutes

## Summary

{summary}

## User Notes

{notes}
```

## UX Flow — Desktop

### Meetings list page (`/meetings`)

```
┌──────────────────────────────────────────────────────────────┐
│ ☰  Sunder                                    Sarah Chen ▾   │
├──────────┬───────────────────────────────────────────────────┤
│          │                                                   │
│ AGENT    │  Meetings                    [+ New Meeting]      │
│ Agent    │                                                   │
│ New Task │  ─── Today ──────────────────────────────────     │
│ Skills   │                                                   │
│ Tasks    │  📋 Portfolio Review — John Smith    45 min  3:15p│
│ Automati │  📋 Team standup                    12 min  9:00a│
│ Memory   │                                                   │
│          │  ─── Yesterday ──────────────────────────────     │
│ CUSTOMER │                                                   │
│ People   │  📋 Client check-in — Jane Doe      20 min  2:30p│
│ Companies│  📋 New lead intro — Mike Chen       8 min 10:15a│
│ Deals    │                                                   │
│          │  ─── Apr 4, 2026 ────────────────────────────     │
│ DATABASE │                                                   │
│ Channels │  📋 Quarterly review — Acme Co      55 min  1:00p│
│ Meetings●│                                                   │
│          │                                                   │
│ SESSIONS │                                                   │
│ Gmail ...|                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

### Click "+ New Meeting" → recording state

```
┌──────────────────────────────────────────────────────────────┐
│ ☰  Sunder                                    Sarah Chen ▾   │
├──────────┬───────────────────────────────────────────────────┤
│          │                                                   │
│ AGENT    │  🔴 Recording  24:17                    ⏸  ⏹    │
│ Agent    │  ┄┃┃┄┃┃┃┄┄┃┃┄┄┃┃┃┄┄┃┃┄┄┃┃┃┄┄┃┃┄                │
│ New Task │  ─────────────────────────────────────────────    │
│ Skills   │                                                   │
│ Tasks    │  john hesitant on life insurance                  │
│ Automati │                                                   │
│ Memory   │  wants proposal by THURSDAY not fri              │
│          │                                                   │
│ CUSTOMER │  daughter maya graduating june —                  │
│ People   │  remember to congratulate                        │
│ Companies│                                                   │
│ Deals    │  ask about roth conversion next time             │
│          │                                                   │
│ DATABASE │  █                                                │
│ Channels │                                                   │
│ Meetings●│                                                   │
│          │                                                   │
│          │                                                   │
│          │                                                   │
└──────────┴───────────────────────────────────────────────────┘

Recording bar at top. Notepad below.
Enter = new line (it's a notepad, not chat).
```

### Click ⏹ → processing → meeting detail page (`/meetings/[id]`)

```
┌──────────────────────────────────────────────────────────────┐
│ ☰  Sunder                                    Sarah Chen ▾   │
├──────────┬───────────────────────────────────────────────────┤
│          │                                                   │
│          │  ← Meetings                                       │
│          │                                                   │
│          │  Portfolio Review — John Smith                     │
│          │  Apr 6, 2026 · 45 min · 4 notes                  │
│          │                                                   │
│          │  ── Summary ──────────────────────────────────    │
│          │                                                   │
│          │  • Reviewed portfolio allocation — currently      │
│          │    60/40 stocks/bonds, John wants more growth     │
│          │  • Increasing retirement contribution to          │
│          │    $3,000/mo starting next month                  │
│          │  • Send updated allocation proposal by            │
│          │    Thursday (not Friday) ← note                   │
│          │  • Life insurance — John seems hesitant,          │
│          │    requested quote anyway ← note                  │
│          │  • Daughter Maya graduating in June               │
│          │  • Ask about Roth conversion next meeting ← note  │
│          │                                                   │
│          │  ── Transcript ───────────────────── [expand ▾]   │
│          │                                                   │
│          │  ── Notes ────────────────────────────────────    │
│          │  john hesitant on life insurance                  │
│          │  wants proposal by THURSDAY not fri              │
│          │  daughter maya graduating june — remember to      │
│          │  congratulate                                     │
│          │  ask about roth conversion next time             │
│          │                                                   │
│          │                      [Send to agent]              │
│          │                                                   │
└──────────┴───────────────────────────────────────────────────┘

Auto-generated title + summary. User notes shown.
Transcript collapsed by default.
"Send to agent" at the bottom.
```

### Click "Send to agent" → new chat thread

```
┌──────────────────────────────────────────────────────────────┐
│ ☰  Sunder                                    Sarah Chen ▾   │
├──────────┬───────────────────────────────────────────────────┤
│          │                                                   │
│ AGENT    │  Thread: Portfolio Review follow-up               │
│ Agent    │                                                   │
│ New Task │  ┌─ Sunder ──────────────────────────────────┐   │
│ Skills   │  │                                           │   │
│ Tasks    │  │  I've reviewed your 45-minute meeting.     │   │
│ ...      │  │                                           │   │
│          │  │  This looks like a call with John Smith    │   │
│ SESSIONS │  │  about the Smith Family Portfolio Review   │   │
│ Portfoli●│  │  (Proposal stage).                        │   │
│ Gmail .. │  │                                           │   │
│ ...      │  │  Want me to:                              │   │
│          │  │  • Link this meeting to John's record     │   │
│          │  │  • Create tasks for the proposal and      │   │
│          │  │    insurance quote                         │   │
│          │  │  • Draft a follow-up email to John        │   │
│          │  │  • Save Maya's graduation as a personal   │   │
│          │  │    detail                                  │   │
│          │  │                                           │   │
│          │  │  Or ask me anything about this meeting.    │   │
│          │  └───────────────────────────────────────────┘   │
│          │                                                   │
│          │  ┌──────────────────────────────────────────┐    │
│          │  │ Message...                     📎  ⏎  │    │
│          │  └──────────────────────────────────────────┘    │
└──────────┴───────────────────────────────────────────────────┘

Normal chat thread. Agent has full meeting context.
User responds conversationally: "Do all of that" or picks specific actions.
No mic button in chat composer.
```

## UX Flow — Mobile

### Recording

```
┌─────────────────────────┐
│ ☰ Sunder          ▾     │
├─────────────────────────┤
│                         │
│ 🔴 12:34        ⏸  ⏹  │
│ ┄┃┃┄┃┃┃┄┄┃┃┄┄┃┃┃┄      │
│ ────────────────────    │
│                         │
│ john hesitant on life   │
│ insurance               │
│                         │
│ THURSDAY not friday     │
│                         │
│ maya graduating june    │
│                         │
│ █                       │
│                         │
│                         │
│ 🎤 Best for in-person  │
│ (AI only hears your mic)│
└─────────────────────────┘
```

### Meeting detail

```
┌─────────────────────────┐
│ ← Meetings        ▾     │
├─────────────────────────┤
│                         │
│ Portfolio Review —      │
│ John Smith              │
│ Apr 6 · 45 min · 4 notes│
│                         │
│ ── Summary ──────────   │
│                         │
│ • Reviewed portfolio    │
│ • Send proposal by Thu  │
│ • Life insurance quote  │
│ • Maya graduating June  │
│                         │
│ ── Transcript ─ [▾]     │
│                         │
│ ── Notes ────────────   │
│ john hesitant on life   │
│ insurance               │
│ THURSDAY not friday     │
│                         │
│                         │
│    [Send to agent]      │
│                         │
└─────────────────────────┘
```

## Success Criteria

- User can record a meeting, see the auto-generated summary, and browse past meetings — all without touching the chat.
- "Send to agent" creates a pre-loaded chat thread where the agent can act on the meeting.
- End-to-end flow (click New Meeting → stop → summary visible) completes in under 2 minutes for a 60-minute recording.
- The chat surface is clean — no meeting recording UI polluting the messaging experience.

## Scope Boundaries

- **No inline agent actions on the meeting page.** All agent interaction goes through "Send to agent" → chat thread. No "Write follow up email" or "Link to CRM" buttons on the meeting detail page (those are agent actions that belong in chat).
- **No real-time streaming transcription.** Batch only — same as PR 68.
- **No meeting editing.** User cannot edit the transcript or summary. They can re-record or ask the agent to revise.
- **No calendar integration.** No auto-detection of meetings.
- **No audio playback.** Transcript is the artifact. Audio kept as raw backup.
- **Same browser constraints as PR 68.** Mic-only, no tab audio capture, no extension, no desktop app.

## Key Decisions

- **Meetings are a first-class surface, not embedded in chat.** Chat is for interactive agent conversations. Meetings are artifacts with structured data. Separating them gives each a clear mental model.
- **Auto-summarize only, agent is opt-in.** The meeting page is predictable — you always get a transcript and summary. Agent actions (CRM, tasks, emails) are intentional, not automatic. This avoids the broken "wait for the agent" UX.
- **"Send to agent" creates a chat thread.** The agent interaction IS conversational — the user discusses what to do with the meeting in a natural chat. No new UI paradigm needed for agent actions.
- **Single entry point (Meetings page).** Removing the mic from chat simplifies both surfaces. Users know: chat = talk to agent, meetings = record calls.
- **Summary + notes in the handoff, not the full transcript.** The agent prompt includes the summary and user notes inline (small context cost). The full transcript stays on disk — the agent is pointed to the file path and can `read_file` if it needs more detail.
- **Reuse backend pipeline.** The upload-url route, ingest route, Groq Whisper integration, and `meeting_records` table from PR 68 all stay. The change is: (a) ingest adds an auto-summary LLM call, (b) `runMeetingFollowUp` is removed from ingest, (c) new frontend pages replace the chat-embedded UI.

## Dependencies / Assumptions

- The `meeting_records` table is already in production (PR 68 migration applied). Needs a migration to add `title` and `summary` columns and make `thread_id` nullable.
- The auto-summary uses Vercel AI SDK `generateObject()` via `@ai-sdk/gateway` with the Tier 1 model (Gemini Flash 3) — same gateway as all other LLM calls in the codebase.
- The ingest route processes synchronously — client waits for the full response including summary. No Realtime or polling needed for the initial load.
- The `status` CHECK constraint on `meeting_records` needs updating to include `summarizing`.

## Outstanding Questions

### Deferred to Planning

- [Affects R8][Technical] How to pre-load meeting context into a new chat thread — inject via the `instructions` param on `runAgent`, or create a user message with the handoff prompt?
- [Affects R4][Needs research] Best approach for the expandable transcript UI — collapsible section, separate tab, or scroll-to section?
- [Affects R2][Needs research] Pagination strategy for the meetings list — infinite scroll, paginated, or load-all (meetings accumulate slowly, ~5-10/day max)?

## Next Steps

→ `/plan` for structured implementation planning
