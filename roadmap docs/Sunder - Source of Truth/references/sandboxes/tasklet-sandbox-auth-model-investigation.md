# Tasklet Sandbox Auth Model — Investigation Findings

**Source:** Live probing of Tasklet sandbox internals (Apr 6, 2026)
**Method:** Ran diagnostic commands inside a live Tasklet sandbox to inspect the FUSE driver source code, config files, token mechanism, and auth headers.
**Context:** Investigating how Tasklet authenticates sandbox FUSE mounts for background (non-interactive) runs, to inform Sunder's Blaxel migration credential model.

---

## Key Finding: Per-Agent Bearer Token, Not User JWT

Tasklet's sandbox does NOT use user session tokens, S3 credentials, or JWTs for FUSE authentication. It uses a **platform-minted, agent-scoped bearer token** that is identical for interactive and background runs.

---

## Verbatim Investigation Thread

### Question Asked

> **How does your sandbox authenticate for background runs?**
>
> When a trigger fires (cron, webhook, RSS) and your agent calls run_command, there's no user session — just a trigger payload. How does the sandbox's FUSE mount (/agent/) authenticate to your storage in that case? Is it a per-agent service credential, a minted token, or does the platform handle it transparently?
>
> We're trying to figure out our credential model for non-interactive runs. Our design assumes a user JWT but that doesn't exist for background executions.

### Tasklet Dev Response (verbatim)

> Honest answer: this one hits the boundary of what I can tell you, because I'm the agent layer — I don't have visibility into the platform's auth infrastructure beneath me. The FUSE mount at /agent/ "just works" from my perspective, whether I'm in an interactive chat or handling a trigger event.
>
> That said, let me see what I can observe and infer:

### Diagnostic Commands Run Inside Sandbox

#### 1. Mount and Environment Inspection

```bash
echo "=== Mount info ===" && mount | grep agent && \
echo -e "\n=== Environment vars (filtered) ===" && \
env | grep -iE '(TOKEN|AUTH|CRED|SESSION|AGENT|FUSE|MOUNT|KEY|SECRET|IDENTITY)' | sed 's/=.*/=<REDACTED>/' && \
echo -e "\n=== /agent/ mount type ===" && \
stat --file-system --format='Type: %T' /agent/ 2>/dev/null && \
echo -e "\n=== Process list (fuse-related) ===" && \
ps aux | grep -i fuse 2>/dev/null
```

**Output:**

```
=== Mount info ===
AvfsFuse on /agent type fuse (rw,nosuid,nodev,relatime,user_id=0,group_id=0,allow_other)

=== Environment vars (filtered) ===
GPG_KEY=<REDACTED>
BL_NAME=<REDACTED>
FUSE_LIBRARY_PATH=<REDACTED>
OTEL_RESOURCE_ATTRIBUTES=<REDACTED>
PWD=<REDACTED>

=== /agent/ mount type ===
  File: "/agent/"
    ID: 0        Namelen: 255     Type: UNKNOWN
Block size: 4096
Blocks: Total: 274877906944 Free: 274877906944 Available: 274877906944
Inodes: Total: 1000000000 Free: 1000000000

=== Process list (fuse-related) ===
  408 root      0:00 python /usr/local/lib/sandbox/avfs_fuse.py /agent --config /usr/local/lib/sandbox/tasklet_context.json --foreground
```

#### 2. FUSE Config File Structure

```bash
cat /usr/local/lib/sandbox/tasklet_context.json 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
def print_keys(d, prefix=''):
    for k, v in d.items():
        if isinstance(v, dict):
            print(f'{prefix}{k}:')
            print_keys(v, prefix + '  ')
        elif isinstance(v, str) and len(v) > 20:
            print(f'{prefix}{k}: <REDACTED string len={len(v)}>')
        else:
            print(f'{prefix}{k}: {type(v).__name__} = {v}')
print_keys(data)
"
```

**Output:**

```
agentId: <REDACTED string len=22>
apiUrl: <REDACTED string len=22>
avfsEndpoint: <REDACTED string len=31>
avfsMountPrefix: str = /agent
dangerousDisableHostVerify: bool = False
tokenPath: <REDACTED string len=28>
```

#### 3. Token Mechanism and FUSE Driver Auth Code

```bash
TOKEN_PATH=$(python3 -c "import json; print(json.load(open('/usr/local/lib/sandbox/tasklet_context.json'))['tokenPath'])")
echo "Token path: $TOKEN_PATH"
echo "Token exists: $(test -f "$TOKEN_PATH" && echo yes || echo no)"
ls -la "$TOKEN_PATH" 2>/dev/null
echo -e "\n=== Token format (first 20 chars) ==="
head -c 20 "$TOKEN_PATH" 2>/dev/null && echo "..."
echo -e "\n=== FUSE driver source (auth-related lines) ==="
grep -n -iE '(auth|token|credential|header|bearer|session|sign|hmac)' /usr/local/lib/sandbox/avfs_fuse.py 2>/dev/null | head -30
```

**Output:**

```
Token path: /usr/local/lib/sandbox/token
Token exists: yes
-rw-r--r--    1 root     root           128 Apr  6 08:33 /usr/local/lib/sandbox/token

=== Token format (first 20 chars) ===
0ecb56fa2bb4f848b035...

=== FUSE driver source (auth-related lines) ===
17:        "tokenPath": "/path/to/token.txt"
62:    def __init__(self, endpoint: str, agent_id: str, token: str, mount_prefix: str, verify_ssl: bool = True):
67:        self.token = token
68:        self.session = requests.Session()
69:        self.session.headers.update({
71:            'Authorization': f'Bearer {token}',
79:    def set_token(self, token: str) -> None:
80:        """Update bearer token used for AVFS requests."""
81:        if token == self.token:
84:        self.token = token
85:        self.session.headers.update({'Authorization': f'Bearer {token}'})
86:        logger.info('Updated AVFS token from config change')
104:            response = self.session.post(
132:        # token middleware) must not be treated as a valid result —
969:        if 'tokenPath' not in config:
970:            raise ValueError('Missing "tokenPath" in config')
995:def read_token_from_config(config: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
996:    """Return token contents and absolute token file path, logging on failure."""
998:    token_path_raw = config.get('tokenPath')
999:    if not token_path_raw:
1000:        logger.error('Missing tokenPath in config')
1003:    token_path = os.path.abspath(os.path.expanduser(token_path_raw))
1005:        with open(token_path, 'r') as token_file:
1006:            return token_file.read().strip(), token_path
1008:        logger.warning(f'Token file not found: {token_path} (will retry)')
1009:        return None, token_path
1011:        logger.error(f'Failed to read token file {token_path}: {e}')
1012:        return None, token_path
1015:def watch_config_for_token(config_path: str, client: AvfsClient) -> Observer:
1016:    """Watch config and token file for changes and update the client."""
```

### Tasklet Dev Analysis (verbatim)

> Now I have a clear picture of how the sandbox authenticates. Here's what I found.
>
> **Sandbox Auth Model — What I Found**
>
> It's a per-agent bearer token, not a user JWT.
>
> The architecture:
>
> ```
> Platform (orchestrator)
>     |
>     | Spins up sandbox container, injects:
>     |   - /usr/local/lib/sandbox/tasklet_context.json (config)
>     |   - /usr/local/lib/sandbox/token (128-byte hex bearer token)
>     |
>     v
> avfs_fuse.py (FUSE driver, PID 408)
>     |
>     | Reads config: { agentId, apiUrl, avfsEndpoint, tokenPath, avfsMountPrefix }
>     | Reads bearer token from tokenPath
>     | Opens persistent requests.Session with:
>     |     Authorization: Bearer <token>
>     |     (+ agent ID header)
>     |
>     | All filesystem ops → HTTP POST to avfsEndpoint
>     v
> AVFS API (Tasklet's cloud storage layer)
>     |
>     | Validates bearer token + agentId
>     | Routes to agent's storage partition
>     v
> /agent/ mount (read/write cloud-backed FUSE)
> ```
>
> Key details:
>
> | Aspect | How it works |
> |---|---|
> | Credential type | Opaque 128-byte hex token, pre-minted by the platform |
> | Injected how | Written to /usr/local/lib/sandbox/token before the container starts |
> | Scoped to | A specific agentId — the token + agent ID pair authorize access to that agent's storage partition only |
> | Token refresh | The FUSE driver watches both the config file and token file for changes via a filesystem Observer. If the platform rotates the token, the driver picks it up live and calls set_token() — no restart needed |
> | Session model | Persistent requests.Session with Authorization: Bearer {token} header on every HTTP call to the AVFS endpoint |
> | Interactive vs. trigger | Identical. The platform mints a token and injects it regardless of whether the sandbox was spun up for a user chat or a trigger event. There's no user JWT anywhere in this flow |
>
> **What This Means for Your Design**
>
> The pattern here is: the platform is the identity provider, not the user. When a trigger fires:
>
> 1. Platform receives the webhook event
> 2. Platform looks up which agent should handle it
> 3. Platform spins up a sandbox, mints a scoped token for that agent, injects it
> 4. Sandbox authenticates to storage using that token — no user session needed
>
> So your instinct that "user JWT doesn't exist for background executions" is exactly right — and the answer is **don't use user JWTs for sandbox auth at all.** Use platform-minted, agent-scoped service credentials that are identical whether the run is interactive or background.

---

## Architecture Comparison

```
TASKLET (custom storage API):
  Platform mints agent-scoped bearer token
      ↓
  Injects token file + config into sandbox
      ↓
  avfs_fuse.py reads token, sends Authorization: Bearer <token>
      ↓
  AVFS API validates token + agentId → routes to agent partition

FINTOOL (S3):
  Platform mints ABAC-scoped STS credentials per user
      ↓
  Sandbox FUSE mounts S3 with scoped creds
      ↓
  IAM policy restricts access to user's S3 prefix

SUNDER (planned — Supabase S3):
  Platform uses project-level S3 keys + s3fs prefix scoping
      ↓
  s3fs mounts agent-files/{clientId}/ at /agent/
      ↓
  Supabase S3 endpoint serves only files under that prefix
```

---

## Implications for Sunder's Design

1. **R15 (JWT session token) should be dropped.** Tasklet doesn't use user JWTs. They use platform-minted, agent-scoped tokens. This confirms that user session identity is the wrong model for sandbox auth.

2. **Project-level S3 keys + prefix scoping is the Tasklet-equivalent pattern.** Both have the same risk profile: credentials inside the sandbox have broader access than the mount shows, but the sandbox is ephemeral and tenant-isolated at the VM level.

3. **Background runs are a non-issue.** The credential model is session-independent. Interactive and trigger runs get identical auth treatment.

4. **RLS-scoped credentials are a future hardening step**, not a launch requirement. When Supabase ships prefix-scoped S3 keys, we can upgrade. Until then, prefix scoping + ephemeral sandbox isolation is acceptable (same as Tasklet).

---

## Steelman Analysis

**Strongest counterargument:** Project-level S3 keys inside the sandbox can access all clients' files via direct HTTP calls, bypassing the prefix mount. Tasklet has the same risk — their bearer token could potentially be used to probe the AVFS API for other agents' data.

**Why it's acceptable:**
- Sandbox is ephemeral — credentials don't persist after VM dies
- Sandbox runs agent-generated code, not arbitrary user code
- VM-level isolation (Unikraft microVM) prevents cross-sandbox access
- Tasklet ships this exact model in production
- RLS-scoped credentials can be added later as a hardening step

**What would change this assessment:** If sandboxes ever run user-supplied code (not agent-generated), the risk profile changes significantly and RLS-scoped credentials become mandatory.
