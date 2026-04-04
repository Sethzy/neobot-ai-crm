# Sandbox Execution Trace — Exact Flow

Date: 2026-04-05

## What was done
1. Called `web_search_web` to generate tool result data
2. Confirmed the block file exists via `read_file`
3. Ran a Python script in the sandbox that reads and processes the block data
4. Inspected the block directory structure from the sandbox

---

## Exact step-by-step flow

### Step 1: Tool call produces data
- **Tool called:** `web_search_web` with query `"top 5 programming languages 2026"`, limit `5`
- **Platform assigns blockId:** `b_x12mbhdhg1h1yarzmzjm`
- **Platform saves full result to:** `/agent/blocks/b_x12mbhdhg1h1yarzmzjm/result`
- **Result returned to LLM context:** The full JSON array (5 search results, ~1.7KB — small enough that it was NOT truncated)

### Step 2: Block directory structure (confirmed from sandbox)
```
/agent/blocks/b_x12mbhdhg1h1yarzmzjm/
├── args       (57 bytes)   — the input arguments to web_search_web
├── info       (68 bytes)   — metadata about the tool call
└── result     (1702 bytes) — the full JSON result from the tool
```

All files are read-only (`-rw-rw-r--`), owned by root, with timestamps matching the tool call time (`Apr 4 19:54`).

### Step 3: LLM writes a Python script referencing the blockId
The LLM (me) wrote this script and passed it to `run_command`:

```python
import json

with open('/agent/blocks/b_x12mbhdhg1h1yarzmzjm/result', 'r') as f:
    raw = f.read()

data = json.loads(raw)
```

**Key observation:** The LLM hardcoded the blockId path `b_x12mbhdhg1h1yarzmzjm` directly into the script. Nobody injected it. The LLM saw the blockId in the tool result, remembered it, and wrote it into the code.

### Step 4: Sandbox executes the script
- The sandbox process calls `open('/agent/blocks/b_x12mbhdhg1h1yarzmzjm/result')`
- The FUSE-mounted filesystem at `/agent/` serves the file from cloud storage
- Python reads 1,672 bytes of raw JSON (note: 1,672 raw string bytes vs 1,702 file bytes — the difference is likely filesystem block alignment or encoding)
- `json.loads()` parses it into a list of 5 dictionaries
- Script prints formatted output to stdout
- Sandbox captures stdout and returns it to the LLM as the `run_command` result

### Step 5: Result returned to LLM
The `run_command` result contains:
- `log`: the full stdout from the script
- `exitCode`: 0

---

## The complete data flow, summarized

```
web_search_web()
       │
       ▼
Platform executes search, gets 5 results as JSON
       │
       ▼
Platform saves full result → /agent/blocks/b_x12m.../result  (cloud storage)
Platform saves args       → /agent/blocks/b_x12m.../args
Platform saves metadata   → /agent/blocks/b_x12m.../info
       │
       ▼
Platform returns result + blockId to LLM context
       │
       ▼
LLM sees blockId "b_x12mbhdhg1h1yarzmzjm" in the response
       │
       ▼
LLM writes Python script containing:
  open('/agent/blocks/b_x12mbhdhg1h1yarzmzjm/result')
       │
       ▼
LLM passes script to run_command tool
       │
       ▼
Sandbox (Alpine Linux container) executes Python
       │
       ▼
Python calls open() → FUSE intercepts → reads from cloud storage
       │
       ▼
Python gets 1,672 bytes of JSON → parses → processes → prints to stdout
       │
       ▼
Sandbox captures stdout → returns to platform → returns to LLM
```

---

## What did NOT happen
- ❌ No "context.json" was created or injected
- ❌ No pre-injection step copied data into the sandbox
- ❌ No environment variables were set with the data
- ❌ No stdin piping of tool results
- ❌ No special API call to fetch the data

## What DID happen
- ✅ Platform saved tool result to cloud-backed filesystem (automatically, for every tool call)
- ✅ FUSE mount made cloud storage accessible as a normal filesystem path
- ✅ LLM acted as the bridge — it saw the blockId and wrote it into the script
- ✅ Python read a normal file from a normal path — it had no idea it was reading from cloud storage via FUSE

---

## Key insight
**The model is the bridge.** There is no orchestration layer packaging data for the sandbox. The platform saves every tool result to a predictable path. The sandbox can read any path under `/agent/`. The LLM connects the two by writing the path into the code. That's the whole mechanism.
