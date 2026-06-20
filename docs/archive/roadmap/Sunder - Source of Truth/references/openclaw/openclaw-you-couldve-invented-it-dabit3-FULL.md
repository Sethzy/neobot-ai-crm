\# You Could've Invented OpenClaw

**Author:** Nader Dabit (@dabit3)
**Source:** X/Twitter Article
**Date:** February 11, 2026
**URL:** https://x.com/dabit3 (article)
**Gist:** https://gist.github.com/dabit3/86ee04a1c02c839409a02b20fe99a492

---

## Summary

Step-by-step tutorial building OpenClaw's architecture from first principles. Starts with a simple Telegram bot and progressively adds every major component: persistent sessions, SOUL.md personality, tools + agent loop, permission controls, gateway pattern, context compaction, long-term memory, command queue, cron/heartbeats, and multi-agent routing. Ends with a ~400-line working prototype ("mini-openclaw").

---

## Key Architecture Components

### 1. The Simplest Possible Bot

Basic Telegram bot calling Claude API - stateless, no memory, no tools.

```python
import os
import anthropic
from telegram import Update
from telegram.ext import Application, MessageHandler, filters

client = anthropic.Anthropic()

async def handle_message(update: Update, context):
    user_message = update.message.text

    response = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=1024,
        messages=[{"role": "user", "content": user_message}]
    )

    await update.message.reply_text(response.content[0].text)

app = Application.builder().token(os.getenv("TELEGRAM_BOT_TOKEN")).build()
app.add_handler(MessageHandler(filters.TEXT, handle_message))
app.run_polling()
```

### 2. Persistent Sessions (JSONL)

Keep conversation history per user. Append-only JSONL format - if process crashes mid-write, lose at most one line.

```python
import json
import os

SESSIONS_DIR = "./sessions"
os.makedirs(SESSIONS_DIR, exist_ok=True)

def get_session_path(user_id):
    return os.path.join(SESSIONS_DIR, f"{user_id}.jsonl")

def load_session(user_id):
    """Load conversation history from disk."""
    path = get_session_path(user_id)
    messages = []
    if os.path.exists(path):
        with open(path, "r") as f:
            for line in f:
                if line.strip():
                    messages.append(json.loads(line))
    return messages

def append_to_session(user_id, message):
    """Append a single message to the session file."""
    path = get_session_path(user_id)
    with open(path, "a") as f:
        f.write(json.dumps(message) + "\n")

def save_session(user_id, messages):
    """Overwrite the session file with the full message list."""
    path = get_session_path(user_id)
    with open(path, "w") as f:
        for message in messages:
            f.write(json.dumps(message) + "\n")

async def handle_message(update: Update, context):
    user_id = str(update.effective_user.id)
    user_message = update.message.text

    messages = load_session(user_id)

    user_msg = {"role": "user", "content": user_message}
    messages.append(user_msg)
    append_to_session(user_id, user_msg)

    response = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=4096,
        messages=messages
    )

    assistant_msg = {"role": "assistant", "content": response.content[0].text}
    append_to_session(user_id, assistant_msg)

    await update.message.reply_text(response.content[0].text)
```

OpenClaw session path: `~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl`

### 3. SOUL.md (Personality)

Markdown file defining agent identity, behavior, and boundaries. Injected as system prompt on every API call.

```python
SOUL = """
# Who You Are

**Name:** Jarvis
**Role:** Personal AI assistant

## Personality
- Be genuinely helpful, not performatively helpful
- Skip the "Great question!" - just help
- Have opinions. You're allowed to disagree
- Be concise when needed, thorough when it matters

## Boundaries
- Private things stay private
- When in doubt, ask before acting externally
- You're not the user's voice - be careful about sending messages on their behalf

## Memory
Remember important details from conversations.
Write them down if they matter.
"""
```

Lives at: `~/.openclaw/workspace/SOUL.md`

### 4. Tools + Agent Loop

Give AI structured tools, let it decide when to use them. Agent loop: call LLM → execute tools → feed results back → repeat until done.

```python
import subprocess

TOOLS = [
    {
        "name": "run_command",
        "description": "Run a shell command on the user's computer",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "The command to run"}
            },
            "required": ["command"]
        }
    },
    {
        "name": "read_file",
        "description": "Read a file from the filesystem",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the file"}
            },
            "required": ["path"]
        }
    },
    {
        "name": "write_file",
        "description": "Write content to a file",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the file"},
                "content": {"type": "string", "description": "Content to write"}
            },
            "required": ["path", "content"]
        }
    },
    {
        "name": "web_search",
        "description": "Search the web for information",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"}
            },
            "required": ["query"]
        }
    }
]

def execute_tool(name, input):
    if name == "run_command":
        result = subprocess.run(
            input["command"], shell=True,
            capture_output=True, text=True, timeout=30
        )
        return result.stdout + result.stderr
    elif name == "read_file":
        with open(input["path"], "r") as f:
            return f.read()
    elif name == "write_file":
        with open(input["path"], "w") as f:
            f.write(input["content"])
        return f"Wrote to {input['path']}"
    elif name == "web_search":
        return f"Search results for: {input['query']}"
    return f"Unknown tool: {name}"

def serialize_content(content):
    """Convert API response content blocks to JSON-serializable dicts."""
    serialized = []
    for block in content:
        if hasattr(block, "text"):
            serialized.append({"type": "text", "text": block.text})
        elif block.type == "tool_use":
            serialized.append({
                "type": "tool_use",
                "id": block.id,
                "name": block.name,
                "input": block.input
            })
    return serialized

def run_agent_turn(messages, system_prompt):
    """Run one full agent turn (may involve multiple tool calls)."""
    while True:
        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=4096,
            system=system_prompt,
            tools=TOOLS,
            messages=messages
        )

        content = serialize_content(response.content)

        if response.stop_reason == "end_turn":
            text = ""
            for block in response.content:
                if hasattr(block, "text"):
                    text += block.text
            messages.append({"role": "assistant", "content": content})
            return text, messages

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": content})
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result = execute_tool(block.name, block.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": str(result)
                    })
            messages.append({"role": "user", "content": tool_results})
```

### 5. Permission Controls

Approval allowlist for dangerous commands. Three-tier: "ask" (prompt user), "record" (log but allow), "ignore" (auto-allow). Supports glob patterns (approve `git *` once).

```python
import re

SAFE_COMMANDS = {"ls", "cat", "head", "tail", "wc", "date", "whoami", "echo"}
DANGEROUS_PATTERNS = [r"\brm\b", r"\bsudo\b", r"\bchmod\b", r"\bcurl.*\|.*sh"]

APPROVALS_FILE = "./exec-approvals.json"

def load_approvals():
    if os.path.exists(APPROVALS_FILE):
        with open(APPROVALS_FILE) as f:
            return json.load(f)
    return {"allowed": [], "denied": []}

def save_approval(command, approved):
    approvals = load_approvals()
    key = "allowed" if approved else "denied"
    if command not in approvals[key]:
        approvals[key].append(command)
    with open(APPROVALS_FILE, "w") as f:
        json.dump(approvals, f, indent=2)

def check_command_safety(command):
    base_cmd = command.strip().split()[0] if command.strip() else ""
    if base_cmd in SAFE_COMMANDS:
        return "safe"
    approvals = load_approvals()
    if command in approvals["allowed"]:
        return "approved"
    for pattern in DANGEROUS_PATTERNS:
        if re.search(pattern, command):
            return "needs_approval"
    return "needs_approval"
```

### 6. The Gateway Pattern

One central process managing all channels. Agent logic decoupled from channel - `run_agent_turn` doesn't know about Telegram. Add HTTP API alongside Telegram bot, both talking to same agent/sessions.

```python
from flask import Flask, request, jsonify
import threading

flask_app = Flask(__name__)

@flask_app.route("/chat", methods=["POST"])
def chat():
    data = request.json
    user_id = data["user_id"]
    messages = load_session(user_id)
    messages.append({"role": "user", "content": data["message"]})

    response_text, messages = run_agent_turn(messages, SOUL)

    save_session(user_id, messages)
    return jsonify({"response": response_text})

threading.Thread(target=lambda: flask_app.run(port=5000), daemon=True).start()
```

OpenClaw config-driven: JSON file specifying which channels to start. Supports Telegram, Discord, WhatsApp, Slack, Signal, iMessage. Configurable session scoping: per-user, per-channel, or single shared session.

### 7. Context Compaction

When conversations exceed context window, summarize old messages and keep recent ones.

```python
def estimate_tokens(messages):
    return sum(len(json.dumps(m)) for m in messages) // 4

def compact_session(user_id, messages):
    if estimate_tokens(messages) < 100_000:
        return messages

    split = len(messages) // 2
    old, recent = messages[:split], messages[split:]

    summary = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=2000,
        messages=[{
            "role": "user",
            "content": (
                "Summarize this conversation concisely. Preserve:\n"
                "- Key facts about the user (name, preferences)\n"
                "- Important decisions made\n"
                "- Open tasks or TODOs\n\n"
                f"{json.dumps(old, indent=2)}"
            )
        }]
    )

    compacted = [{
        "role": "user",
        "content": f"[Previous conversation summary]\n{summary.content[0].text}"
    }] + recent

    save_session(user_id, compacted)
    return compacted
```

OpenClaw: splits messages into chunks by token count, summarizes each separately, includes safety margin.

### 8. Long-Term Memory

File-based storage with save/search tools. Survives session resets.

```python
MEMORY_DIR = "./memory"

# Two tools added to TOOLS list:
# save_memory - stores info as markdown files
# memory_search - keyword search across memory files
```

OpenClaw production: vector search via SQLite with embedding extensions for semantic similarity, plus FTS5 for exact keyword matches. Configurable embedding providers (OpenAI, local models, Gemini, Voyage).

### 9. Command Queue

Per-session locking to prevent race conditions from simultaneous messages.

```python
from collections import defaultdict

session_locks = defaultdict(threading.Lock)

async def handle_message(update: Update, context):
    user_id = str(update.effective_user.id)
    with session_locks[user_id]:
        # ... process message
```

OpenClaw: lane-based queues (separate lanes for messages, cron jobs, sub-agents) so heartbeats never block real-time conversations.

### 10. Cron Jobs (Heartbeats)

Scheduled agent execution on a timer. Each heartbeat uses its own session key.

```python
import schedule

def setup_heartbeats():
    def morning_briefing():
        session_key = "cron:morning-briefing"
        with session_locks[session_key]:
            messages = load_session(session_key)
            messages.append({
                "role": "user",
                "content": "Good morning! Check today's date and give me a motivational quote."
            })
            response_text, messages = run_agent_turn(messages, SOUL)
            save_session(session_key, messages)

    schedule.every().day.at("07:30").do(morning_briefing)

    def scheduler_loop():
        while True:
            schedule.run_pending()
            time.sleep(60)

    threading.Thread(target=scheduler_loop, daemon=True).start()
```

OpenClaw: full cron expressions (`30 7 * * *`), heartbeats routed through separate command queue lane.

### 11. Multi-Agent Routing

Multiple agent configurations with different SOULs and session keys. Route by message content.

```python
AGENTS = {
    "main": {
        "name": "Jarvis",
        "soul": SOUL,
        "session_prefix": "agent:main",
    },
    "researcher": {
        "name": "Scout",
        "soul": """You are Scout, a research specialist...""",
        "session_prefix": "agent:researcher",
    },
}

def resolve_agent(message_text):
    if message_text.startswith("/research "):
        return "researcher", message_text[len("/research "):]
    return "main", message_text
```

Agents share memory directory - collaborate through shared files. OpenClaw extends with sub-agent spawning and inter-agent messaging.

---

## Production Extensions (OpenClaw)

### Browser with Semantic Snapshots

- Playwright browser control using accessibility tree text instead of screenshots
- Each interactive element gets numbered `ref` ID
- ~100x smaller than screenshots in token cost

### Session Scoping & Identity Links

- **main:** All DMs share one session
- **per-peer:** Each person gets one session across all channels
- **per-channel-peer:** Each person per channel gets own session
- Identity links merge sessions across channels for same person

### Channel Plugin System

Each channel (Telegram, Discord, WhatsApp, Slack, Signal, iMessage) is a separate adapter normalizing messages into common format.

### Vector Memory Search

Hybrid: vector search via SQLite with embedding extensions + FTS5 for exact keyword matches. Configurable embedding providers.

### Sub-agent Spawning

Parent agent calls `sessions_spawn`, child runs in own context with timeout, returns results to parent.

---

## Key Insight: Problem → Solution Mapping

| Problem                                  | Solution            |
| ---------------------------------------- | ------------------- |
| "AI can't remember anything"             | Sessions (JSONL)    |
| "Responds like generic chatbot"          | SOUL.md             |
| "Can only talk, not act"                 | Tools + Agent loop  |
| "Runs dangerous commands without asking" | Permission controls |
| "Want it on all messaging apps"          | Gateway pattern     |
| "Conversation got too long"              | Context compaction  |
| "Forgets things between sessions"        | Long-term memory    |
| "Two messages at once corrupt data"      | Command queue       |
| "Want it to do things automatically"     | Heartbeats/cron     |
| "One agent can't do everything well"     | Multi-agent routing |

---

## Working Prototype

~400 lines of code. Gist: https://gist.github.com/dabit3/86ee04a1c02c839409a02b20fe99a492

Run with:

```bash
uv run --with anthropic --with schedule python mini-openclaw.py
```

---

**Tags:** #openclaw #architecture #tutorial #agents #from-first-principles
