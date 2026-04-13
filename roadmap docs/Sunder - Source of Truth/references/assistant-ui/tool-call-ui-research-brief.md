# Tool Call UI Research Brief

## Goal

Find and document a reference implementation for **tool call rendering in a chat UI** that we can clone. The current implementation works but looks generic — bordered collapsibles with "Used tool: bash >" that feel like debug output, not a polished product.

## Current State

Screenshot context: Our chat shows tool calls as bordered cards with:
- A status icon (spinner/check)
- "Used tool: **name**" label
- A chevron to expand args/results
- Collapsible JSON details

It's functional but aesthetically flat. It looks like a developer tool, not a consumer product.

## What We're Looking For

Research chat UIs that render **tool/function calls, agent steps, or "thinking" indicators** in a visually polished way. Focus on:

1. **How the tool call is visually distinguished** from regular message text — background color, borders, icons, spacing, indentation
2. **Running state** — how it looks while the tool is executing (shimmer, skeleton, pulse, progress)
3. **Completed state** — how it looks after the tool finishes (collapsed summary vs. expanded detail)
4. **Multiple sequential tools** — how a chain of 3-5 tool calls stacks without overwhelming the conversation
5. **The trigger/expand interaction** — how the user peeks at details without it feeling like a code debugger

## Reference Products to Check

Research these products specifically — they all show tool calls or agent steps in chat:

- **ChatGPT** (chat.openai.com) — "Searching the web...", "Analyzing image...", code interpreter steps. Note how they collapse completed steps into single-line summaries.
- **Claude.ai** (claude.ai) — "Using tool: web_search", artifacts panel. Note the artifact rendering approach.
- **Perplexity** (perplexity.ai) — source citations as chips, search steps as a collapsed group.
- **Cursor** (cursor.com) — tool calls in the AI chat sidebar (file edits, terminal commands). Very compact.
- **v0.dev** (v0.dev) — generative UI steps, preview panels.
- **Devin** (devin.ai) — agent step timeline with nested tool calls.
- **OpenAI Codex** (codex CLI or chatgpt codex mode) — terminal-style tool steps.
- **Vercel AI Chatbot** (vercel.com/templates/next.js/nextjs-ai-chatbot) — the open-source template, tool call rendering.
- **assistant-ui examples** (assistant-ui.com/examples) — shadcn, chatgpt, claude, gemini examples. We already have these locally at `/Users/sethlim/Documents/assistant ui examples/`.
- **Anthropic Workbench** — tool use playground.

## Deliverables

For each reference you find compelling:

1. **Screenshot** — capture the tool call rendering (running + completed states)
2. **Source code** (if open-source) — exact file path and code for the component
3. **Key CSS patterns** — the specific Tailwind/CSS classes that make it look good
4. **What makes it work** — 1-2 sentences on why this particular treatment feels polished

Then recommend **one** reference to clone, with a mapping of what to change in:
- `src/components/chat/tool-call-inline.tsx` — the main tool call component
- `src/components/chat/message-bubble.tsx` — where tool calls are rendered in the message

## Constraints

- No new dependencies. Pure Tailwind CSS + existing ShadCN components (Collapsible, Badge, Button).
- Must handle our special tool states: running, completed, approval-requested, denied, error.
- Must preserve special card rendering: ConnectionCard, PermissionCard, browser auth, PDF download.
- Must work in both light and dark mode.
- Must look good when 3-5 tool calls stack sequentially (common case: storage_read, search_crm, search_crm, web_search).

## Design Direction Hints

Things that tend to look good for tool calls in chat:
- **Minimal chrome** — less border, more whitespace. The current bordered box for every tool is heavy when you have 4 in a row.
- **Grouped steps** — collapsing multiple tools into "Used 4 tools" with expand, rather than 4 separate cards.
- **Subtle differentiation** — slight background tint or left border accent rather than full border box.
- **Progressive disclosure** — tool name visible, one click for args, another for results. Not everything at once.
- **Status as color** — running = subtle pulse/shimmer on the text itself, not a separate spinner icon.
