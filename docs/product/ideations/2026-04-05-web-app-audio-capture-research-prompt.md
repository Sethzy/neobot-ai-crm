# Research Prompt: Open-Source Web App Audio Capture for Meeting Recording

**Date:** 2026-04-05
**Owner:** TBD
**Status:** Draft
**Context:** We're building a meeting recorder into Sunder (Next.js web app). No extension, no desktop app — pure browser APIs. User clicks "Record" in the web app, audio gets captured, uploaded, transcribed, and the AI agent acts on it.

## What We're Looking For

Open-source repos, demos, or reference implementations that show a **web app** (not an extension, not a desktop app) capturing audio from a meeting and doing something useful with it — recording, transcribing, streaming to an API, etc.

Two browser APIs are in play:

1. **`getDisplayMedia({ audio: true })`** — captures tab/system audio on desktop Chrome/Edge. Triggers a screen-share picker dialog. This is how we'd record the remote participant's voice.
2. **`getUserMedia({ audio: true })`** — captures mic input. Works everywhere including mobile. This is how we'd record the local participant's voice, or do speakerphone/in-person recording on mobile.

We need repos that demonstrate one or both of these in a real app context — not just MDN examples.

## Specific Things to Find

### 1. Web apps that record meetings via getDisplayMedia
- Any web app (React, Next.js, vanilla, anything) that calls `getDisplayMedia` with audio, records via `MediaRecorder`, and saves/uploads the result
- How do they handle the picker dialog UX? Do they guide the user to select the right tab and check "Also share tab audio"?
- Do they strip the video track and keep audio-only to reduce file size?
- How do they handle the "sharing this tab" banner that Chrome shows?

### 2. Web apps that mix tab audio + mic into one recording
- This is the key UX question: user wants BOTH sides of the conversation (tab audio from Meet/Zoom + their own mic) in one file
- How is the mixing done? `AudioContext` with two `MediaStreamSource` nodes merged?
- Any gotchas with echo cancellation when mixing?

### 3. Web apps that stream browser-captured audio to a transcription API
- Specifically: `getDisplayMedia` or `getUserMedia` → chunked streaming to Deepgram, AssemblyAI, Whisper API, or any STT backend
- WebSocket streaming from the browser vs. upload-after-recording (batch)
- Any real-time transcription web apps that work without an extension?

### 4. Web apps that do mic-only recording on mobile
- Progressive web apps or responsive web apps that record via `getUserMedia` on iOS Safari and Android Chrome
- How do they handle iOS Safari's quirks? (permission persistence, background recording, audio session interruptions)
- Does recording survive the user switching apps on mobile? (e.g., user opens Sunder, hits record, switches to phone app for the call)

### 5. MediaRecorder patterns and file handling
- Best practices for `MediaRecorder` output format (WebM/Opus vs MP4/AAC for Safari compatibility)
- Chunked upload during recording vs. single upload after stop
- File size expectations for 30/60/90 min meetings (audio-only)
- Any repos that handle the `dataavailable` event well for long recordings (memory management)

## What the Deliverable Should Look Like

For each repo or reference found:

1. **Link** — GitHub repo or live demo URL
2. **What it does** — one paragraph
3. **Stack** — language, framework, relevant browser APIs used
4. **Audio capture method** — getDisplayMedia, getUserMedia, or both
5. **Does it mix tab + mic?** — yes/no, how
6. **Does it stream or batch?** — real-time to an API, or record-then-upload
7. **Mobile support** — tested on iOS Safari / Android Chrome?
8. **Quality of implementation** — stars, maintenance, code quality, any gotchas noted in issues
9. **What we can steal** — specific patterns, utility functions, or architectural decisions worth adopting

Also look for:
- Blog posts or tutorials that walk through building this (not just API docs)
- Stack Overflow answers with working code for the tricky parts (mixing, mobile, Safari compat)
- Any known limitations or browser bugs that would affect us

## What We're NOT Looking For

- Chrome extensions (we're covering that separately)
- Desktop apps (Electron, Tauri, etc.)
- Meeting bot APIs (Recall.ai, etc.)
- Paid SaaS products with no visible source code
- Whisper/transcription model repos (we're covering the transcription layer separately — this prompt is about the audio CAPTURE in the browser)

## Context: Why This Matters

Our users are solo advisory sales professionals (financial planners, insurance agents, real estate agents). They're on calls all day, on both desktop and mobile. The recording needs to be:

- **Zero install** — works in the browser they already use
- **One click** (or as close as possible)
- **Cross-platform** — desktop Chrome for video calls, mobile Safari/Chrome for phone calls and in-person meetings
- **Reliable** — can't lose a 60-minute client call because of a browser quirk

The captured audio gets uploaded to our server, transcribed (Whisper/Deepgram), and fed to an AI agent that updates the CRM, creates tasks, and drafts follow-ups. We don't need real-time transcription in v1 — batch (record → upload → transcribe) is fine.
