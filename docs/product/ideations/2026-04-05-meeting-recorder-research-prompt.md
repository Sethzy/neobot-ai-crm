# Research Prompt: Open-Source Meeting Recorder for Sunder Integration

**Date:** 2026-04-05
**Owner:** TBD
**Status:** Draft

## Objective

Validate whether **Meetily** (github.com/Zackriya-Solutions/meetily) is the best open-source meeting recorder to integrate into Sunder, or if a better candidate exists. Sunder is an AI agent for advisory sales professionals — the meeting recorder would feed transcripts and summaries into the agent's memory and CRM automatically.

## What We Need From the Tool

Non-negotiable requirements:

1. **Open source with a permissive license** (MIT, Apache-2.0, or equivalent). We will self-host and modify.
2. **Bot-free recording** — must capture system audio without joining the call as a visible participant. Advisory sales pros meet clients; a bot joining is a dealbreaker.
3. **Speaker diarization** — must attribute speech to individual speakers. Without this, the agent can't know who said what.
4. **Structured output** — transcripts must be extractable as text (JSON, markdown, plain text). We need to pipe them into our agent programmatically, not just display them in a UI.
5. **Self-hostable** — must run on our infra or the user's machine. No mandatory SaaS dependency.
6. **macOS support minimum** — our users are overwhelmingly on Mac. Windows is nice-to-have.
7. **Works across meeting platforms** — Google Meet, Zoom, Teams at minimum. Platform-specific solutions (Chrome extension only) are insufficient.

Strong preferences:

8. **Local transcription option** — ability to run Whisper or equivalent locally for privacy-sensitive clients (insurance, financial planning).
9. **API or CLI interface** — headless/programmatic access for automation, not just a GUI.
10. **Active maintenance** — recent commits (last 3 months), responsive maintainer, growing community.
11. **Reasonable resource footprint** — should run on a standard MacBook without melting it.

## Candidates to Evaluate

Start with these, but add any others you find:

| Candidate | Repo | Why included |
|-----------|------|-------------|
| **Meetily** | github.com/Zackriya-Solutions/meetily | MIT, 10k+ stars, Rust backend, Whisper.cpp, Docker |
| **Char** | char.com | Open source, markdown-native, BYO AI provider |
| **Amurex** | github.com/thepersonalaicompany/amurex | Open source, Chrome extension, follow-up drafting |
| **Vexa** | (find repo) | Apache-2.0, transcription API, self-hostable |
| **Whisper-based DIY** | Various | Baseline: raw Whisper + diarization pipeline. How much work to roll our own? |

## Evaluation Framework

For each candidate, answer:

### Architecture
- What language/stack is the backend? Frontend?
- How does it capture audio? (System audio tap, browser extension, virtual mic, bot join?)
- Where does transcription happen? (Local, cloud, configurable?)
- What model(s) does it use for transcription? Summarization?
- What's the output format? Can we get raw transcripts programmatically?

### Integration Surface
- Does it expose an API, CLI, webhooks, or file output we can hook into?
- Can we trigger recording programmatically (not just manual start)?
- Can we inject our own post-processing (e.g., pipe transcript to Sunder agent)?
- How hard would it be to run headless on a server vs. requiring a desktop app?

### Maturity & Community
- GitHub stars, contributors, commit frequency (last 90 days)
- Open issues vs. closed ratio
- Are there production users? Any case studies or testimonials?
- Quality of documentation
- Bus factor — is it one maintainer or a team?

### Limitations & Risks
- Platform restrictions (macOS only? Chrome only?)
- Audio capture method reliability (does it break with OS updates?)
- License gotchas (CLA, dual licensing, commercial restrictions?)
- Resource consumption (CPU/RAM during transcription)
- Any privacy/security red flags in the codebase?

## Deliverable

A short comparison doc (1-2 pages) with:

1. **Comparison table** scoring each candidate against the requirements (1-10 non-negotiables, 11-14 preferences)
2. **Recommendation** with rationale — pick one and explain why
3. **Integration sketch** — for the recommended tool, describe the simplest path to: user has a call -> transcript lands in Sunder agent's memory -> agent acts on it
4. **Risks and unknowns** — what do we still need to prototype or test before committing?
5. **Effort estimate** — T-shirt size (S/M/L/XL) for the integration work

## Context for the Researcher

- Sunder's agent stores per-client context in Supabase Storage as markdown files (`SOUL.md`, `USER.md`, `MEMORY.md`, `memory/*.md`). The meeting transcript would land here.
- The agent has `read_file` / `write_file` tools and a CRM with people, companies, deals, tasks.
- Post-meeting flow we're imagining: transcript -> agent summarizes -> updates CRM (creates tasks for action items, updates deal notes) -> drafts follow-up message for approval.
- Our users are solo practitioners (real estate agents, insurance advisors, financial planners). They're on calls all day. This needs to be invisible and zero-friction.
- We run on Vercel (serverless, 300s timeout) + Supabase. Heavy compute (like local Whisper) would need to run client-side or on a separate compute layer.
