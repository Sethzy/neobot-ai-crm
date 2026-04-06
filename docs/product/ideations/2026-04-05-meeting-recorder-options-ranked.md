# Meeting Recorder: All Options Ranked

**Date:** 2026-04-05
**Context:** Sunder needs meeting recording → transcription → agent acts on it. User cannot handroll the whole thing. Must lean heavily on OSS. Advisory sales = bot-free, invisible, zero-friction.

---

## The Options (Ranked)

### Rank 1: Chrome Extension + Deepgram Streaming API

**What you'd build:** Fork [recallai/chrome-recording-transcription-extension](https://github.com/recallai/chrome-recording-transcription-extension) (MIT, MV3, complete reference impl). Replace their caption-scraping with a WebSocket stream to Deepgram's Nova-3 API. Deepgram returns real-time diarized transcripts. Your Sunder API ingests them.

**OSS you'd lean on:**
- `recallai/chrome-recording-transcription-extension` — tab capture, offscreen doc, mic mixing, audio routing. All the hard Chrome API work is done.
- `@deepgram/sdk` v5 — browser-compatible WebSocket client, confirmed working in Chrome extensions (G2 reviews).

**What you'd write yourself:**
- Extension UI (record button, status indicator, meeting detection)
- WebSocket bridge from MediaRecorder chunks → Deepgram stream
- `POST /api/meetings/ingest` endpoint on Sunder API
- Agent trigger (`meeting_ended`) and prompt engineering for post-meeting actions

**Diarization:** Yes — Deepgram Nova-3 has native speaker diarization. No extra work.

**Cost:** ~$0.46/hr (Nova-3 streaming). $200 free credit to start (~433 hrs). A user doing 4 hrs of calls/day = ~$44/mo.

**Effort:** S-M. Extension fork is 80% done. Main work is Deepgram integration + Sunder ingest endpoint.

**Why #1:** Fastest to ship. Proven stack. Diarization included. Bot-free. Works on every meeting platform in the browser. No desktop app needed. You're building product logic, not audio infrastructure.

---

### Rank 2: Chrome Extension + AssemblyAI Streaming

**Identical to Rank 1** but swap Deepgram for AssemblyAI's Universal-Streaming.

**Why it's #2 not #1:**
- Cheaper: $0.15/hr (vs $0.46/hr). That's $14/mo for a heavy user vs $44/mo.
- Unlimited WebSocket concurrency (vs Deepgram's 150 on PAYG).
- But: less proven in Chrome extension contexts. Deepgram has confirmed extension usage.
- AssemblyAI also offers self-hosted containers (Kubernetes/ECS) if you need to go on-prem later.

**Diarization:** Check — AssemblyAI supports it in streaming, but verify quality vs Deepgram.

**Effort:** S-M. Same as Rank 1.

---

### Rank 3: Transcript Ingest Only (No Recording)

**What you'd build:** A "Meeting Notes" section in Sunder where the user either:
- Uploads an audio file → server-side transcription via Deepgram/AssemblyAI batch API
- Pastes a transcript from Granola/Otter/any recorder they already use
- Uploads a `.webm`/`.mp3` from Voice Memos or any phone recorder

Agent processes whatever lands, same as the extension path.

**OSS you'd lean on:**
- Nothing for capture — user brings their own
- Deepgram/AssemblyAI batch API for audio file transcription ($0.0043/min Deepgram)

**What you'd write yourself:**
- File upload UI + drag-and-drop
- `/api/meetings/ingest` endpoint (accepts audio or text)
- Agent trigger + prompt engineering (same as Rank 1)

**Diarization:** Depends on source. Deepgram batch has it. Pasted text won't.

**Effort:** S. Smallest scope. Could ship in a week.

**Why #3:** Ships the *agent value prop* without building a recorder. "Record with whatever you want, paste it into Sunder, the agent does the rest." This is the smart Phase 0 that validates demand before investing in the extension. But it's friction — user has to remember to do it.

---

### Rank 4: Chrome Extension + Self-Hosted WhisperLive

**What you'd build:** Fork the Recall AI extension (same as Rank 1). Stream audio to a self-hosted [Collabora WhisperLive](https://github.com/collabora/WhisperLive) server (Apache-2.0, 3.9k stars). WhisperLive already includes Chrome + Firefox extension code in `Audio-Transcription-Chrome/`.

**OSS you'd lean on:**
- `recallai/chrome-recording-transcription-extension` or WhisperLive's own extension code
- `collabora/WhisperLive` — battle-tested WebSocket Whisper server, optional TensorRT acceleration
- `pyannote.audio` — bolt on for diarization (WhisperLive doesn't include it natively)

**What you'd write yourself:**
- Diarization pipeline (pyannote post-processing)
- Server infrastructure (Docker on Fly.io / Railway / your own box)
- Same Sunder ingest + agent trigger

**Diarization:** DIY. Must add pyannote.audio pipeline. Medium complexity.

**Cost:** Server compute only. No per-minute API fees. But you're running GPU instances.

**Effort:** M-L. WhisperLive is solid but you need to host it, add diarization, and maintain it.

**Why #4:** Best for privacy-sensitive clients (everything self-hosted). But more ops burden. Good as a Tier 2 option after shipping Rank 1 or 2.

---

### Rank 5: Chrome Extension + In-Browser Whisper (WASM)

**What you'd build:** Use [Local-Whisper-Captions-Chrome-Extension](https://github.com/alex-903/Local-Whisper-Captions-Chrome-Extension-) as reference. Tab audio → `@xenova/transformers` (ONNX Whisper) → WebGPU → transcription entirely in-browser.

**OSS you'd lean on:**
- `alex-903/Local-Whisper-Captions-Chrome-Extension-` — complete impl
- `@xenova/transformers` (Transformers.js) — Whisper ONNX runtime for browser

**What you'd write yourself:**
- Diarization (doesn't exist in browser — this is the blocker)
- Chunking/dedup logic (Whisper processes 30s chunks, needs sliding window)
- Integration with Sunder API

**Diarization:** No. No browser-side diarization library exists. Dealbreaker for knowing who said what.

**Performance:** 2-3s latency, 500MB+ RAM, drains battery. Whisper hallucinates during silence.

**Effort:** M. Extension exists but diarization gap is unsolvable client-side.

**Why #5:** Cool for privacy flex. Useless without diarization. The 500MB RAM + battery drain is rough for a user on calls all day. Only viable as a fallback for edge cases.

---

### Rank 6: Desktop App — Fork Meetily

**What you'd build:** Fork [Meetily](https://github.com/Zackriya-Solutions/meetily) (MIT, 10k stars, Rust/Tauri). It already does system audio capture, local Whisper/Parakeet transcription, and has a REST API. Add a Supabase sync layer.

**OSS you'd lean on:**
- `Zackriya-Solutions/meetily` — full desktop app with audio capture, transcription, UI

**What you'd write yourself:**
- Supabase Storage sync (upload transcripts to `memory/meetings/`)
- Diarization (Community Edition claims it but unverified — may need pyannote fallback)
- Distribution pipeline (Homebrew, auto-update, code signing)

**Diarization:** Claimed but unverified in CE. Risky.

**Effort:** L. You're now maintaining a Rust/Tauri desktop app. Different skill set. Distribution is a whole thing (code signing, notarization, auto-updates).

**Why #6:** Captures phone calls and desktop Zoom (which the extension can't). But the build/maintain burden is massive. This is a v2/v3 play, not v1.

---

### Rank 7: Desktop Agent — Screenpipe Integration

**What you'd build:** User installs [Screenpipe](https://github.com/screenpipe/screenpipe) (MIT, Rust) as a background service. It captures 24/7 screen + audio. You write a custom "Pipe" (Screenpipe's plugin system) that detects meetings and syncs transcripts to Sunder.

**OSS you'd lean on:**
- `screenpipe/screenpipe` — 24/7 capture engine, REST API on localhost:3030, built-in diarization (ONNX), MCP server

**What you'd write yourself:**
- A Screenpipe "Pipe" (markdown-defined agent) for meeting detection + Sunder sync
- User onboarding flow for installing Screenpipe

**Diarization:** Yes — built-in ONNX speaker embeddings.

**Effort:** M. The Pipe is simple. But asking users to install and run a 24/7 background capture engine is a big ask for a solo practitioner. Privacy concerns. Battery/resource drain.

**Why #7:** Most powerful long-term (agent has access to everything the user sees/hears). But the "always recording everything" pitch is terrifying for advisory sales professionals handling client financials. Wrong audience fit.

---

### Rank 8: Desktop App — Muesli / Meeting Transcriber

**What you'd build:** Fork [Muesli](https://github.com/muesli) or [Meeting Transcriber](https://github.com/) — smaller MIT-licensed macOS apps using ScreenCaptureKit + FluidAudio for diarization.

**OSS you'd lean on:**
- Smaller projects, fewer stars, less community

**Diarization:** FluidAudio (pyannote CoreML / Sortformer) — actually the best diarization of any option. Handles overlapping speech.

**Effort:** M-L. macOS 14.2+ only. Small community = you're on your own for bugs.

**Why #8:** Great diarization, but tiny community, macOS-only, same desktop app distribution burden as Rank 6.

---

### Rank 9: Recall.ai Managed API

**What you'd build:** Use Recall.ai's API. They handle everything — recording, transcription, storage.

**Why it's last:**
- Their **Meeting Bot API** = bot joins call. Dealbreaker.
- Their **Desktop Recording SDK** = no bot, native capture. But it's not OSS, pricing is sales-negotiated, and you're locked into their platform.
- You wanted OSS. This is the opposite.

---

## The Decision Matrix

| | OSS Leverage | Build Effort | Diarization | Bot-Free | Works Everywhere | Cost/Meeting | Ship Speed |
|---|---|---|---|---|---|---|---|
| **1. Ext + Deepgram** | High | S-M | Native | Yes | Browser meetings | ~$0.46/hr | Fastest |
| **2. Ext + AssemblyAI** | High | S-M | Native | Yes | Browser meetings | ~$0.15/hr | Fast |
| **3. Transcript Ingest** | N/A | S | Depends | N/A | Any source | ~$0.26/hr batch | Fastest |
| **4. Ext + WhisperLive** | High | M-L | DIY (pyannote) | Yes | Browser meetings | Server compute | Medium |
| **5. Ext + WASM Whisper** | Medium | M | None | Yes | Browser meetings | Free | Medium |
| **6. Meetily Fork** | High | L | Unverified | Yes | All (incl phone) | Free (local) | Slow |
| **7. Screenpipe** | High | M | Native | Yes | All | Free (local) | Medium |
| **8. Muesli** | Low | M-L | Best | Yes | macOS only | Free (local) | Slow |
| **9. Recall.ai API** | None | S | Native | No (bot) | All platforms | Sales pricing | Fast |

## Recommended Phasing

**Phase 0 (ship in 1 week):** Rank 3 — Transcript Ingest. Upload audio or paste text. Agent processes it. Validates demand.

**Phase 1 (ship in 2-4 weeks):** Rank 1 or 2 — Chrome Extension + Deepgram/AssemblyAI. Native recording UX. Zero friction. Full diarization. This is the product.

**Phase 2 (later, if needed):** Rank 4 — Self-hosted WhisperLive option for privacy-tier clients. And/or Rank 6 — Desktop app for phone call recording.
