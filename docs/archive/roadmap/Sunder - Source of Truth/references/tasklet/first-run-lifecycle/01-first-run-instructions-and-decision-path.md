# First Run: Instructions and Decision Path

This document normalizes the first-run behavior described in the source analysis.

## What the system prompt effectively instructs on first run

On an initial setup request (for example, "set up a daily calendar briefing"), the system prompt and reminder push the agent toward this sequence:

1. Understand user intent before automation setup
- Clarify what outcome is required.
- Avoid creating triggers before prerequisites are ready.

2. Treat recurring workflows as subagent candidates
- If the task is repeatable/triggered, create self-contained subagent instructions.

3. Prepare persistence before scheduling
- Configure required connections.
- Create files/configs and optional DB schema for state tracking.

4. Use trigger setup only after prerequisites are complete
- Create schedule/webhook trigger when execution artifacts are in place.

## First-run decision path

Given a request like daily calendar briefing:

1. Discover missing prerequisites
- No active connection -> provision Google Calendar connection.

2. Define long-lived execution artifacts
- Create subagent workflow file(s).
- Create optional preference/config file(s).
- Create SQL tables if cross-run state is needed.

3. Register trigger
- Set schedule after artifacts are ready.

## Why this matters

First run is effectively "authoring runtime memory" for future stateless invocations.

