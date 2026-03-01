# Agents Overview

**Updated:** 2026-02-21  
**Goal:** Give a simple, practical mental model for "what an agent is" and "how to build one without overengineering."

## Brainless Explanation

An agent is just a loop:

1. User gives a task.
2. Model either replies, or asks to call a tool.
3. If tool call: run the tool.
4. Feed tool output back to the model.
5. Repeat until the model stops asking for tools.
6. End with an assistant message.

That is the core. Everything else is upgrades around this loop.

## The 5 Levels (Progressive Complexity)

| Level | What You Add | Why You Add It | Add It When |
|---|---|---|---|
| 1 | Tools (read/write/run) | Agent can actually do work | Always start here |
| 2 | Storage + knowledge | Keep history and follow company context | You need multi-turn + team docs |
| 3 | Memory + learning | Improve over repeated usage | Same users return often |
| 4 | Multi-agent team | Specialist roles (coder/reviewer/tester) | One agent is not enough |
| 5 | Production runtime | Real DBs, tracing, API service | Multiple users + reliability needs |

## Main Pattern Across Sources

All three sources agree on one thing:

- Start simple.
- Add one capability at a time.
- Only pay complexity cost after a real failure at the previous level.

## What Matters Most in Practice

- Do not jump to multi-agent first.
- Keep tools stable to reduce prompt/cache churn.
- Manage context growth, or long sessions become slow/expensive.
- Treat storage, observability, and safety as part of the product, not "later."

## Suggested Reading Order

1. `brainless-agent-explainer.md`
2. `build-order-checklist.md`
3. `source-index.md`
