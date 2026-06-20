# The Claude Code SDK and the Birth of HaaS (Harness as a Service)

**Source:** vtrivedy.com — Varun Trivedy
**Date:** Sep 23, 2025
**Tags:** agents, claude-code, SDK, harness, infrastructure

---

## Core Thesis

The primitive for working with AI is shifting from LLM API (chat endpoints) to Harness API (customizable runtimes):

```
client.chat.completions.create() --> client.responses.create() --> agent.query()
```

**Agent Harness** = external functionality to enhance a model's runtime execution: conversation/context management, tool invocation layer (MCP/SDK), permissions, session/file-system state, loop control/error handling, observability/telemetry.

## Why Claude Code SDK

- Batteries-included agent runtime — reduces TTFF (Time to First Feedback)
- The `create-react-app` equivalent for agents (`create-agent-app`)
- Built-ins: context management (auto-compaction), rich tool ecosystem, advanced permissions, error handling, session management, prompt caching
- Frees builders to focus on their domain problem, not agent infra

## The 4 Customization Levers

### 1. System Prompt
- Starting place for goal, environment, tools, instructions, formatting, interaction rules
- Most impactful investment in agent building
- Two modes: `appendSystemPrompt` (add to Claude's existing) or `custom_system_prompt` (full rewrite)

### 2. Tools/MCPs
- Claude Code has built-in tools (web search, grep, file read/write)
- Define custom tools for domain-specific logic
- Three design questions:
  1. What does the agent need to accomplish its goal?
  2. Is tool usage clear in both system prompt and tool description?
  3. Can you reduce error surface by combining tools into atomic outcomes?

### 3. Context
- Better context = better performance
- Code docs/snippets as markdown files in filesystem (don't make agent search for known info)
- Memory/user personalization via `user_info.md` or memory service
- Rule of thumb: crucial context in system prompt, helpful context in markdown files

### 4. Subagents (optional)
- Start with single agent thread, add subagents for specialization or parallelization
- Defined via YAML in `.claude/agents/{subagent_name}.md`

## The Open Harness Thesis

- Companies (like Bolt) already using Codex/Claude Code as application primitives
- Prediction: in 6 months, majority of user-facing AI products will use an existing agent harness
- Other players: OpenAI Codex, Gemini CLI, Cursor CLI, Amp
- Open-source harnesses will let devs extend — the "Open App Store for Agents"
- Harnesses commodify agent infra, shift effort to prompts, tools, and context tuned to domain

## Relevance to Sunder

Sunder's runner (`run-agent.ts`) is essentially a custom harness built on Vercel AI SDK. The 4 customization levers map directly:
1. System prompt → `src/lib/ai/system-prompt.ts` (7-layer context assembly)
2. Tools → `src/lib/runner/tools/` (factory pattern, CRM tools, file I/O)
3. Context → SOUL.md, USER.md, MEMORY.md per client
4. Subagents → PR 30 (subagent orchestration)

If Claude Code SDK matures enough, it could potentially replace custom runner infra — worth monitoring.
