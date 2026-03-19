# Flint: Convert Your App Into CLIs, APIs, and MCP — Not Coding Agents

**Source:** https://www.tryflint.com/docs/api
**Product:** Flint (tryflint.com) — autonomous landing page builder for growth teams
**Date captured:** 2026-03-17

## Key Thesis

Make it trivial for Claude (and every AI app) to connect to your product. You want Claude reaching for your product like a tool, not replacing it like a feature.

Two rules:

1. **Convert your app into CLIs, APIs, and MCP.** Expose your product's core value as structured operations AI agents can call.
2. **Stop worrying about your coding agents.** Claude and Codex keep getting better automatically. Use off-the-shelf coding agents (OpenCode, Claude Code, Codex) for development. Building a bespoke coding agent inside your product is a treadmill — you're competing with Anthropic and OpenAI on their core competency.

## What Flint Built

### Three Integration Surfaces

| Surface | Target | Purpose |
|---------|--------|---------|
| REST API (`/api/v1/agent/tasks`) | Any agent framework | Programmatic site creation/modification |
| Claude MCP server | Claude Desktop | Native tool integration |
| Claude Code MCP | Claude Code CLI | Developer workflow integration |

### API Design Choices That Enable "Aggressive Agentic Usage"

- **Async task model** — submit task, get task ID, poll or receive webhook callback. Matches how agents naturally work (fire-and-forget, check later).
- **Dual-mode input** — accepts both natural language prompts AND structured commands (`generate_pages`). Dumb integrations pass through user text; sophisticated agents use precise structured calls.
- **Bearer token auth** — simple API key, no OAuth dance for machine-to-machine.
- **Webhook callbacks** — `callback_url` parameter for event-driven architectures.
- **Thin MCP wrapper over REST** — MCP server is just a translation layer over the same REST API. One backend, multiple integration surfaces.
- **Batch operations** — up to 10 items per request.

### Early Agentic Usage Patterns

- Sales rep Slackbot that creates account-based landing pages via API
- Reddit commenting bot ("Clawdbot") that hooks into Flint for page creation

## The OpenCode Angle

Flint uses [OpenCode](https://opencode.ai/) (open-source coding agent, 120k+ GitHub stars) for internal development. OpenCode supports 75+ model providers — Claude, Codex, Gemini, local models — interchangeably. Their point: don't build your own coding agent when you can use one that automatically benefits from model improvements across all providers.

## Strategic Framing

| Don't build this yourself | Do build this yourself |
|---|---|
| Coding agents (use OpenCode/Claude Code) | Product APIs that agents can call |
| Model orchestration for dev workflows | MCP servers that expose your product |
| Competing with foundation model providers | Making your product a tool that AI reaches for |

## Relevance to Sunder

The same pattern applies: Sunder's value is in the orchestration, memory, and real estate domain knowledge — not in building a bespoke coding agent. The product API / MCP playbook:

1. Build a REST API for core agent actions (create briefing, send follow-up, update CRM)
2. Wrap it as an MCP server so Claude/other agents can call it natively
3. Use async task patterns with webhooks for long-running operations
4. Authenticate with simple API keys for machine-to-machine use
