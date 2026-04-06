---
date: 2026-04-06
topic: meeting-recorder
---

# Meeting Recorder v1

## Problem Frame

Sunder's advisory sales users (financial planners, insurance agents, real estate agents) are on calls all day. After each call they manually update CRM records, create follow-up tasks, and draft emails. This is tedious, error-prone, and the first thing that gets dropped when they're busy. Meeting context gets lost.

Sunder already has the agent infrastructure to act on meeting content — users can paste a transcript into chat today and the agent processes it. But that requires the user to record separately, then copy-paste. The gap is a zero-friction way to record directly in Sunder so the agent pipeline fires automatically.

## Requirements

- R1. **Mic recording in the web app.** User clicks a Record button in the chat thread. Browser mic starts capturing via `getUserMedia`. Works on desktop and mobile, all browsers. No extension, no desktop app, no install.
- R2. **Recording controls replace the message input.** During recording, the input bar is replaced by: red dot indicator, elapsed timer, live waveform (mic level), pause button, stop button. User can still see the chat thread above.
- R3. **Upload on stop.** When user clicks Stop, audio is uploaded to Sunder API as a single file. Upload progress shows inline in the thread as a system message.
- R4. **Transcription via Groq Whisper.** Server receives the audio file, saves to Supabase Storage, sends to Groq Whisper Turbo API (batch, ~$0.04/hr, 228x realtime). Transcript saved to Supabase Storage as markdown.
- R5. **Agent suggests CRM link.** After transcription, agent reads the transcript, searches the CRM for matching people/companies/deals, and suggests a match. User confirms or corrects.
  - If match found: "This sounds like a call with John Smith (Smith Family Portfolio). Link to John's record? [Confirm / Change]"
  - If no match: "I couldn't match this to anyone in your CRM. Who was this call with?" User provides name. Agent searches, links, or offers to create a new contact.
  - If user says "save unlinked": transcript saved to a general meetings folder, linkable later.
- R6. **Summary + suggested actions.** Once linked, agent posts a meeting summary and a checklist of suggested actions (create tasks, update deal, draft follow-up, note personal details). User selects which to run. Agent executes only the selected actions.
- R7. **Mobile mic-only mode.** On mobile browsers (iOS Safari, Android Chrome), recording works via mic only. UI shows a note: "Best for in-person conversations (AI only hears your microphone)." — same language as Notion. This is positioned for in-person meetings (phone on table), not phone calls. Phone call recording requires a native app (future — white-label Meetily if demand exists).
- R8. **Transcript saved to person's record.** The meeting transcript and summary are saved as a memory file under the linked person's storage path (e.g., `/{client_id}/memory/meetings/2026-04-06-john-smith.md`). Accessible to the agent in future runs for compounding context.
- R9. **Notepad during recording.** While recording, the thread area transforms into a plain text notepad. Recording bar pins to the top (red dot, timer, waveform, pause, stop). User can type freeform notes during the call — quick observations, corrections, reminders. Notes are bundled with the audio on upload. Agent merges the user's notes with the transcript when generating the summary — user notes are treated as authoritative (e.g., "THURSDAY not friday" overrides whatever the transcript says). When recording stops, the thread returns to normal chat view.

## Success Criteria

- User can record a meeting, get a transcript, and have the agent suggest CRM actions — all without leaving the Sunder chat.
- End-to-end flow (click Record → agent posts summary with suggested actions) completes in under 2 minutes for a 60-minute recording.
- Works on desktop Chrome/Edge/Firefox and mobile Safari/Chrome (mic-only).
- Transcription cost stays under $0.10 per hour of audio.

## Scope Boundaries

- **No getDisplayMedia / tab audio capture.** v1 is mic-only, matching Notion's browser experience. Tab audio capture (for headphones + browser meetings) is a v2 consideration — UX is unfamiliar and risky.
- **No Chrome extension.** v2+ polish to remove friction.
- **No desktop app.** If needed later, white-label Meetily (MIT, Tauri, system audio capture) rather than building from scratch.
- **No real-time streaming transcription.** Batch only. Agent acts after the meeting.
- **No live transcript panel.** No transcript displayed during recording.
- **No calendar integration.** No auto-detection of meetings.
- **No diarization.** Agent infers speaker attribution from CRM context and transcript content. Bolt on AssemblyAI ($0.15/hr) later if needed.
- **No IndexedDB crash recovery.** v1 records to memory. Add persistence for long recordings later if needed.
- **No video recording.** Audio only.
- **No audio playback.** Transcript is the artifact, not the audio. Audio kept in storage as a raw backup.

## Key Decisions

- **Mic-only for v1:** Matches Notion's browser behavior. In-person and speakerphone calls capture both sides. Headphone calls capture user's side only — acceptable tradeoff to avoid the unfamiliar tab-sharing picker dialog. Same limitation Notion has in their browser version.
- **Groq Whisper Turbo for transcription:** $0.04/hr, 228x realtime. Essentially free. No diarization, but agent can infer from context.
- **Agent suggests CRM link, user confirms:** Agent reads transcript, searches CRM, proposes a match. User confirms or corrects. Never auto-links without confirmation.
- **Summary + suggested actions (not auto-execute):** Agent proposes actions as a selectable checklist. User picks which to run. Middle ground between passive (just save) and autonomous (auto-mutate CRM).
- **Recording UI in chat thread:** Record button lives next to the message input (like an attachment button). Recording controls replace the input bar during recording. Agent response lands in the same thread. No new pages or navigation.
- **Desktop app path is white-label, not build:** If headphone/system audio capture becomes critical, fork Meetily (MIT, Tauri, Rust) and add Supabase sync. Don't build a desktop app from scratch.

## UX Flow — Desktop

### Idle — record button visible

```
┌──────────────────────────────────────────────────┐
│ ☰  Sunder                          Sarah Chen ▾  │
├──────────┬───────────────────────────────────────┤
│          │                                       │
│ Threads  │  Thread: General                      │
│          │                                       │
│ General● │  Sunder: Good afternoon Sarah.        │
│ John S.  │  You have a call with John Smith at   │
│ Jane D.  │  2pm — Portfolio Review.              │
│ Acme Co  │                                       │
│          │                                       │
│          │                                       │
│          │                                       │
│          │  ┌──────────────────────────────────┐  │
│          │  │ Message...        📎  🎙  ➤  │  │
│          │  └──────────────────────────────────┘  │
└──────────┴───────────────────────────────────────┘
```

### Tap 🎙 → recording starts, thread becomes notepad

```
┌──────────────────────────────────────────────────┐
│ ☰  Sunder                          Sarah Chen ▾  │
├──────────┬───────────────────────────────────────┤
│          │                                       │
│ Threads  │  🔴 Recording  00:03          ⏸  ⏹   │
│          │  ┄┃┃┄┃┃┃┄┄┃┃┄┄┃┃┃┄┄┃┃┄┄┃┃┃┄┄┃┃┄     │
│ General● │  ─────────────────────────────────    │
│ John S.  │                                       │
│ Jane D.  │  Type notes during your meeting...    │
│ Acme Co  │                                       │
│          │                                       │
│          │                                       │
│          │                                       │
│          │                                       │
│          │                                       │
│          │                                       │
└──────────┴───────────────────────────────────────┘

Chat messages hidden. Full area is a plain textarea.
Placeholder: "Type notes during your meeting..."
Recording bar pinned to top. No input bar at bottom.
```

### User types notes during the call

```
┌──────────────────────────────────────────────────┐
│ ☰  Sunder                          Sarah Chen ▾  │
├──────────┬───────────────────────────────────────┤
│          │                                       │
│ Threads  │  🔴 Recording  24:17          ⏸  ⏹   │
│          │  ┄┃┃┄┃┃┃┄┄┃┃┄┄┃┃┃┄┄┃┃┄┄┃┃┃┄┄┃┃┄     │
│ General● │  ─────────────────────────────────    │
│ John S.  │                                       │
│ Jane D.  │  john hesitant on life insurance      │
│ Acme Co  │                                       │
│          │  wants proposal by THURSDAY not fri   │
│          │                                       │
│          │  daughter maya graduating june —       │
│          │  remember to congratulate             │
│          │                                       │
│          │  ask about roth conversion next time  │
│          │                                       │
│          │  █                                    │
│          │                                       │
│          │                                       │
└──────────┴───────────────────────────────────────┘

Just typing. Enter = new line. It's a notepad, not chat.
Notes save locally as user types (state only).
```

### Stop → upload → thread returns

```
┌──────────────────────────────────────────────────┐
│ ☰  Sunder                          Sarah Chen ▾  │
├──────────┬───────────────────────────────────────┤
│          │                                       │
│ Threads  │  Thread: General                      │
│          │                                       │
│ General● │  Sunder: Good afternoon Sarah.        │
│ John S.  │  You have a call with John Smith at   │
│ Jane D.  │  2pm — Portfolio Review.              │
│ Acme Co  │                                       │
│          │  ┌─────────────────────────────────┐  │
│          │  │  ⏳ Uploading recording...       │  │
│          │  │  ████████████░░░░  72%   14MB   │  │
│          │  │  + 4 notes attached              │  │
│          │  └─────────────────────────────────┘  │
│          │                                       │
│          │  ┌──────────────────────────────────┐  │
│          │  │ Message...        📎  🎙  ➤  │  │
│          │  └──────────────────────────────────┘  │
└──────────┴───────────────────────────────────────┘

Chat history restored. Upload progress inline.
Input bar returns to normal.
```

### Agent — who was this?

```
│          │  ┌─ Sunder ──────────────────────────┐│
│          │  │                                   ││
│          │  │  Transcribed your 45-min meeting.  ││
│          │  │                                   ││
│          │  │  This sounds like a call with      ││
│          │  │  John Smith — Smith Family         ││
│          │  │  Portfolio Review (Proposal).      ││
│          │  │                                   ││
│          │  │  Link to John's record?            ││
│          │  │                                   ││
│          │  │  ┌─────────┐  ┌────────┐          ││
│          │  │  │ Confirm │  │ Change │          ││
│          │  │  └─────────┘  └────────┘          ││
│          │  └───────────────────────────────────┘│
```

### Agent — summary (merged with notes) + suggested actions

```
│          │  ┌─ Sunder ──────────────────────────┐│
│          │  │                                   ││
│          │  │  Linked to John Smith.             ││
│          │  │                                   ││
│          │  │  Meeting Summary — Apr 6, 2026     ││
│          │  │  ──────────────────────────────    ││
│          │  │  • Reviewed portfolio — 60/40      ││
│          │  │  • John wants to increase          ││
│          │  │    retirement to $3k/mo            ││
│          │  │  • Send updated allocation by      ││
│          │  │    Thursday (not Friday)  ← note   ││
│          │  │  • Life insurance — John seems     ││
│          │  │    hesitant, requested quote       ││
│          │  │    anyway  ← note                  ││
│          │  │  • Daughter Maya graduating June   ││
│          │  │  • Note: ask about Roth            ││
│          │  │    conversion next meeting         ││
│          │  │                                   ││
│          │  │  Saved to John's record.           ││
│          │  │                                   ││
│          │  │  ── Suggested actions ──────────   ││
│          │  │                                   ││
│          │  │  ☑ Create task: Send allocation    ││
│          │  │    proposal (due Apr 9)            ││
│          │  │  ☑ Create task: Send life          ││
│          │  │    insurance quote (due Apr 11)    ││
│          │  │  ☐ Update deal → Proposal stage    ││
│          │  │  ☑ Draft follow-up email           ││
│          │  │                                   ││
│          │  │       ┌───────────────┐            ││
│          │  │       │ Run selected  │            ││
│          │  │       └───────────────┘            ││
│          │  └───────────────────────────────────┘│

User's notes merged into summary. "Thursday not Friday"
overrode transcript. "Hesitant" added context. "Roth
conversion" becomes a future reminder.
```

### Agent — executes selected actions + draft follow-up

```
│          │  ┌─ Sunder ──────────────────────────┐│
│          │  │                                   ││
│          │  │  ✅ Task: Send allocation          ││
│          │  │     proposal (due Apr 9)           ││
│          │  │  ✅ Task: Send life insurance       ││
│          │  │     quote (due Apr 11)             ││
│          │  │                                   ││
│          │  │  ── Draft follow-up ────────────   ││
│          │  │                                   ││
│          │  │  Hi John,                          ││
│          │  │                                   ││
│          │  │  Great speaking with you today.    ││
│          │  │  I'll have the updated allocation  ││
│          │  │  proposal over to you by Thursday  ││
│          │  │  along with the life insurance     ││
│          │  │  quote.                            ││
│          │  │                                   ││
│          │  │  Congrats to Maya on her           ││
│          │  │  upcoming graduation!              ││
│          │  │                                   ││
│          │  │  Best, Sarah                       ││
│          │  │                                   ││
│          │  │  ┌─────────┐ ┌────┐ ┌───────┐    ││
│          │  │  │ Approve │ │Edit│ │Discard│    ││
│          │  │  └─────────┘ └────┘ └───────┘    ││
│          │  └───────────────────────────────────┘│
```

### No CRM match scenario

```
│          │  ┌─ Sunder ──────────────────────────┐│
│          │  │                                   ││
│          │  │  Transcribed your 20-min meeting.  ││
│          │  │                                   ││
│          │  │  I couldn't match this to anyone   ││
│          │  │  in your CRM. Who was this call    ││
│          │  │  with?                             ││
│          │  └───────────────────────────────────┘│
│          │                                       │
│          │  Sarah: Mike Chen, new lead from       │
│          │  the networking event                  │
│          │                                       │
│          │  ┌─ Sunder ──────────────────────────┐│
│          │  │                                   ││
│          │  │  No Mike Chen in your CRM.         ││
│          │  │                                   ││
│          │  │  ┌──────────────┐ ┌────────────┐  ││
│          │  │  │Create Mike as│ │Save unlinked│  ││
│          │  │  │ a contact   │ │ for now     │  ││
│          │  │  └──────────────┘ └────────────┘  ││
│          │  └───────────────────────────────────┘│
```

## UX Flow — Mobile

### Idle

```
┌─────────────────────────┐
│ ☰ Sunder          ▾     │
├─────────────────────────┤
│                         │
│ Sunder: Good afternoon  │
│ Sarah. You have a call  │
│ with John Smith at 2pm. │
│                         │
│                         │
│                         │
│                         │
│                         │
│                         │
│ ┌─────────────────────┐ │
│ │ Message...  📎 🎙 ➤│ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

### Tap 🎙 → notepad mode

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

Same notepad. Recording bar at top.
Mic-only note at bottom.
Full screen for typing.
```

### Stop → upload → back to chat

```
┌─────────────────────────┐
│ ☰ Sunder          ▾     │
├─────────────────────────┤
│                         │
│ Sunder: Good afternoon  │
│ Sarah.                  │
│                         │
│ ┌─────────────────────┐ │
│ │ ✓ Uploaded ·        │ │
│ │ Transcribing...     │ │
│ │ 45 min · 3 notes    │ │
│ └─────────────────────┘ │
│                         │
│                         │
│                         │
│ ┌─────────────────────┐ │
│ │ Message...  📎 🎙 ➤│ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

### Agent — link confirmation

```
┌─────────────────────────┐
│ ☰ Sunder          ▾     │
├─────────────────────────┤
│                         │
│ Sunder:                 │
│ Transcribed your 45-min │
│ meeting.                │
│                         │
│ Call with John Smith —   │
│ Portfolio Review?        │
│                         │
│ ┌────────┐ ┌──────┐    │
│ │Confirm │ │Change│    │
│ └────────┘ └──────┘    │
│                         │
│                         │
│                         │
│ ┌─────────────────────┐ │
│ │ Message...  📎 🎙 ➤│ │
│ └─────────────────────┘ │
└─────────────────────────┘

Confirm → same summary + suggested actions.
User scrolls, checks/unchecks, taps Run selected.
Same flow, same outcome as desktop.
```

## Dependencies / Assumptions

- Groq Whisper API accepts WebM/Opus and MP4/AAC (the formats MediaRecorder produces across browsers)
- Vercel function timeout (300s) is sufficient to receive the upload and kick off transcription (transcription can be async — fire and forget to Groq, poll or webhook for result)
- Agent trigger infrastructure (autopilot/pulse system) can fire a `meeting_transcribed` event

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] What's the max file size Vercel functions can receive? May need to upload directly to Supabase Storage via presigned URL and notify the API separately.
- [Affects R4][Technical] How to handle Groq transcription async — does Groq have a webhook/callback, or do we poll? Need to check if the 300s Vercel timeout is sufficient for long recordings.
- [Affects R2][Needs research] Which `MediaRecorder` mimeType to use as default, and how to detect browser support at runtime. Chrome = WebM/Opus, Safari = MP4/AAC.
- [Affects R8][Technical] Exact storage path convention for meeting files — per-person vs. shared meetings folder.
- [Affects R5][Technical] How the agent trigger fires after transcription completes — reuse existing autopilot infrastructure or create a new trigger type.

## Prior Research

Extensive research conducted across multiple documents:

| Document | What it covers |
|---|---|
| `2026-04-05-meeting-recorder-final.md` | Full architecture sketch, all options ranked, OSS stack, cost analysis |
| `2026-04-05-meeting-recorder-options-ranked.md` | 9 approaches ranked by effort/cost/diarization |
| `2026-04-05-meeting-recorder-research-prompt.md` | Research prompt for OSS recorder evaluation |
| `2026-04-05-web-app-audio-capture-research-prompt.md` | Research prompt for browser audio capture patterns |

### OSS References

| Repo | Stars | Relevance |
|---|---|---|
| [RecordRTC](https://github.com/muaz-khan/RecordRTC) | 6,900 | Cross-browser MediaRecorder wrapper — potential dependency or pattern reference |
| [MediaStreamRecorder](https://github.com/streamproc/MediaStreamRecorder) | 2,700 | Chunked blob submission pattern |
| [ElevenLabs STT examples](https://github.com/elevenlabs/examples/tree/main/speech-to-text) | — | Browser capture → STT API pattern |
| [Deepgram dg_react_agent](https://github.com/deepgram/dg_react_agent) | — | React/Next.js recording lifecycle hooks |
| [Meetily](https://github.com/Zackriya-Solutions/meetily) | 10,000 | MIT, Tauri — white-label candidate for future desktop app |

## Next Steps

→ `/plan` for structured implementation planning
