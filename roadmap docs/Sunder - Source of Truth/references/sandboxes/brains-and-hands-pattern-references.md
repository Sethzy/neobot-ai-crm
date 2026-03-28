# Brains & Hands Pattern — Reference Links

> **Pattern:** Lightweight outer orchestrator ("brain") dispatches to a coding agent running inside a sandboxed VM/container ("hands"). The brain handles chat, routing, and lightweight tool calls; the hands do heavy code execution locally inside the sandbox.
>
> **Sunder's version:** AI SDK runner in Vercel Functions (brain) → Claude Code CLI in Fly.io Sprites (hands) for `analyze_spreadsheet` and `publish_artifact`.
>
> **Date collected:** 2026-03-24

---

## Named Descriptions of the Pattern

| Source | What they call it | Link |
|--------|-------------------|------|
| Microsoft Swarm Diaries | "Brains and hands" | https://techcommunity.microsoft.com/blog/appsonazureblog/the-swarm-diaries-what-happens-when-you-let-ai-agents-loose-on-a-codebase/4501393 |
| Addy Osmani / O'Reilly | "Conductors to orchestrators" | https://www.oreilly.com/radar/conductors-to-orchestrators-the-future-of-agentic-coding/ |
| Azure Architecture Center | "Router / dispatcher pattern" | https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns |
| OpenComputer / Digger | "Agent placement" (Options 1-3) | https://opencomputer.dev/blog/where-should-agents-live |

## Repos & Templates Implementing the Pattern

| Repo | Description | Link |
|------|-------------|------|
| Vercel coding-agent-template | Multi-agent coding platform — Next.js + AI SDK outer app dispatching to coding agent in Vercel Sandbox | https://github.com/vercel-labs/coding-agent-template |
| Composio agent-orchestrator | Orchestrator that spawns parallel coding agents, each in its own git worktree/sandbox with its own PR | https://github.com/ComposioHQ/agent-orchestrator |
| Rivet sandbox-agent | Run Claude Code / Codex / OpenCode inside sandboxes, control over HTTP | https://github.com/rivet-dev/sandbox-agent |
| ben-vargas/ai-sdk-provider-claude-code | Vercel AI SDK community provider wrapping Claude Agent SDK — enables nested agent execution UI | https://github.com/ben-vargas/ai-sdk-provider-claude-code |
| Overstory | Multi-agent orchestration for Claude Code with pluggable runtime adapters | https://github.com/jayminwest/overstory |
| agent-infra/sandbox | All-in-one sandbox combining Browser, Shell, File, MCP and VSCode Server in a single Docker container | https://github.com/agent-infra/sandbox |
| Kubernetes agent-sandbox SIG | K8s-native isolated, stateful, singleton workloads for AI agent runtimes | https://github.com/kubernetes-sigs/agent-sandbox |

## Related OpenComputer Articles (same folder)

- [Part 1 — Building an Open Lovable](opencomputer-building-open-lovable-part-1.md)
- [Where Should the Agent(s) Live?](opencomputer-where-should-agents-live.md)
