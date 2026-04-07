# Blaxel Sandbox Migration Implementation Plan

**PR:** PR 71: Blaxel Sandbox Migration (replaces Vercel Sandbox + bash-tool with Blaxel + rclone FUSE)
**Decisions:** See `docs/product/ideations/2026-04-04-blaxel-sandbox-migration-requirements.md` (40 requirements, 11 drift items, 2 spikes, 3 adversarial reviews)
**Goal:** Replace Vercel Sandbox with Blaxel, FUSE-mount Supabase Storage at `/agent/`, implement block storage, model-driven download links. Delete ~1,000 lines.

**Architecture:** Blaxel Unikraft microVM runs rclone FUSE-mounted to Supabase Storage via S3 protocol. Same data accessible from platform (REST API) and sandbox (FUSE). Block storage replaces context.json — tool results persisted as files the sandbox reads via FUSE. `agent://` protocol for download links replaces artifact sync. (see origin: `docs/product/ideations/2026-04-04-blaxel-sandbox-migration-requirements.md`)

**Tech Stack:** `@blaxel/core` SDK, rclone + fuse3 (Alpine), Supabase Storage S3 protocol, Vitest

---

## Pre-work: Read These First

- **Requirements doc:** `docs/product/ideations/2026-04-04-blaxel-sandbox-migration-requirements.md` — the source of truth for every decision
- **Current sandbox code:** `src/lib/runner/tools/sandbox/` — 6 files you're replacing
- **Current tests:** `src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts` — the test patterns to follow
- **System prompt:** `src/lib/ai/system-prompt.ts:88-147` — `SANDBOX_PROMPT` you'll rewrite
- **Tool blocks:** `src/lib/storage/tool-blocks.ts` — `saveToolcallBlock()` you'll wire in
- **Agent paths:** `src/lib/storage/agent-paths.ts` — `/agent/` ↔ storage path translation
- **Protected paths:** `src/lib/storage/agent-files.ts:69-91` — `assertWritable()` read-only enforcement
- **Runner integration:** `src/lib/runner/run-agent.ts:317-350` — where sandbox is wired into the runner
- **Spike results:** Requirements doc Section 7 — proven rclone mount command and JWT config

---

### Task 1: Blaxel Docker Image + Template

**Files:**
- Create: `infra/blaxel/Dockerfile`
- Create: `infra/blaxel/entrypoint.sh`
- Create: `infra/blaxel/blaxel.toml`

No TDD for infra files — this is configuration. Verified via manual deploy + smoke test.

**Step 1: Create the Dockerfile**

```dockerfile
# infra/blaxel/Dockerfile
FROM node:22-alpine
WORKDIR /app

# Required: Blaxel sandbox API binary
COPY --from=ghcr.io/blaxel-ai/sandbox:latest /sandbox-api /usr/local/bin/sandbox-api

# FUSE mount + standard tools (match current Vercel golden snapshot)
RUN apk update && apk add --no-cache \
    rclone fuse3 \
    python3 py3-pip py3-pandas py3-numpy py3-pillow py3-matplotlib \
    libreoffice \
    sqlite jq curl tar unzip zip bash grep sed gawk \
    netcat-openbsd \
  && rm -rf /var/cache/apk/*

# Python packages not in Alpine repos
RUN pip3 install --break-system-packages \
    openpyxl xlsxwriter xlrd scipy scikit-learn statsmodels seaborn \
    pyarrow python-pptx python-docx pypdf pdfplumber reportlab img2pdf

# FUSE config
RUN echo "user_allow_other" >> /etc/fuse.conf
RUN mkdir -p /agent

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
```

**Step 2: Create the entrypoint**

```bash
#!/bin/sh
# infra/blaxel/entrypoint.sh
set -e

# Start sandbox-api in background
/usr/local/bin/sandbox-api &
while ! nc -z 127.0.0.1 8080; do sleep 0.1; done

# Write rclone config from env vars
mkdir -p /root/.config/rclone
cat > /root/.config/rclone/rclone.conf << RCLONEEOF
[supabase]
type = s3
provider = Other
access_key_id = ${S3_ACCESS_KEY_ID}
secret_access_key = ${S3_SECRET_ACCESS_KEY}
session_token = ${S3_SESSION_TOKEN}
endpoint = ${S3_ENDPOINT}
force_path_style = true
RCLONEEOF

# Mount Supabase Storage at /agent/ — rclone as PID 1 via exec
# If rclone dies, the VM dies → clean re-provision
exec rclone mount "supabase:${S3_BUCKET}/${CLIENT_PREFIX}" /agent \
  --config /root/.config/rclone/rclone.conf \
  --s3-list-version 2 \
  --vfs-cache-mode writes \
  --vfs-write-back 0s \
  --allow-other \
  --no-modtime \
  --dir-cache-time 0s
```

**Step 3: Create blaxel.toml**

```toml
# infra/blaxel/blaxel.toml
name = "sunder-sandbox"
type = "sandbox"

[runtime]
memory = 4096
generation = "mk3"
```

**Step 4: Deploy and verify**

```bash
cd infra/blaxel
bl deploy
# Note the IMAGE_ID from output

# Test: create sandbox, check mount
bl apply -f - <<EOF
apiVersion: blaxel.ai/v1alpha1
kind: Sandbox
metadata:
  name: test-mount
spec:
  runtime:
    image: <IMAGE_ID>
    memory: 4096
  env:
    - name: S3_ACCESS_KEY_ID
      value: "<project_ref>"
    - name: S3_SECRET_ACCESS_KEY
      value: "<anon_key>"
    - name: S3_SESSION_TOKEN
      value: "<jwt>"
    - name: S3_ENDPOINT
      value: "https://<project_ref>.supabase.co/storage/v1/s3"
    - name: S3_BUCKET
      value: "agent-files"
    - name: CLIENT_PREFIX
      value: "<client_id>"
EOF

bl run sandbox test-mount --path /process \
  --data '{"command": "ls /agent/ && echo MOUNT_OK", "waitForCompletion": true}'
# Expected: lists client files, ends with MOUNT_OK
```

**Step 5: Commit**

```bash
git add infra/blaxel/
git commit -m "feat(pr71): Blaxel sandbox Docker template with rclone FUSE mount"
```

---

### Task 2: JWT Minting Service

**Files:**
- Create: `src/lib/sandbox/mint-session.ts`
- Create: `src/lib/sandbox/__tests__/mint-session.test.ts`

This mints a short-lived Supabase session token for sandbox S3 auth. MUST use `auth.admin.generateLink()`, NOT direct JWT signing (see requirements R17).

**Step 1: Write the failing test**

```typescript
// src/lib/sandbox/__tests__/mint-session.test.ts
import { describe, expect, it, vi } from "vitest";

const mockGenerateLink = vi.fn();
const mockVerifyOtp = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: { generateLink: mockGenerateLink },
      verifyOtp: mockVerifyOtp,
    },
  }),
}));

import { mintSandboxSession } from "../mint-session";

describe("mintSandboxSession", () => {
  it("returns an access token for the given client email", async () => {
    mockGenerateLink.mockResolvedValue({
      data: {
        properties: { hashed_token: "abc123" },
      },
      error: null,
    });
    mockVerifyOtp.mockResolvedValue({
      data: {
        session: { access_token: "jwt-token-for-sandbox" },
      },
      error: null,
    });

    const result = await mintSandboxSession("client@sunder.test");

    expect(result).toBe("jwt-token-for-sandbox");
    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "client@sunder.test",
    });
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      type: "magiclink",
      token_hash: "abc123",
    });
  });

  it("throws if generateLink fails", async () => {
    mockGenerateLink.mockResolvedValue({
      data: null,
      error: { message: "user not found" },
    });

    await expect(mintSandboxSession("bad@test.com")).rejects.toThrow(
      "Failed to mint sandbox session: user not found",
    );
  });

  it("throws if verifyOtp fails", async () => {
    mockGenerateLink.mockResolvedValue({
      data: { properties: { hashed_token: "abc" } },
      error: null,
    });
    mockVerifyOtp.mockResolvedValue({
      data: null,
      error: { message: "otp expired" },
    });

    await expect(mintSandboxSession("client@test.com")).rejects.toThrow(
      "Failed to verify sandbox OTP: otp expired",
    );
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/sandbox/__tests__/mint-session.test.ts
```
Expected: FAIL — `mintSandboxSession` not found

**Step 3: Write minimal implementation**

```typescript
// src/lib/sandbox/mint-session.ts
/**
 * Mints a short-lived Supabase Auth session token for sandbox FUSE mount.
 *
 * Uses auth.admin.generateLink() → verifyOtp() to obtain a real access_token.
 * MUST NOT sign JWTs directly — a leaked JWT secret is catastrophic.
 * See: docs/product/ideations/2026-04-04-blaxel-sandbox-migration-requirements.md R17
 *
 * @module lib/sandbox/mint-session
 */
import { createAdminClient } from "@/lib/supabase/admin";

export async function mintSandboxSession(email: string): Promise<string> {
  const supabase = createAdminClient();

  const { data: linkData, error: linkError } =
    await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

  if (linkError || !linkData?.properties?.hashed_token) {
    throw new Error(
      `Failed to mint sandbox session: ${linkError?.message ?? "no hashed_token"}`,
    );
  }

  const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });

  if (otpError || !otpData?.session?.access_token) {
    throw new Error(
      `Failed to verify sandbox OTP: ${otpError?.message ?? "no access_token"}`,
    );
  }

  return otpData.session.access_token;
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/sandbox/__tests__/mint-session.test.ts
```
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/lib/sandbox/
git commit -m "feat(pr71): JWT minting service for sandbox FUSE auth"
```

---

### Task 3: Rewrite create-lazy-bash-tool.ts

**Files:**
- Modify: `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`
- Rewrite: `src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts`

This is the core migration. Replace Vercel Sandbox + bash-tool with Blaxel SDK + process.exec.

**Step 1: Write the failing tests (new test file)**

```typescript
// src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateIfNotExists = vi.fn();
const mockDelete = vi.fn();
const mockProcessExec = vi.fn();
const mockProcessGet = vi.fn();
const mockMintSession = vi.fn();

vi.mock("@blaxel/core", () => ({
  SandboxInstance: {
    createIfNotExists: (...args: unknown[]) => mockCreateIfNotExists(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock("@/lib/sandbox/mint-session", () => ({
  mintSandboxSession: (...args: unknown[]) => mockMintSession(...args),
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    BL_SANDBOX_IMAGE: "sunder-sandbox-image",
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-123",
  }),
}));

import {
  createLazyBashTool,
  type LazyBashToolOptions,
} from "../create-lazy-bash-tool";

function makeMockSandbox() {
  return {
    metadata: { name: "sunder-test-sandbox" },
    process: {
      exec: mockProcessExec,
      get: mockProcessGet,
    },
  };
}

function asExecutable(tool: ReturnType<typeof createLazyBashTool>["tool"]) {
  return tool as unknown as {
    execute: (input: { command: string }, opts: unknown) => Promise<{
      stdout: string;
      stderr: string;
      exitCode: number;
    }>;
  };
}

describe("createLazyBashTool (Blaxel)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const sandbox = makeMockSandbox();
    mockCreateIfNotExists.mockResolvedValue(sandbox);
    mockMintSession.mockResolvedValue("jwt-token-abc");
    mockProcessExec.mockResolvedValue({ logs: "hello world" });
    mockProcessGet.mockResolvedValue({ logs: "hello world", exitCode: 0 });
  });

  it("does not create sandbox until first execute", async () => {
    const { tool, cleanup } = createLazyBashTool({
      clientId: "client-1",
      clientEmail: "client@test.com",
      runId: "run-1",
    });

    expect(mockCreateIfNotExists).not.toHaveBeenCalled();
    expect(tool).toBeDefined();
    await cleanup();
  });

  it("boots Blaxel sandbox with rclone env vars on first execute", async () => {
    const { tool, cleanup } = createLazyBashTool({
      clientId: "client-1",
      clientEmail: "client@test.com",
      runId: "run-1",
    });

    await asExecutable(tool).execute({ command: "echo hi" }, {});

    expect(mockMintSession).toHaveBeenCalledWith("client@test.com");
    expect(mockCreateIfNotExists).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringContaining("sunder-"),
        image: "sunder-sandbox-image",
        memory: 4096,
        region: "us-was-1",
        envs: expect.arrayContaining([
          expect.objectContaining({ name: "S3_SESSION_TOKEN", value: "jwt-token-abc" }),
          expect.objectContaining({ name: "CLIENT_PREFIX", value: "client-1" }),
        ]),
      }),
    );
    await cleanup();
  });

  it("executes command via sandbox.process.exec", async () => {
    const { tool, cleanup } = createLazyBashTool({
      clientId: "client-1",
      clientEmail: "client@test.com",
      runId: "run-1",
    });

    const result = await asExecutable(tool).execute({ command: "echo hello" }, {});

    expect(mockProcessExec).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "echo hello",
        waitForCompletion: true,
      }),
    );
    expect(result.stdout).toBe("hello world");
    await cleanup();
  });

  it("only creates one sandbox even if two execute calls race", async () => {
    const { tool, cleanup } = createLazyBashTool({
      clientId: "client-1",
      clientEmail: "client@test.com",
      runId: "run-1",
    });

    await Promise.all([
      asExecutable(tool).execute({ command: "echo 1" }, {}),
      asExecutable(tool).execute({ command: "echo 2" }, {}),
    ]);

    expect(mockCreateIfNotExists).toHaveBeenCalledTimes(1);
    await cleanup();
  });

  it("retries initialization after transient failure", async () => {
    mockCreateIfNotExists
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(makeMockSandbox());

    const { tool, cleanup } = createLazyBashTool({
      clientId: "client-1",
      clientEmail: "client@test.com",
      runId: "run-1",
    });

    await expect(
      asExecutable(tool).execute({ command: "echo 1" }, {}),
    ).rejects.toThrow("network error");

    const result = await asExecutable(tool).execute({ command: "echo 2" }, {});
    expect(result.stdout).toBe("hello world");
    expect(mockCreateIfNotExists).toHaveBeenCalledTimes(2);
    await cleanup();
  });

  it("returns no sandbox errors as structured result", async () => {
    const { tool } = createLazyBashTool({
      clientId: "client-1",
      clientEmail: "client@test.com",
      runId: "run-1",
      sandboxImage: "", // empty = not configured
    });

    const result = await asExecutable(tool).execute({ command: "echo hi" }, {});
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("not configured");
  });

  it("cleanup is safe when sandbox was never created", async () => {
    const { cleanup } = createLazyBashTool({
      clientId: "client-1",
      clientEmail: "client@test.com",
      runId: "run-1",
    });

    await cleanup();
    await cleanup(); // idempotent
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts
```
Expected: FAIL — new options interface doesn't match, Blaxel SDK mock not wired

**Step 3: Implement the new create-lazy-bash-tool.ts**

Rewrite `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts`. The key changes:
- New options: `clientId`, `clientEmail`, `runId` (no `snapshotId`, `getPreloadFiles`, `getContextEntries`, `fileClient`)
- Blaxel `SandboxInstance.createIfNotExists()` instead of `Sandbox.create()`
- `sandbox.process.exec()` instead of `createBashTool()` wrapper
- JWT minting via `mintSandboxSession()`
- No preload, no sync, no context.json, no artifact hashing
- Keep: lazy-init double-checked promise, cleanup, getSandbox getter

See the plan doc for the full implementation spec: `docs/product/plans/2026-04-07-001-feat-blaxel-sandbox-migration-plan.md`, Phase 2.

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts
```
Expected: PASS (7 tests)

**Step 5: Commit**

```bash
git add src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts \
        src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts
git commit -m "feat(pr71): rewrite create-lazy-bash-tool for Blaxel + rclone FUSE"
```

---

### Task 4: Wire Sandbox into Runner

**Files:**
- Modify: `src/lib/runner/run-agent.ts:317-350`
- Modify: `src/lib/runner/tools/sandbox/index.ts`
- Modify: `src/lib/runner/tools/sandbox/types.ts`

**Step 1: Update the barrel exports**

Remove deleted module exports from `index.ts`. Keep `createLazyBashTool` and its types. Remove `buildContextJson`, `buildPreloadFiles`, `syncOutputArtifacts`, `SandboxContextEntry`, `SandboxPreloadFile`, `SyncedArtifact`.

**Step 2: Update run-agent.ts integration**

Remove:
- `toolResultAccumulator` array (line 317)
- `getPreloadFiles` callback (lines 324-328)
- `getContextEntries` callback (line 330)
- `fileClient` parameter
- `buildPreloadFiles` import
- `SandboxContextEntry` import

Add:
- `clientEmail` lookup (from Supabase Auth user data)
- Pass `clientId`, `clientEmail`, `runId` to `createLazyBashTool()`

Change:
- `includeSandbox` condition: check for `BL_SANDBOX_IMAGE` env var instead of `SANDBOX_GOLDEN_SNAPSHOT_ID`

**Step 3: Run existing runner tests**

```bash
npx vitest run src/lib/runner/
```
Expected: PASS (existing tests should still pass after wiring changes)

**Step 4: Commit**

```bash
git add src/lib/runner/
git commit -m "feat(pr71): wire Blaxel sandbox into agent runner"
```

---

### Task 5: Block Storage — Add runId to Path

**Files:**
- Modify: `src/lib/storage/tool-blocks.ts`
- Modify: `src/lib/storage/__tests__/tool-blocks.test.ts` (create if not exists)

**Step 1: Write the failing test**

```typescript
// src/lib/storage/__tests__/tool-blocks.test.ts
import { describe, expect, it, vi } from "vitest";

const mockUpload = vi.fn();

vi.mock("@/lib/storage/agent-files", () => ({
  AGENT_FILES_BUCKET: "agent-files",
}));

// Mock supabase client
function createMockSupabase() {
  mockUpload.mockResolvedValue({ error: null });
  return {
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
      })),
    },
  } as unknown;
}

import { saveToolcallBlock } from "../tool-blocks";

describe("saveToolcallBlock", () => {
  it("includes runId in the storage path", async () => {
    const supabase = createMockSupabase();

    await saveToolcallBlock(
      supabase as any,
      "client-1",
      "run-abc",
      "tc-xyz",
      { query: "test" },
      { results: [1, 2, 3] },
    );

    expect(mockUpload).toHaveBeenCalledWith(
      "client-1/toolcalls/run-abc/tc-xyz/result.json",
      expect.any(String),
      expect.objectContaining({ contentType: "application/json; charset=utf-8" }),
    );
    expect(mockUpload).toHaveBeenCalledWith(
      "client-1/toolcalls/run-abc/tc-xyz/args.json",
      expect.any(String),
      expect.objectContaining({ contentType: "application/json; charset=utf-8" }),
    );
  });

  it("does not throw on upload failure (fail-open)", async () => {
    mockUpload.mockResolvedValue({ error: { message: "storage error" } });
    const supabase = createMockSupabase();

    // Should not throw
    await saveToolcallBlock(
      supabase as any,
      "client-1",
      "run-abc",
      "tc-xyz",
      {},
      { data: "test" },
    );
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/storage/__tests__/tool-blocks.test.ts
```
Expected: FAIL — `saveToolcallBlock` doesn't accept `runId` parameter

**Step 3: Update saveToolcallBlock**

Add `runId` parameter. Update path to `{clientId}/toolcalls/{runId}/{toolCallId}/result.json`. Wrap uploads in try-catch for fail-open behavior (R28).

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/storage/__tests__/tool-blocks.test.ts
```
Expected: PASS

**Step 5: Update callers**

Search for all callers of `saveToolcallBlock` and add the `runId` parameter:
- `src/lib/runner/tools/subagents/run-subagent.ts` (lines 171-188)
- Any new callers in `run-agent.ts` from Task 4

**Step 6: Commit**

```bash
git add src/lib/storage/tool-blocks.ts src/lib/storage/__tests__/
git commit -m "feat(pr71): add runId to block storage paths, fail-open on write error"
```

---

### Task 6: Wire Block Storage into Tool Execution

**Files:**
- Modify: `src/lib/runner/run-agent.ts` (onStepFinish callback)

**Step 1: Research the hook point**

The requirement (R27) says: block write MUST complete BEFORE the tool result is returned to the LLM.

Current `onStepFinish` fires AFTER the result is already returned. Check AI SDK docs for:
- `experimental_toolResultHandlerMiddleware` — transforms tool results before they reach the model
- Wrapping each tool's `execute()` — adds block write + toolCallId to return value

Choose the approach that satisfies R27 (synchronous, before model sees result).

**Step 2: Implement block persistence**

In the chosen hook point, for each tool result:
1. Call `saveToolcallBlock(supabase, clientId, runId, toolCallId, args, result)`
2. If successful, append `toolCallId` to the result object
3. If failed (catch), log warning, return result without toolCallId (R28 fail-open)

**Step 3: Test via integration**

```bash
# Run existing runner tests
npx vitest run src/lib/runner/
```

**Step 4: Commit**

```bash
git add src/lib/runner/run-agent.ts
git commit -m "feat(pr71): persist block files synchronously before tool result reaches model"
```

---

### Task 7: Update System Prompt

**Files:**
- Modify: `src/lib/ai/system-prompt.ts:88-147`

**Step 1: Write the failing test**

```typescript
// Add to existing system-prompt.test.ts or create new
import { describe, expect, it } from "vitest";
import { SANDBOX_PROMPT } from "../system-prompt";

describe("SANDBOX_PROMPT (Blaxel)", () => {
  it("references /agent/ filesystem, not /vercel/sandbox/workspace", () => {
    expect(SANDBOX_PROMPT).toContain("/agent/");
    expect(SANDBOX_PROMPT).not.toContain("/vercel/sandbox/workspace");
    expect(SANDBOX_PROMPT).not.toContain("input/context.json");
  });

  it("includes FUSE latency guidance", () => {
    expect(SANDBOX_PROMPT).toContain("/tmp/");
    expect(SANDBOX_PROMPT).toContain("I/O-heavy");
  });

  it("includes block storage guidance", () => {
    expect(SANDBOX_PROMPT).toContain("toolcalls");
    expect(SANDBOX_PROMPT).toContain("result.json");
    expect(SANDBOX_PROMPT).toContain("Never enumerate or hard-code data");
  });

  it("includes download link guidance", () => {
    expect(SANDBOX_PROMPT).toContain("agent://");
  });

  it("describes Alpine Linux, not Amazon Linux", () => {
    expect(SANDBOX_PROMPT).toContain("Alpine");
    expect(SANDBOX_PROMPT).not.toContain("Amazon Linux");
  });
});
```

**Step 2: Run to verify fails**

```bash
npx vitest run src/lib/ai/__tests__/system-prompt.test.ts
```

**Step 3: Rewrite SANDBOX_PROMPT**

Replace `src/lib/ai/system-prompt.ts:88-147` with the new prompt matching Tasklet's `<sandbox>` section pattern. Key changes:
- Alpine Linux (not Amazon Linux)
- `/agent/` FUSE-mounted cloud storage (not workspace directory)
- `/tmp/` for I/O-heavy work
- `<blocks>` section: read tool results from `/agent/toolcalls/{runId}/{toolCallId}/result.json`
- `<processing-data>` section: never hard-code data, read from filesystem
- `agent://` download link instructions
- Remove all references to `input/context.json`

**Step 4: Run to verify passes**

```bash
npx vitest run src/lib/ai/
```

**Step 5: Commit**

```bash
git add src/lib/ai/system-prompt.ts src/lib/ai/__tests__/
git commit -m "feat(pr71): rewrite sandbox system prompt for Blaxel + FUSE + blocks"
```

---

### Task 8: agent:// Protocol Resolver

**Files:**
- Create: `src/lib/chat/agent-protocol-resolver.ts`
- Create: `src/lib/chat/__tests__/agent-protocol-resolver.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/lib/chat/__tests__/agent-protocol-resolver.test.ts
import { describe, expect, it } from "vitest";
import { resolveAgentProtocol, isAgentProtocolLink } from "../agent-protocol-resolver";

describe("isAgentProtocolLink", () => {
  it("matches agent:// links", () => {
    expect(isAgentProtocolLink("agent:///home/report.pdf")).toBe(true);
  });

  it("does not match regular paths", () => {
    expect(isAgentProtocolLink("/agent/home/report.pdf")).toBe(false);
    expect(isAgentProtocolLink("https://example.com")).toBe(false);
  });
});

describe("resolveAgentProtocol", () => {
  it("extracts the path from agent:// link", () => {
    const result = resolveAgentProtocol("agent:///home/report.pdf");
    expect(result).toBe("home/report.pdf");
  });

  it("decodes URL-encoded characters", () => {
    const result = resolveAgentProtocol("agent:///home/Q4%20Report.pdf");
    expect(result).toBe("home/Q4 Report.pdf");
  });

  it("rejects paths outside the allowlist", () => {
    expect(() => resolveAgentProtocol("agent:///memory/SOUL.md")).toThrow("not downloadable");
    expect(() => resolveAgentProtocol("agent:///skills/system/foo.md")).toThrow("not downloadable");
    expect(() => resolveAgentProtocol("agent:///toolcalls/run-1/tc-1/result.json")).toThrow("not downloadable");
    expect(() => resolveAgentProtocol("agent:///subagents/workflow.md")).toThrow("not downloadable");
  });

  it("allows /home/ and /uploads/ paths", () => {
    expect(resolveAgentProtocol("agent:///home/data.csv")).toBe("home/data.csv");
    expect(resolveAgentProtocol("agent:///uploads/user-file.xlsx")).toBe("uploads/user-file.xlsx");
  });

  it("rejects path traversal", () => {
    expect(() => resolveAgentProtocol("agent:///home/../memory/SOUL.md")).toThrow();
  });
});
```

**Step 2: Run to verify fails**

```bash
npx vitest run src/lib/chat/__tests__/agent-protocol-resolver.test.ts
```

**Step 3: Implement**

```typescript
// src/lib/chat/agent-protocol-resolver.ts
/**
 * Resolves agent:// protocol links to Supabase Storage paths.
 * @module lib/chat/agent-protocol-resolver
 */

const AGENT_PROTOCOL_REGEX = /^agent:\/\/\/(.*)/;
const ALLOWED_PREFIXES = ["home/", "uploads/"];

export function isAgentProtocolLink(href: string): boolean {
  return AGENT_PROTOCOL_REGEX.test(href);
}

export function resolveAgentProtocol(href: string): string {
  const match = href.match(AGENT_PROTOCOL_REGEX);
  if (!match) throw new Error("Not an agent:// link");

  const rawPath = match[1];
  const decoded = rawPath
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");

  if (decoded.includes("..")) {
    throw new Error("Path traversal not allowed");
  }

  const isAllowed = ALLOWED_PREFIXES.some((prefix) => decoded.startsWith(prefix));
  if (!isAllowed) {
    throw new Error(`Path "${decoded}" is not downloadable. Only /home/ and /uploads/ are allowed.`);
  }

  return decoded;
}
```

**Step 4: Run to verify passes**

```bash
npx vitest run src/lib/chat/__tests__/agent-protocol-resolver.test.ts
```

**Step 5: Commit**

```bash
git add src/lib/chat/agent-protocol-resolver.ts src/lib/chat/__tests__/
git commit -m "feat(pr71): agent:// protocol resolver with path allowlist"
```

---

### Task 9: Wire agent:// into Chat UI

**Files:**
- Modify: `src/components/chat/message-bubble.tsx` (or markdown renderer)

**Step 1: Find the markdown link rendering code**

Check how markdown links are currently rendered in assistant messages. Look for the rehype/remark pipeline or custom link component.

**Step 2: Add agent:// interception**

In the link renderer, check `isAgentProtocolLink(href)`. If true, resolve the path and generate an authenticated download URL via Supabase Storage. Open as download on click.

**Step 3: Test manually**

Send a message where the agent outputs an `agent://` link. Verify the link resolves and downloads the correct file.

**Step 4: Commit**

```bash
git add src/components/chat/
git commit -m "feat(pr71): resolve agent:// links in chat to Supabase downloads"
```

---

### Task 10: Delete Old Vercel Sandbox Code

**Files:**
- Delete: `src/lib/runner/tools/sandbox/build-preload-files.ts`
- Delete: `src/lib/runner/tools/sandbox/sync-output-artifacts.ts`
- Delete: `src/lib/runner/tools/sandbox/build-context-json.ts`
- Delete: `src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts`
- Delete: `src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts`
- Delete: `src/lib/runner/tools/sandbox/__tests__/build-context-json.test.ts`
- Modify: `package.json` — remove `@vercel/sandbox`, `bash-tool`
- Modify: `.env.example` — remove `SANDBOX_GOLDEN_SNAPSHOT_ID`, add `BL_SANDBOX_IMAGE`

**Step 1: Delete files**

```bash
rm src/lib/runner/tools/sandbox/build-preload-files.ts
rm src/lib/runner/tools/sandbox/sync-output-artifacts.ts
rm src/lib/runner/tools/sandbox/build-context-json.ts
rm src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts
rm src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts
rm src/lib/runner/tools/sandbox/__tests__/build-context-json.test.ts
```

**Step 2: Remove packages**

```bash
npm uninstall @vercel/sandbox bash-tool
```

**Step 3: Update .env.example**

Remove:
```
SANDBOX_GOLDEN_SNAPSHOT_ID=
VERCEL_TOKEN=
VERCEL_TEAM_ID=
VERCEL_PROJECT_ID=
```

Add:
```
BL_SANDBOX_IMAGE=          # Blaxel sandbox template image ID
BL_WORKSPACE=              # Blaxel workspace name (or use `bl login`)
```

**Step 4: Run full test suite**

```bash
npx vitest run
```
Expected: PASS — no references to deleted modules, no broken imports

**Step 5: Commit**

```bash
git add -A
git commit -m "chore(pr71): delete Vercel Sandbox pipeline, remove @vercel/sandbox + bash-tool deps"
```

---

### Task 11: End-to-End Verification

No code — manual QA.

**Step 1: Run QA surface 29 scenarios**

See `scripts/qa/scenarios.ts` — filter for `surface: "29-sandbox"`. Run each scenario against the new Blaxel backend.

**Step 2: Test mid-session file visibility**

1. Start a chat
2. Ask the agent to download a file from Google Drive
3. Ask the agent to analyze that file using bash
4. Verify the file is accessible in the sandbox without "file not found"

**Step 3: Test download links**

1. Ask the agent to create a CSV analysis
2. Verify the agent outputs an `agent://` link
3. Click the link in the chat UI
4. Verify the file downloads correctly

**Step 4: Test block storage**

1. Ask the agent to search CRM for deals
2. Ask the agent to analyze those deals with a Python script
3. Verify the script reads from `/agent/toolcalls/{runId}/{toolCallId}/result.json`

**Step 5: Final commit**

```bash
git commit --allow-empty -m "feat(pr71): Blaxel sandbox migration complete — all QA scenarios pass"
```

---

## Relevant Files

### Created
- `infra/blaxel/Dockerfile`
- `infra/blaxel/entrypoint.sh`
- `infra/blaxel/blaxel.toml`
- `src/lib/sandbox/mint-session.ts`
- `src/lib/sandbox/__tests__/mint-session.test.ts`
- `src/lib/chat/agent-protocol-resolver.ts`
- `src/lib/chat/__tests__/agent-protocol-resolver.test.ts`

### Modified
- `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts` (rewritten)
- `src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts` (rewritten)
- `src/lib/runner/tools/sandbox/index.ts` (remove deleted exports)
- `src/lib/runner/tools/sandbox/types.ts` (remove unused types)
- `src/lib/runner/run-agent.ts` (new sandbox wiring)
- `src/lib/storage/tool-blocks.ts` (add runId parameter)
- `src/lib/ai/system-prompt.ts` (rewrite SANDBOX_PROMPT)
- `src/components/chat/message-bubble.tsx` (agent:// link resolution)
- `package.json` (remove vercel/sandbox, bash-tool)
- `.env.example` (new env vars)

### Deleted
- `src/lib/runner/tools/sandbox/build-preload-files.ts` (197 lines)
- `src/lib/runner/tools/sandbox/sync-output-artifacts.ts` (116 lines)
- `src/lib/runner/tools/sandbox/build-context-json.ts` (80 lines)
- `src/lib/runner/tools/sandbox/__tests__/build-preload-files.test.ts` (385 lines)
- `src/lib/runner/tools/sandbox/__tests__/sync-output-artifacts.test.ts` (96 lines)
- `src/lib/runner/tools/sandbox/__tests__/build-context-json.test.ts` (68 lines)

### Tests
- `src/lib/sandbox/__tests__/mint-session.test.ts` (3 tests)
- `src/lib/runner/tools/sandbox/__tests__/create-lazy-bash-tool.test.ts` (7 tests, rewritten)
- `src/lib/storage/__tests__/tool-blocks.test.ts` (2 tests)
- `src/lib/ai/__tests__/system-prompt.test.ts` (5 tests)
- `src/lib/chat/__tests__/agent-protocol-resolver.test.ts` (7 tests)
