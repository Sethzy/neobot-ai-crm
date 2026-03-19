# Tasklet Sandbox Architecture: Traced from Inside

**Source:** Live probing of Tasklet sandbox internals (Mar 14-16, 2026)
**Method:** Ran diagnostic shell commands inside the sandbox to inspect processes, mounts, env vars, and execution behavior. Cross-referenced with Tasklet's v2 system prompt and tool definitions.

---

## Core Rule: Sandbox is On-Demand, Per-Tool-Call

The sandbox only spins up when the model calls `run_command`. Every other tool executes on the platform server directly — no sandbox involved.

### Decision Matrix

| Tool | Runs Where | Why |
|------|-----------|-----|
| `read_file` / `write_file` | Platform server | Direct cloud storage API call |
| `run_command` | Sandbox (microVM) | Needs OS, shell, binaries |
| `web_search` / `web_scrape` | Platform server | HTTP calls |
| Connection tools (Gmail, etc.) | Platform server | OAuth proxy to external APIs |
| `run_agent_memory_sql` | Platform server | Direct DB query |
| `send_message` | Platform server | Email/SMS service call |
| `show_user_preview` | Platform server + browser | Serves file from cloud storage |

---

## The `run_command` Tool Definition (Verbatim)

```json
{
  "name": "run_command",
  "description": "Executes shell commands in the sandbox environment.",
  "parameters": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["command", "action_pending", "action_finished", "action_error"],
    "additionalProperties": false,
    "properties": {
      "action_pending": {
        "type": "string",
        "description": "Custom UI status text shown while running. IMPORTANT: Output these three action_ parameters before all other parameters."
      },
      "action_finished": {
        "type": "string",
        "description": "Custom UI status text shown on success."
      },
      "action_error": {
        "type": "string",
        "description": "Custom UI status text shown on failure."
      },
      "command": {
        "type": "string",
        "description": "The shell command to execute in the sandbox environment."
      },
      "timeout": {
        "type": "number",
        "maximum": 300,
        "description": "Timeout in seconds for the command. Defaults to 60 seconds."
      }
    }
  }
}
```

One string for the command, a timeout, and three UI status labels. The entire sandbox gets invoked through that single `command` parameter.

### How the Model Knows What to Run

The tool definition is intentionally generic. The model's knowledge of available commands comes from the **`<sandbox>` section of the system prompt**:

- **Environment:** Alpine Linux v3.23, full network access, ephemeral
- **Preinstalled tools:** Python 3.12, bash, curl, ffmpeg, ghostscript, imagemagick, jq, pandoc, poppler-utils, tar, unzip, zip
- **Package manager:** `apk` for system packages, `uv run --with` for Python packages
- **Filesystem:** `/agent/` is persistent (FUSE-mounted), `/tmp/` is fast but ephemeral
- **Guidance:** when to use it (scripts, data processing, file manipulation) and when NOT to (no browser/GUI, no external API calls unless asked)

---

## Sandbox Internals (Probed Live)

### Infrastructure: Unikraft MicroVM on Blaxel

Not Docker. Not Firecracker. **Unikraft** — a unikernel VM platform. Explains fast spin-up (~1-3s).

```
┌──────────────────── Unikraft MicroVM ─────────────────────┐
│                                                            │
│  /init (PID 1) ─── entrypoint.sh                          │
│    ├── ukp-fs (PID 400) ─── unikraft filesystem           │
│    ├── avfs_fuse.py (PID 402) ─── FUSE → platform cloud   │
│    │     └── mounts /agent/ (shows as 1 Petabyte!)        │
│    └── sandbox-api (PID 403) ─── Go HTTP server on :80    │
│          └── sh -c "your command" (ephemeral)              │
│                                                            │
│  Overlay FS: erofs (read-only base) + tmpfs (writable)    │
│  Network: 172.16.30.77/30 → DNS at 172.16.30.78           │
│  CPU: 2x Intel Xeon @ 2.9GHz | RAM: 3.8GB | Node.js: ✅  │
└────────────────────────────────────────────────────────────┘
```

### Key Processes

| PID | Process | Role |
|-----|---------|------|
| 1 | `/init unikraft` | MicroVM bootloader |
| 400 | `ukp-fs` | Unikraft filesystem handler |
| 402 | `python avfs_fuse.py /agent` | FUSE bridge — mounts `/agent/` to cloud storage |
| 403 | `sandbox-api` | Go binary — receives `run_command` calls via HTTP on port 80 |
| ephemeral | `sh -c "..."` | User's command — child of sandbox-api |

### Environment Variables (Sanitized)

```
BL_ENV=prod
BL_REGION=us-pdx-1
BL_GENERATION=mk3
BL_TYPE=sandbox
BL_WORKSPACE=tasklet
BL_CLOUD=true
```

Reveals: running on **Blaxel** infrastructure, Portland region, production, third-gen sandbox platform.

OpenTelemetry is configured — sandbox executions are traced.

### Filesystem Layout

| Mount | Type | Purpose |
|-------|------|---------|
| `/` | overlay (erofs + tmpfs) | Read-only base + writable upper |
| `/agent/` | FUSE (AvfsFuse) | Cloud-backed persistent storage |
| `/tmp/` | local tmpfs | Fast ephemeral scratch space |
| `/dev/shm` | tmpfs | Shared memory |

### FUSE Performance

| Location | 10MB Write | Why |
|----------|-----------|-----|
| `/tmp/` | 0.01s (625 MB/s) | Local tmpfs, in-memory |
| `/agent/` | 1.72s | FUSE → cloud storage, network latency |

Best practice: copy heavy files to `/tmp/` for processing, then move results back to `/agent/home/`.

### Available Languages/Tools

```
/bin/sh        ✅
/bin/bash      ✅
/usr/local/bin/python3  ✅ (3.12.13)
/usr/bin/node  ✅
ruby, perl, go, java  ❌
```

---

## How the Model Composes Commands (vs Claude Code)

### Claude Code: Granular Tool Routing

```
Model thinks: "I need to find CSV files"
    → calls glob(pattern="**/*.csv")        ← dedicated tool
Model thinks: "I need to search for 'Resale'"
    → calls grep(pattern="Resale", path=.)  ← dedicated tool
Model thinks: "I need to read the file"
    → calls read(file="data.csv")           ← dedicated tool
Model thinks: "I need to run analysis"
    → calls bash("python3 script.py")       ← dedicated tool
```

4 different tools, orchestrator routes each one separately, each shows up as a distinct tool call.

### Tasklet: Single Entry Point, Model Composes

```
Model thinks: "I need to analyze this CSV"
    → calls run_command("cp file /tmp/ && python3 << 'EOF' ... EOF")
```

1 tool call. grep/glob/read equivalents happen inside the Python script:

```python
with open('/tmp/sg_prop.csv') as f:     # ← this is "read"
    reader = csv.DictReader(f)          # ← this is "read"
    for row in reader:                  # ← this is "grep/filter"
        if row['Type'] == 'Resale':     # ← this is "grep"
```

The platform doesn't know or care whether grep, Python, or ffmpeg is running. It just sees:
- **In:** `{ command: "...", timeout: 60 }`
- **Out:** `{ log: "...", exitCode: 0 }`

**Trade-off:** Claude Code has tool-level observability over each operation. Tasklet has command-level opacity — one black box in, one stdout out. All logic composition happens in the model's generation, not in the orchestrator.

---

## Execution Trace: How a `run_command` Flows

```
User message arrives
    ↓
Platform assembles prompt (system prompt + system-reminder + tool defs + history)
    ↓
LLM generates response with run_command tool call
    ↓
Platform intercepts tool call
    ↓
┌─────────────────────────────────────────────────────┐
│  SANDBOX PROVISIONING (~1-3 seconds)                │
│  1. Unikraft microVM spins up (Alpine Linux 3.23)   │
│  2. FUSE mount connects /agent/ to cloud storage    │
│  3. sandbox-api ready on port 80                    │
└─────────────────────────────────────────────────────┘
    ↓
sandbox-api spawns: sh -c "<command string>"
    ↓
Command executes (reads via FUSE, processes in RAM, writes via FUSE)
    ↓
sandbox-api captures stdout + stderr + exit code
    ↓
┌─────────────────────────────────────────────────────┐
│  SANDBOX TEARDOWN                                   │
│  - Container destroyed                              │
│  - Installed packages gone                          │
│  - /tmp/ contents gone                              │
│  - Only /agent/home/ writes survive (cloud storage) │
└─────────────────────────────────────────────────────┘
    ↓
Platform returns { log, exitCode } to LLM context
    ↓
LLM continues (may generate more tool calls or final response)
```

### FUSE Data Flow (Inside Sandbox)

```
Python calls open('/agent/uploads/file.csv')
    ↓
Linux kernel sees /agent/ is a FUSE mount
    ↓
FUSE driver (avfs_fuse.py) intercepts the open() call
    ↓
FUSE driver makes HTTP request to cloud storage
    ↓
Cloud storage returns file bytes
    ↓
FUSE driver passes bytes back to Python
    ↓
Python/pandas has NO IDEA it read from the cloud
```

---

## The Full Stack

```
┌─────────────────────────────┐
│  Tasklet (product layer)    │  ← what the user interacts with
│  UI, accounts, billing,     │
│  connections, triggers,     │
│  instant apps, skills       │
├─────────────────────────────┤
│  Blaxel (infra layer)       │  ← runs the compute
│  Unikraft microVMs          │
│  FUSE storage bridge        │
│  sandbox-api (Go)           │
│  us-pdx-1 region            │
├─────────────────────────────┤
│  Anthropic Claude (model)   │  ← the brain
│  Messages API + tool_use    │
│  (NOT Claude Agent SDK)     │
└─────────────────────────────┘
```

### Why Not Claude Agent SDK / CLI Inside the Sandbox?

The sandbox does **not** have the Claude CLI installed. Tasklet uses Claude as a raw model API (Messages API with `tool_use`) and wraps it in their own runtime.

**Reasons:**

| Concern | Claude CLI in sandbox | Direct model + custom tools |
|---------|----------------------|----------------------------|
| API costs | Double — outer model + inner CLI model | Single model call |
| Latency | CLI boots, starts its own loop | Direct tool execution |
| Control | CLI owns tool definitions | Tasklet defines exactly the tools they want |
| State | CLI has its own context, can't see connections/triggers/SQL | Everything in one context |
| Observability | Black box inside a black box | Platform sees every tool call |

Tasklet wants to **own the orchestration**. Claude CLI is opinionated about tools, loop structure, and sandbox behavior. By using Claude as a raw model API, Tasklet controls the entire product surface: connections, triggers, instant apps, subagents, intelligence tiers — none of which exist in Claude CLI.

---

## The Orchestration Loop

```
User message
    ↓
Platform assembles full prompt:
    system prompt + conversation history + system-reminder
    ↓
API call to Claude (Messages API + tool_use)
    ↓
Claude generates response, possibly with tool calls
    ↓
Platform parses output
    ↓
┌─ If tool calls found ──────────────────────┐
│  For each tool call:                        │
│    route to handler:                        │
│      run_command    → sandbox microVM       │
│      read/write_file → cloud storage        │
│      SQL tools      → managed DB            │
│      web tools      → platform HTTP         │
│      conn_XYZ__tool → connection proxy      │
│      send_message   → email/SMS service     │
│                                             │
│  Collect all results                        │
│  Append tool results to conversation        │
│  Call model again (agentic loop)            │
└─────────────────────────────────────────────┘
    ↓
Repeat until model generates response with no tool calls
    ↓
Final text delivered to user
```

The `<system-reminder>` is rebuilt every turn with live state (current time, user identity, active connections, triggers, tasks, DB tables). The model is stateless between invocations — the platform tells it everything it needs to know.

---

## Implications for Sunder

### Instead of FUSE

```
TASKLET:
  Python does open('/agent/uploads/leads.csv')
  FUSE intercepts → fetches from cloud storage → returns bytes
  Python doesn't know it's reading from the cloud

SUNDER:
  Runner downloads file from Supabase Storage to sandbox local disk
  Python does open('/tmp/leads.csv')
  Normal local file read — fast, no FUSE
  Python doesn't know it came from Supabase
```

### Trade-off Summary

| | Tasklet (FUSE) | Sunder (download/upload) |
|---|---|---|
| Code simplicity | Script just uses file paths — no cloud awareness | Runner must wrap in download-before/upload-after |
| Performance | Every file I/O is a network call (hidden by FUSE) | File I/O is local disk speed; network only at start/end |
| Debugging | FUSE failure → mysterious disk error | Download failure → clear error before script starts |
| Infrastructure | Need FUSE driver in every sandbox | No FUSE. Just HTTP calls to Supabase Storage API |

For Sunder's estimated ~5% sandbox usage, the download/upload approach is the right call — avoids an entire infrastructure component (FUSE driver) for a rarely-used feature.

---

## Related References

- `csv-lead-cleaning-sandbox-workflow.md` (Tasklet reference) — pure sandbox trace, no external APIs
- `gmail-sandbox-execution-trace.md` (Tasklet reference) — chains connection tool into sandbox, shows cross-environment data handoff
- `a-thousand-ways-to-sandbox-an-agent.md` — comparison of sandboxing approaches (simulated, containers, microVMs)
- `the-agentic-workload-igor-zalutski.md` — why agent workloads need ad-hoc sandboxes
- Architecture decision `EXEC-04` — Sunder uses Vercel Sandbox
