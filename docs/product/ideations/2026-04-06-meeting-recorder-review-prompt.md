# Review Prompt: Meeting Recorder Plan

**Date:** 2026-04-06
**For:** Dev reviewer
**Time needed:** ~30 min

## What to review

We're adding a meeting recorder to Sunder — the advisory sales AI agent. Users record meetings directly in the web app, the agent transcribes them via Groq Whisper, suggests a CRM link, and offers follow-up actions (create tasks, update deals, draft emails).

**Read these in order:**

1. **Requirements doc** — `docs/product/ideations/2026-04-06-meeting-recorder-requirements.md`
   - The WHAT. Product decisions, UX flow diagrams (desktop + mobile), scope boundaries, what we're NOT building.

2. **Implementation plan** — `docs/product/plans/2026-04-06-001-feat-meeting-recorder-plan.md`
   - The HOW. Three phases: backend pipeline → recording UI → agent prompt engineering. Architecture diagram, database schema, acceptance criteria.

## Key decisions already made (don't re-litigate)

- **Mic-only for v1** — no tab audio capture (`getDisplayMedia`). Same limitation as Notion's browser version. Covers speakerphone + in-person.
- **Groq Whisper Turbo** — $0.04/hr, 228x realtime. Batch, not streaming.
- **No extension, no desktop app** — pure browser APIs. Desktop app = white-label Meetily (MIT, Tauri) later if demand exists.
- **No diarization** — agent infers speakers from CRM context.
- **Presigned URL upload** — Vercel's 4.5MB body limit means audio goes direct to Supabase Storage.

## What I need from you

1. **Architecture sanity check** — Does the presigned URL → ingest → Groq → agent run pipeline make sense? Any gotchas with Vercel function timeout for the Groq transcription step?

2. **Database schema** — Is `meeting_records` the right shape? Should linked person/company/deal be separate junction table vs. nullable FKs? Do we need an `interactions` record too?

3. **Client-side recording** — The plan uses a custom `use-audio-recorder` hook with raw `getUserMedia` + `MediaRecorder`. Should we use RecordRTC (6.9k stars) as a dependency instead? Tradeoff is bundle size vs. cross-browser reliability.

4. **Agent flow** — The post-meeting agent run uses `ask_user_question` for CRM link confirmation and action selection. Is this the right tool, or should we build a custom meeting-specific UI component?

5. **Anything missing?** — Edge cases, error handling, security concerns, things we'll regret not thinking about.

## Background research (optional, if you want more context)

| Doc | What it covers |
|---|---|
| `docs/product/ideations/2026-04-05-meeting-recorder-final.md` | Full research synthesis — all 9 options ranked, competitor analysis (Granola/Notion/Attio), OSS stack, cost analysis |
| `docs/product/ideations/2026-04-05-meeting-recorder-options-ranked.md` | Why we chose browser web app over extension/desktop/bot |
| `docs/product/ideations/2026-04-05-web-app-audio-capture-research-prompt.md` | Browser audio capture API research |
