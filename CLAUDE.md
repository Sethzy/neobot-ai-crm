# Claude Code Compatibility

Claude Code may read `CLAUDE.md` by convention. NeoBot's canonical coding
instructions, product context, architecture, and repo conventions live in
`AGENTS.md`.

Read `AGENTS.md` first. This shim exists only for compatibility with agent
clients that do not automatically read `AGENTS.md`.

Key reminders:

- For Managed Agents testing, use `claude-haiku-4-5` only.
- Do not use Sonnet or Opus for local/dev Managed Agents tests.
- Do not replace Anthropic Managed Agents with Vercel AI SDK for the main
  runner.
