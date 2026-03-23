# Deep Search: Reference Repos for Agent-in-Sandbox Pattern

**Date:** 2026-03-23
**Goal:** Find every open-source repo that runs a coding agent (Claude Code, Codex, Gemini CLI, or similar) inside a sandbox/VM and returns results programmatically. We need implementation references for Sunder's `analyze_spreadsheet` and `publish_artifact` tools.

---

## What we're looking for

Repos where:
1. An **outer application** (web app, API server, CLI) creates a sandbox/VM
2. Writes **data or files** into the sandbox
3. Runs a **coding agent** (Claude Code CLI, Claude Agent SDK, Codex, or any LLM-powered code generator) **inside** the sandbox
4. The agent **autonomously** writes code, runs it, fixes errors, iterates
5. The outer application **reads results back** (files, stdout, preview URLs)
6. Bonus: supports **multi-turn iteration** (user refines, same sandbox continues)

**NOT what we're looking for:**
- Pure RAG / chatbot apps (no code execution)
- Apps where the agent runs outside and just sends `runCode()` calls to a sandbox (that's Pattern 2, we want Pattern 1)
- Dev environment tools (VS Code extensions, terminal multiplexers) unless they have programmatic agent integration
- Theoretical blog posts without implementations

---

## Search strategy

### By sandbox provider

Search GitHub and the web for repos using each major sandbox SDK:

**Sprites (Fly.io):**
```
"@fly/sprites" site:github.com
"sprites.dev" agent OR claude OR codex site:github.com
"SpritesClient" site:github.com -superfly
sprites agent sandbox example
```

**E2B:**
```
"e2b" "claude code" OR "claude-code" OR "agent.start" site:github.com
"@e2b" agent sandbox example NOT "code-interpreter"
e2b-dev examples agent autonomous
e2b "claude" template sandbox
```

**OpenComputer (Digger):**
```
"@opencomputer/sdk" site:github.com
"opencomputer" agent sandbox example
diggerhq NOT openlovable site:github.com
"sandbox.agent.start" site:github.com
```

**Modal:**
```
modal sandbox agent "claude code" OR claude-code site:github.com
modal-labs examples sandbox agent
modal sandbox "exec" agent autonomous
```

**Vercel Sandbox:**
```
"@vercel/sandbox" agent OR claude site:github.com -vercel-labs
vercel sandbox "claude code" example
vercel-labs coding-agent template fork
```

**Cloudflare Sandboxes:**
```
cloudflare sandbox agent claude site:github.com
"@cloudflare/sandbox" agent
cloudflare sandbox tutorial agent
```

**Daytona:**
```
daytona "claude agent sdk" site:github.com
daytona sandbox agent autonomous
daytona coding agent example
```

**Rivet sandbox-agent:**
```
"sandbox-agent" rivet site:github.com
rivet-dev sandbox agent example application
```

**Docker/self-hosted:**
```
docker "claude code" sandbox agent autonomous site:github.com
"claude-code-sandbox" site:github.com
docker agent sandbox "dangerously-skip-permissions"
```

### By agent/CLI tool

Search for repos wrapping specific agent CLIs inside sandboxes:

```
"claude --dangerously-skip-permissions" sandbox OR container OR docker OR VM site:github.com
"claude-code" sandbox programmatic site:github.com
"@anthropic-ai/claude-code" sandbox OR sprite OR e2b OR modal site:github.com
codex sandbox agent inside site:github.com
"gemini-cli" sandbox agent site:github.com
"opencode" sandbox agent site:github.com
amp agent sandbox site:github.com
```

### By use case

Search for repos that do what our tools do (data analysis or artifact generation via sandbox):

```
sandbox agent "spreadsheet" OR "excel" OR "pandas" analysis site:github.com
sandbox agent "react" OR "vite" artifact publish preview site:github.com
"lovable clone" OR "lovable alternative" open source site:github.com
AI "property" OR "real estate" sandbox agent site:github.com
AI agent "financial model" OR "DCF" sandbox code execution site:github.com
sandbox agent "skill" OR "SKILL.md" site:github.com
```

### By pattern name

Search for the architectural pattern itself:

```
"agent in sandbox" pattern implementation site:github.com
"agent inside sandbox" site:github.com
"coding agent" sandbox "fire and forget" site:github.com
"delegate to claude" sandbox site:github.com
Harrison Chase "two patterns" sandbox implementation
"assembly pattern" agent sandbox site:github.com
```

### Community and blog sources

Search for discussions and show-and-tell posts:

```
site:community.fly.io sprites agent claude
site:community.e2b.dev agent claude example
site:dev.to "claude code" sandbox agent
site:medium.com "claude code" sandbox agent tutorial
site:reddit.com "claude code" sandbox agent repo
Hacker News "agent in sandbox" OR "coding agent sandbox" 2026
Twitter/X: "claude code" "sandbox" "open source" OR "github"
Product Hunt: coding agent sandbox 2026
```

### Specific repos to check (may have been updated since we last looked)

| Repo | Check for |
|---|---|
| `e2b-dev/e2b-cookbook` | Any new examples with Claude Code inside sandbox (not just runCode) |
| `e2b-dev/fragments` | How they handle multi-turn and file persistence |
| `modal-labs/modal-examples` | Any new sandbox + agent examples |
| `langchain-ai/deepagents` | Their sandbox integration — do they support Pattern 1? |
| `anthropics/anthropic-cookbook` | Any sandbox execution examples |
| `vercel-labs/coding-agent-template` | Any forks doing interesting things |
| `all-hands-ai/OpenHands` | How they handle sandbox file I/O programmatically |
| `princeton-nlp/SWE-agent` | Their sandbox command interface |
| `Significant-Gravitas/AutoGPT` | Their code execution architecture |
| `firecrawl/open-lovable` | Their sandbox provider interface — any new providers added? |
| `stackblitz/bolt.new` | Their WebContainer integration pattern |
| `disler/agent-sandboxes` | Multi-sandbox comparison repo |
| `textcortex/claude-code-sandbox` | Archived, but check if Spritz continuation exists |
| `dzhng/claude-agent-server` | "Run Claude Agent in a sandbox, control via websocket" |
| `HarleyCoops/RalphOnAShelf` | "Claude Agent SDK built inside E2B Sandbox" |

---

## What to capture for each repo

For every relevant repo found, document:

```markdown
### {Repo name}
- **URL:** github.com/...
- **Stars / last active:**
- **Sandbox provider:** Sprites / E2B / Modal / Vercel / Docker / other
- **Agent inside:** Claude Code CLI / Claude Agent SDK / Codex / custom
- **Pattern match (1-5):** How closely does it match our use case?
  - 5 = outer app writes data in, agent runs autonomously, reads results back
  - 4 = agent in sandbox, but interactive (not programmatic)
  - 3 = sandbox as tool (Pattern 2), but interesting patterns to borrow
  - 2 = tangentially related
  - 1 = only loosely relevant
- **Key patterns to borrow:** What can we learn from this?
- **Multi-turn:** Yes/no — does it support follow-up iterations?
- **File I/O pattern:** How data goes in and results come out
- **Notes:**
```

---

## Output

Save all findings to `docs/product/references/sandbox-reference-repos-deep-search.md`.

Rank by pattern match score (5 first). For any repo scoring 4-5, include a brief architecture summary showing how data flows from the outer app through the sandbox and back.

At the end, include a **"Top 3 repos to study"** section with the ones most worth reading through in detail before we start building.

---

## Known findings so far (don't re-search these, just verify if they've updated)

| Repo | Provider | Pattern Match | Notes |
|---|---|---|---|
| `diggerhq/openlovable` (part1 branch) | OpenComputer | 5 | Pure React app, `sandbox.agent.start()`, structured events, multi-turn. Our primary reference. |
| `clouvet/sprite-mobile` | Sprites | 4 | PWA chat UI for Claude on Sprites, multi-session management. Interactive, not programmatic. |
| `vercel-labs/coding-agent-template` | Vercel Sandbox | 4 | Installs Claude Code inside Vercel Sandbox. Hybrid pattern. Our infrastructure API reference. |
| `dzhng/claude-agent-server` | Unknown | 4? | WebSocket control of Claude Agent. Haven't verified. |
| `HarleyCoops/RalphOnAShelf` | E2B | 4? | Claude Agent SDK in E2B. Haven't verified. |
| `rivet-dev/sandbox-agent` | Multi (E2B, Daytona, Vercel, Docker) | 3 | Universal HTTP adapter for multiple agents. Interesting abstraction layer. |
| `e2b-dev/e2b-cookbook` (firecrawl-airbnb) | E2B | 5 | Scrape → assemble → sandbox analysis. Very close to our analyze_spreadsheet pattern. |

We need 2-3 more high-quality repos (pattern match 4-5) to round out our references before building.
