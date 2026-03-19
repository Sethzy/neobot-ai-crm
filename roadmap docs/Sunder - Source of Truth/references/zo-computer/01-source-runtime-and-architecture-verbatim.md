# Zo Computer — Runtime, Personas, Rules, Memory (Verbatim)

> Source: Zo Computer chat session (MiniMax 2.5 model), March 2026.
> User asked about agent runtime model, personas & rules, and memory & persistence.
> This is the verbatim response from the agent.

---

## 1. Agent Runtime Model

**Execution Flow:** When you send a message, it's not a simple LLM call — it's an agent with a flexible execution loop that runs on your personal server.

```
Your message → Agent Runtime Loop → [LLM call → Tool execution → LLM call → ...] → Final response
```

**Key characteristics:**

- **Loop-based execution:** The agent decides whether to respond directly, execute tools, or continue reasoning — this repeats until the task is complete.
- **Tool calling:** ~50+ built-in tools (file operations, web search, code execution, image generation, etc.) that can be invoked as needed.
- **No fixed max iterations:** The loop continues until a final response is produced or an error is encountered.
- **Conversation context:** Each conversation has an ID (`conv_xxx`) that links messages together — previous turns are included in context.

---

## 2. Personas & Rules

### How they're injected:

- **Personas** are stored as structured objects with a `prompt` (system prompt), optional `model` override, and `image` avatar. When active, the persona's prompt becomes part of the system prompt.
- **Rules** have two parts: an optional `condition` (when to apply) and an `instruction` (what to do). They're injected into the context alongside the user's message.

### Relationship:

- **Personas** define "who" — broad behavioral style, tone, and role (e.g., "Technical Writer", "Tutor", "Data Analyst").
- **Rules** define specific behaviors — can be conditional ("when X, do Y") or unconditional ("always be concise").
- They can **coexist** — a persona sets the base behavior, rules add specific overrides.
- They **don't directly override each other**; they layer together in the context sent to the LLM.

---

## 3. Memory & Persistence

### How Zo remembers things:

| Layer | What it stores | How long |
|---|---|---|
| Conversation history | All messages in a conversation | Persists across sessions |
| Workspace files | Your `/home/workspace/` contents | Persists forever |
| System snapshots | Full backup of everything | Point-in-time restore available |
| AGENTS.md / SOUL.md | Workspace-specific instructions | Persists in workspace |

### Key points:

- **Data lives on your server**, not in Zo's cloud — you own it.
- Files are in **open formats** (no lock-in).
- The agent can **read workspace files during conversations** — you can reference them or drag them into chat to give context.
- The workspace structure (`/home/workspace/`) is the agent's "memory" of projects and files.

### Bottom line:

Zo is designed as a **persistent AI workspace** — not an ephemeral chat. It remembers files, conversations, and builds up context over time. Each user gets a personal Linux server (persistent compute), not just a chat session.

---

## 4. Infrastructure Model (inferred)

- Each user gets a **persistent Linux server** (not ephemeral containers).
- Server has `/home/workspace/` as persistent storage.
- **zo.space** provides publishing (pages + API routes) from the server.
- **User Services** allow running long-lived HTTP/TCP services on the server.
- Hardware tiers are changeable via `change_hardware` tool.
- **Agents** (scheduled automations) use RFC 5545 RRULE for cron-like scheduling.
- **Delivery methods** for agent outputs: email, SMS, Telegram, or null (workspace only).
