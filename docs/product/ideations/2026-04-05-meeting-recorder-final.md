# Sunder Meeting Recorder — Final Ideation

**Date:** 2026-04-05
**Status:** Ready for planning
**Decision:** Build a browser-native meeting recorder into the Sunder web app using standard Web APIs + Groq Whisper for transcription. No extension, no desktop app for v1.

---

## The Pitch

User has a client call. Sunder records it. Agent transcribes it, summarizes it, updates the CRM, creates tasks from action items, and drafts a follow-up email — all automatically. User approves the follow-up in 30 seconds and moves to their next call.

This is the feature that makes Sunder indispensable. Every meeting compounds the agent's memory. Every call makes the CRM more accurate without the user touching it.

---

## How Competitors Do It

| Product | Capture Method | CRM Integration | Post-Meeting |
|---|---|---|---|
| **Granola** | Desktop app, system audio tap, no bot | Share menu → Attio/HubSpot | Enhanced notes from user notes + transcript |
| **Attio** | Bot joins call (recall.ai) | Native — IS the CRM | Transcripts + custom insight templates on records |
| **Notion** | Desktop app, system audio tap, no bot | External integrations | AI summaries + action items → tasks |

**Our advantage:** We're like Attio (we ARE the CRM) but our agent ACTS on the transcript. Not just notes on a record — autonomous CRM updates, task creation, follow-up drafting.

---

## User Experience

```
Sarah is a financial planner. She has a 2pm portfolio review
with John Smith on Google Meet.

1. Sarah opens Google Meet in Chrome.

2. Sarah opens Sunder in another tab, clicks "Record Meeting."
   Chrome shows the tab picker → she selects the Meet tab,
   checks "Also share tab audio," clicks Share.
   (On mobile: just clicks Record — mic captures the room.)

3. A red dot and timer appear in Sunder. Sarah has her meeting.
   45 minutes. Audio is chunked and saved locally in the browser
   as a safety net.

4. Meeting ends. Sarah clicks Stop.
   Audio uploads to Sunder (~15MB for 45 min).

   She sees: "Processing your meeting with John Smith..."

5. ~30 seconds later (Groq is 228x realtime), the agent posts:

   "Done processing your meeting. Here's what I did:

    Meeting summary → memory/meetings/2026-04-05-john-smith.md

    ✅ Created task: Send updated portfolio allocation (due Apr 8)
    ✅ Created task: Follow up on life insurance quote (due Apr 10)
    ✅ Updated deal 'Smith Family Portfolio Review' → Proposal stage
    ✅ John mentioned wanting to increase retirement contributions

    ✉️ Draft follow-up email ready for review [Approve / Edit]"

6. Sarah taps Approve. Done. Back to her next call.
```

### Mobile Experience

```
Sarah takes a call on her phone at a coffee shop.

1. Opens Sunder on mobile Safari/Chrome.
2. Taps "Record Meeting" → mic starts capturing.
   UI shows: "Recording from microphone — use speakerphone
   for best results."
3. Has her meeting on speakerphone (or in-person across table).
4. Taps Stop → uploads → same agent pipeline.
```

---

## Architecture

```
┌───────────────────────────────────────────────────┐
│  SUNDER WEB APP (Next.js — already exists)        │
│                                                   │
│  Desktop Chrome/Edge:                             │
│    getDisplayMedia({ audio: true }) → tab audio   │
│    getUserMedia({ audio: true })    → mic audio   │
│    AudioContext mixer               → merged      │
│    MediaRecorder (5s timeslice)     → WebM chunks │
│    IndexedDB                        → crash safety│
│    On stop: POST /api/meetings/upload             │
│                                                   │
│  Mobile Safari/Chrome:                            │
│    getUserMedia({ audio: true })    → mic only    │
│    MediaRecorder (5s timeslice)     → WebM/MP4    │
│    On stop: POST /api/meetings/upload             │
│                                                   │
│  Any platform (already works today):              │
│    Paste transcript into chat                     │
│    Agent processes it immediately                 │
└────────────────────────┬──────────────────────────┘
                         │
                         ▼
┌───────────────────────────────────────────────────┐
│  SUNDER API (Vercel)                              │
│                                                   │
│  POST /api/meetings/upload                        │
│    → Save WebM to Supabase Storage                │
│      /{client_id}/meetings/raw/2026-04-05.webm    │
│    → Call Groq Whisper API (batch)                │
│      whisper-large-v3-turbo                       │
│      ~$0.04/hr, 228x realtime                     │
│      60min meeting → transcript in ~15 seconds    │
│    → Save transcript to Supabase Storage          │
│      /{client_id}/meetings/2026-04-05-john.md     │
│    → Insert meeting_records row                   │
│    → Fire autopilot trigger: meeting_transcribed  │
└────────────────────────┬──────────────────────────┘
                         │
                         ▼
┌───────────────────────────────────────────────────┐
│  AGENT RUN (existing runner infrastructure)       │
│                                                   │
│  Trigger: meeting_transcribed                     │
│  Context loaded:                                  │
│    - Full transcript                              │
│    - Participants' CRM records                    │
│    - Deal state                                   │
│    - Previous meeting notes                       │
│    - SOUL.md (relationship context)               │
│                                                   │
│  Agent actions:                                   │
│    → write_file: meeting summary                  │
│    → crm_create: tasks from action items          │
│    → crm_update: deal stage, person notes         │
│    → write_file: update MEMORY.md                 │
│    → draft follow-up (approval gate)              │
└───────────────────────────────────────────────────┘
```

### Why This Architecture

- **No extension needed for v1.** `getDisplayMedia` + `getUserMedia` are standard browser APIs. The picker dialog (3 extra clicks) is acceptable friction to avoid building/maintaining/distributing an extension.
- **No desktop app.** Eliminates Rust/Tauri skill set, code signing, notarization, auto-updates, Homebrew distribution.
- **No bot.** Advisory sales professionals cannot have a bot join client calls. System audio tap via browser APIs is invisible.
- **Batch, not streaming.** The agent acts after the meeting, not during. Record → upload → transcribe is simpler, cheaper, and more reliable than WebSocket streaming.
- **Groq kills the cost problem.** $0.04/hr is essentially free. A heavy user (4 hrs/day) costs ~$5/mo.

---

## Decisions Made

### Recording: Browser Web APIs (no extension, no desktop app)

| Approach | Desktop | Mobile | Friction | Effort | Decision |
|---|---|---|---|---|---|
| **Web app + getDisplayMedia** | Tab audio (picker dialog) | Mic only | Medium | S | **v1 — ship this** |
| Chrome extension + tabCapture | Tab audio (no picker) | N/A | Low | M | v2 polish |
| Desktop app (Meetily/Tauri) | System audio | N/A | High (install) | L | v3 maybe |

### Transcription: Groq Whisper Turbo (batch API)

| Provider | Type | Price/hr | Free Tier | Diarization | Decision |
|---|---|---|---|---|---|
| **Groq Whisper Turbo** | Batch | **$0.04** | Yes (generous) | No | **v1 — use this** |
| AssemblyAI | Batch + Stream | $0.15 | $50 credit | Yes | v1 fallback if diarization needed |
| Deepgram Nova-3 | Batch + Stream | $0.46 | $200 credit | Yes | Too expensive for batch |
| ElevenLabs Scribe | Batch + Stream | $0.22-0.40 | Plan included | No | No advantage over Groq |
| OpenAI Whisper | Batch | $0.36 | No | No | Expensive, no diarization |

**Diarization strategy:** Skip it in v1. The agent has CRM context (who's on the call, deal stage, relationship history) and can infer who said what from a raw transcript. If that fails, bolt on AssemblyAI batch ($0.15/hr) for speaker labels.

### OSS Stack to Reference

**Audio capture layer:**
| Repo | Stars | What we take from it |
|---|---|---|
| [RecordRTC](https://github.com/muaz-khan/RecordRTC) | 6,900 | Cross-browser MediaRecorder wrapper. Handles quirks, pause/resume, getDisplayMedia. Could use as a dependency or reference the patterns. |
| [MediaStreamRecorder](https://github.com/streamproc/MediaStreamRecorder) | 2,700 | Chunked blob submission at intervals. The timeslice pattern. |
| [addpipe/getDisplayMedia-demo](https://github.com/addpipe/getDisplayMedia-demo) | 44 | Clean reference impl of tab audio + mic mixing via AudioContext. Small, readable. |

**Transcription integration layer:**
| Repo | Stars | What we take from it |
|---|---|---|
| [ElevenLabs STT examples](https://github.com/elevenlabs/examples/tree/main/speech-to-text) | (ElevenLabs org) | Browser capture → transcription API pattern from a major lab. |
| [Deepgram dg_react_agent](https://github.com/deepgram/dg_react_agent) | (Deepgram org) | React/Next.js hooks for recording lifecycle. Closest to our stack. |
| [AssemblyAI realtime-transcription-browser-js-example](https://github.com/AssemblyAI/realtime-transcription-browser-js-example) | (AssemblyAI org) | AudioWorklet resampling + token proxy. The streaming pattern for v2. |

**Key blog post:**
- [webrtcHacks — Using getDisplayMedia for local recording with audio on Jitsi](https://webrtchacks.com/jitsi-recording-getdisplaymedia-audio/) — best walkthrough of the mixing pattern with all gotchas explained.

---

## Key Technical Details

### Audio Capture (Client-Side)

**Desktop Chrome/Edge — tab audio + mic:**
```
getDisplayMedia({ video: true, audio: true })
  → verify stream.getAudioTracks().length > 0
  → strip video track (keep audio only)
  
getUserMedia({ audio: { echoCancellation: true } })

AudioContext:
  → createMediaStreamSource(tabStream)
  → createMediaStreamSource(micStream)
  → GainNode for each (balance volumes)
  → connect both → MediaStreamDestinationNode
  → destination.stream → mixed audio

MediaRecorder(mixedStream, { mimeType: 'audio/webm;codecs=opus' })
  → .start(5000)  // 5-second chunks
  → ondataavailable → save chunk to IndexedDB
  → onstop → combine chunks → upload
```

**Mobile — mic only:**
```
getUserMedia({ audio: true })
MediaRecorder(micStream)
  → same chunking/upload pattern
  → UI warning: "Use speakerphone for best results"
```

**Picker dialog mitigation:**
1. Show a pre-share instructional modal before calling `getDisplayMedia`
2. Visual guide: "Select your meeting tab → Check 'Also share tab audio'"
3. After: verify audio tracks exist. If 0, show "Audio not detected — try again"

### File Sizes

| Duration | Size (Opus 64kbps) |
|---|---|
| 30 min | ~14 MB |
| 60 min | ~29 MB |
| 90 min | ~43 MB |

A single POST upload is fine for these sizes. S3 multipart is overkill.

### Reliability

- **Chunking:** `MediaRecorder.start(5000)` — 5-second chunks
- **Persistence:** Each chunk saved to IndexedDB on `dataavailable`. Survives tab crash.
- **Upload:** Single POST after recording stops. Retry on failure (chunks still in IndexedDB).
- **Format detection:** `MediaRecorder.isTypeSupported()` at runtime. Chrome → WebM/Opus, Safari → MP4/AAC.

### Cross-Browser Support

| | Desktop Chrome/Edge | Desktop Firefox | Desktop Safari | Mobile Chrome | Mobile Safari |
|---|---|---|---|---|---|
| Tab audio (getDisplayMedia) | Yes | Partial | No | No | No |
| Mic (getUserMedia) | Yes | Yes | Yes | Yes | Yes |
| MediaRecorder | Yes (WebM) | Yes (WebM) | Yes (MP4) | Yes | Yes |
| **Sunder experience** | Full (tab + mic) | Mic only | Mic only | Mic only | Mic only |

**Tier 1 (full):** Desktop Chrome/Edge — tab audio + mic
**Tier 2 (mic only):** Everything else — works for speakerphone/in-person

---

## Phasing

### Phase 0 — Already Done
Paste transcript into Sunder chat. Agent processes it. No recording needed.

### Phase 1 — Web App Recording (this feature)
- Record button in Sunder web app
- `getDisplayMedia` + `getUserMedia` + AudioContext mixer
- MediaRecorder with IndexedDB chunking
- Upload to Supabase Storage
- Groq Whisper transcription
- Agent trigger: `meeting_transcribed`
- Agent prompt engineering for post-meeting actions
- Mobile mic-only mode
- **Effort: M (2-4 weeks)**

### Phase 2 — Chrome Extension (polish)
- Removes the picker dialog for power users
- `tabCapture` API — one click, invisible
- Same backend — just uploads to the same `/api/meetings/upload`
- $5 to publish, 1-3 day review
- **Effort: S (1-2 weeks)**

### Phase 3 — Diarization (if needed)
- Only if the agent struggles without speaker labels
- AssemblyAI batch API ($0.15/hr) for speaker attribution
- Or: Groq transcription + pyannote.audio self-hosted
- **Effort: S (days)**

### Phase 4 — Real-Time Streaming (later)
- WebSocket streaming to AssemblyAI or Deepgram
- Live transcript panel during calls
- AudioWorklet resampling + token proxy pattern
- **Effort: M-L**

### Phase 5 — Desktop App (much later, if ever)
- Tauri wrapper for system audio capture (phone calls, desktop Zoom)
- Fork Meetily patterns
- **Effort: L-XL**

---

## Costs

| Usage Level | Calls/Day | Groq Cost/Mo | Notes |
|---|---|---|---|
| Light | 1-2 hrs | ~$2.40 | Easily absorbed |
| Medium | 3-4 hrs | ~$4.80 | Still basically free |
| Heavy | 5-6 hrs | ~$7.20 | Cheaper than a coffee |
| Add diarization | +AssemblyAI | +$9-23/mo | Only if needed |

**Total infrastructure cost per user: $3-8/mo.** Trivially absorbed into any subscription pricing.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Users forget to check "Share tab audio" | High | Medium | Pre-share modal + post-capture verification + retry flow |
| iOS Safari background recording kills mic | Medium | Medium | "Keep Sunder open during the call" warning. PWA with silent audio hack. |
| Groq rate limits at scale | Low | Medium | Fall back to AssemblyAI or OpenAI Whisper batch |
| Agent can't infer speakers without diarization | Medium | Low | Bolt on AssemblyAI batch. Low effort, low cost. |
| Chrome changes getDisplayMedia API | Low | High | Standard W3C API. Breaking changes are rare and well-telegraphed. |
| Long recording (90+ min) memory issues | Low | High | IndexedDB chunking handles this. Proven pattern. |

---

## What We're NOT Building

- Meeting bot that joins calls (dealbreaker for advisory sales)
- Desktop app (distribution burden too high for v1)
- Real-time streaming transcription (batch is fine, agent acts after)
- Live transcript panel during calls (v4+)
- Calendar integration for auto-detection (v3+)
- Video recording (audio only — transcription doesn't need video)

---

## Prior Research (Reference)

All research artifacts from this exploration:

| File | Contents |
|---|---|
| `docs/product/ideations/2026-04-05-meeting-recorder-research-prompt.md` | Research prompt for evaluating OSS meeting recorders |
| `docs/product/ideations/2026-04-05-meeting-recorder-options-ranked.md` | All 9 options ranked with effort/cost/diarization analysis |
| `docs/product/ideations/2026-04-05-web-app-audio-capture-research-prompt.md` | Research prompt for browser audio capture OSS repos |
| `granola-alternatives.json` | Granola/Meetily/Char/Amurex/Vexa comparison |
| `meeting-recorder-products-research*.json` | Notion/Attio/Granola product research |
| `chrome-ext-tabcapture-audio-transcription.json` | Chrome extension tabCapture research |
| `realtime-transcription-apis.json` | Deepgram/AssemblyAI/Whisper WASM comparison |
| `deepgram-*.json`, `assemblyai-*.json` | Provider-specific pricing and API research |
