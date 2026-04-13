# Unified File Reference Model Implementation Plan

**Goal:** Normalize every durable file in Sunder around one canonical identifier (`storagePath`) so the agent, chat UI, CRM, connection tools, and sandbox all talk about the same file the same way.

**Architecture:** This extends the earlier unified-filesystem direction instead of replacing it. Keep `agent-files` as the single bucket, keep `storage_read` / `storage_write` as the model-facing file primitives, and keep `/api/files/download` as the only signed download route. The core change is a global durable file contract with `storagePath` as the source of truth plus metadata (`filename`, `mediaType`, `size?`). `agentPath` is treated as a derived view via `toModelPath(storagePath)` when the model needs a `/agent/...` path. CRM attachments become readable through `storage_read` by returning `storage_path` and a derived `agent_path` in tool results, connection downloads are bridged into durable storage and returned the same way, and sandbox outputs keep using `/agent/home/...` links.

**Tech Stack:** Next.js 15 App Router, React 19, Anthropic Managed Agents, Supabase Storage, Composio, Vitest, React Testing Library, Zod

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" - Step
- "Run it to make sure it fails" - Step
- "Implement the minimal code to make the test pass" - Step
- "Run the tests and make sure they pass" - Step
- "Commit" - Step

## Constraints

- Use `@test-driven-development` for every parent task.
- Reuse the existing `/agent/` virtual root and `toModelPath()` / `toStoragePath()` helpers.
- Reuse `app/api/files/download`; do not add a second download architecture.
- Do **not** add a new `artifacts` table for this implementation.
- Do **not** add a new “read attachment” tool if the problem can be solved by returning an `agentPath` and reusing `storage_read`.
- Keep legacy fallback behavior where needed for old messages that only have `url`.
- Prefer one shared file reference type over per-surface ad hoc response shapes.
- Treat `storagePath` as canonical. Do not persist `agentPath` into chat/file schemas unless there is a specific proven need.
- Keep commits small and surface-scoped.

## Relevant Files

**Create:**
- `src/lib/files/agent-file-ref.ts`
- `src/lib/files/__tests__/agent-file-ref.test.ts`

**Modify:**
- `src/lib/storage/agent-paths.ts`
- `src/lib/managed-agents/tools/declarations.ts`
- `src/lib/managed-agents/tools/crm/index.ts`
- `src/lib/managed-agents/tools/crm/list-attachments.ts`
- `src/lib/managed-agents/tools/crm/__tests__/list-attachments.test.ts`
- `src/lib/managed-agents/tools/crm/search.ts`
- `src/lib/managed-agents/tools/crm/__tests__/search.test.ts`
- `src/lib/managed-agents/tools/crm/read-attachment.ts`
- `src/lib/managed-agents/tools/storage/storage-read.ts`
- `src/lib/managed-agents/tools/storage/__tests__/storage-read.test.ts`
- `src/lib/managed-agents/types.ts`
- `src/lib/managed-agents/adapter.ts`
- `src/lib/managed-agents/__tests__/adapter.test.ts`
- `src/lib/managed-agents/download-session-files.ts`
- `src/lib/managed-agents/__tests__/download-session-files.test.ts`
- `src/components/chat/file-parts.ts`
- `src/components/chat/message-bubble.test.tsx`
- `src/components/ai-elements/message.tsx`
- `src/lib/composio/activated-tools.ts`
- `src/lib/composio/__tests__/activated-tools.test.ts`
- `src/lib/managed-agents/upload-files-for-session.ts`
- `src/lib/managed-agents/__tests__/upload-files-for-session.test.ts`
- `scripts/managed-agents/create-agent.ts`
- `src/lib/managed-agents/session-kickoff.ts`
- `src/lib/managed-agents/__tests__/session-kickoff.test.ts`

**Reference:**
- `docs/product/tasks/2026-03-30-pr63-unified-agent-filesystem-tasklist.md`
- `docs/tasks/2026-04-13-chat-artifact-downloads-tasklist.md`
- `roadmap docs/Sunder - Source of Truth/references/tasklet/csv-lead-cleaning-sandbox-workflow.md`
- `roadmap docs/Sunder - Source of Truth/references/tasklet/gmail-sandbox-execution-trace.md`

## Non-Goals

- No new bucket
- No relay/stream download endpoint
- No separate CRM attachment read tool
- No redesign of the chat attachment UI
- No full “artifact platform” with lifecycle tables, cron cleanup, or revocation logic

---

### Task 1: Create One Shared `AgentFileRef` Contract

**Files:**
- Create: `src/lib/files/agent-file-ref.ts`
- Create: `src/lib/files/__tests__/agent-file-ref.test.ts`
- Modify: `src/lib/storage/agent-paths.ts`

**Why this task exists:** The codebase currently passes file identity around as a partial mix of `url`, `storagePath`, `filename`, and `mediaType`. The first global step is to define one shape for “durable file known to the system”, with `storagePath` as the canonical key.

**Step 1: Write the failing helper tests**

Add `src/lib/files/__tests__/agent-file-ref.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildAgentFileRef,
  isAgentFileRef,
} from "../agent-file-ref";

describe("buildAgentFileRef", () => {
  it("keeps storagePath as the source of truth", () => {
    expect(buildAgentFileRef({
      storagePath: "attachments/deal/deal-1/report.csv",
      filename: "report.csv",
      mediaType: "text/csv",
      size: 123,
    })).toEqual({
      storagePath: "attachments/deal/deal-1/report.csv",
      filename: "report.csv",
      mediaType: "text/csv",
      size: 123,
    });
  });
});

describe("isAgentFileRef", () => {
  it("accepts a complete durable file reference", () => {
    expect(isAgentFileRef({
      storagePath: "home/output.csv",
      filename: "output.csv",
      mediaType: "text/csv",
    })).toBe(true);
  });
});

describe("toAgentPath", () => {
  it("derives the model-facing path from storagePath", () => {
    expect(toAgentPath({ storagePath: "attachments/deal/deal-1/report.csv" }))
      .toBe("/agent/attachments/deal/deal-1/report.csv");
  });
});
```

**Step 2: Run the helper tests to verify they fail**

Run:

```bash
pnpm vitest run src/lib/files/__tests__/agent-file-ref.test.ts
```

Expected: FAIL because the module does not exist yet.

**Step 3: Write the minimal shared contract**

Create `src/lib/files/agent-file-ref.ts`:

```ts
/**
 * Shared durable file reference used across agent tools, chat rendering,
 * sandbox outputs, and connection bridges.
 * @module lib/files/agent-file-ref
 */
import { z } from "zod";

import { toModelPath } from "@/lib/storage/agent-paths";

export const agentFileRefSchema = z.object({
  storagePath: z.string().min(1),
  filename: z.string().min(1),
  mediaType: z.string().min(1),
  size: z.number().int().nonnegative().optional(),
});

export type AgentFileRef = z.infer<typeof agentFileRefSchema>;

export function buildAgentFileRef(input: {
  storagePath: string;
  filename: string;
  mediaType: string;
  size?: number;
}): AgentFileRef {
  return {
    storagePath: input.storagePath,
    filename: input.filename,
    mediaType: input.mediaType,
    ...(input.size === undefined ? {} : { size: input.size }),
  };
}

export function isAgentFileRef(value: unknown): value is AgentFileRef {
  return agentFileRefSchema.safeParse(value).success;
}

export function toAgentPath(file: Pick<AgentFileRef, "storagePath">): string {
  return toModelPath(file.storagePath);
}
```

**Step 4: Add one negative validation test**

Add to `src/lib/files/__tests__/agent-file-ref.test.ts`:

```ts
it("rejects an empty storagePath", () => {
  expect(isAgentFileRef({
    storagePath: "",
    filename: "report.csv",
    mediaType: "text/csv",
  })).toBe(false);
});
```

**Step 5: Run the focused tests**

Run:

```bash
pnpm vitest run src/lib/files/__tests__/agent-file-ref.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/files/agent-file-ref.ts src/lib/files/__tests__/agent-file-ref.test.ts
git commit -m "feat: add shared AgentFileRef contract"
```

---

### Task 2: Make CRM Attachment Discovery Return Readable Agent Paths

**Files:**
- Modify: `src/lib/managed-agents/tools/declarations.ts`
- Modify: `src/lib/managed-agents/tools/crm/index.ts`
- Modify: `src/lib/managed-agents/tools/crm/list-attachments.ts`
- Modify: `src/lib/managed-agents/tools/crm/__tests__/list-attachments.test.ts`
- Modify: `src/lib/managed-agents/tools/crm/search.ts`
- Modify: `src/lib/managed-agents/tools/crm/__tests__/search.test.ts`
- Modify: `src/lib/managed-agents/tools/crm/read-attachment.ts`
- Reference: `src/lib/crm/schemas.ts`

**Why this task exists:** CRM attachments need one boring path model no matter how the agent discovers them. Today the standalone list tool omits `storage_path`, `search_crm` attachment includes omit `storage_path`, and the separate read-attachment tool adds an unnecessary copy step into `/agent/downloads/...`. Fix discovery in both places and make `storage_read` the only durable attachment reader.

**Step 1: Write the failing CRM attachment discovery tests**

Extend `src/lib/managed-agents/tools/crm/__tests__/list-attachments.test.ts`:

```ts
it("returns storage_path-derived agent_path for each attachment", async () => {
  const attachments = [
    {
      attachment_id: "a1",
      filename: "report.csv",
      file_category: "spreadsheet",
      file_size: 2048,
      content_type: "text/csv",
      storage_path: "attachments/deal/deal-1/report.csv",
      created_at: "2026-04-05T00:00:00Z",
    },
  ];

  const { client } = createMockSupabase({
    record_attachments: { data: attachments, error: null },
  });

  const result = await listRecordAttachmentsTool.execute(
    { record_type: "deal", record_id: CONTACT_ID },
    makeContext(client),
  );

  expect(result).toEqual({
    success: true,
    attachments: [
      expect.objectContaining({
        storage_path: "attachments/deal/deal-1/report.csv",
        agent_path: "/agent/attachments/deal/deal-1/report.csv",
      }),
    ],
    count: 1,
  });
});

it("returns agent_path: null when storage_path is missing", async () => {
  const attachments = [
    {
      attachment_id: "a1",
      filename: "legacy.csv",
      file_category: "spreadsheet",
      file_size: 2048,
      content_type: "text/csv",
      storage_path: null,
      created_at: "2026-04-05T00:00:00Z",
    },
  ];

  const { client } = createMockSupabase({
    record_attachments: { data: attachments, error: null },
  });

  const result = await listRecordAttachmentsTool.execute(
    { record_type: "deal", record_id: CONTACT_ID },
    makeContext(client),
  );

  expect(result).toEqual({
    success: true,
    attachments: [
      expect.objectContaining({
        storage_path: null,
        agent_path: null,
      }),
    ],
    count: 1,
  });
});
```

Extend `src/lib/managed-agents/tools/crm/__tests__/search.test.ts` with an attachments include case:

```ts
it("includes storage_path-derived agent_path on attachment includes", async () => {
  const attachment = {
    attachment_id: "a1",
    filename: "report.csv",
    file_category: "spreadsheet",
    file_size: 2048,
    content_type: "text/csv",
    storage_path: "attachments/deal/deal-1/report.csv",
    created_at: "2026-04-05T00:00:00Z",
    client_id: CLIENT_ID,
    record_id: DEAL_ID,
  };

  const result = await searchCrmTool.execute(
    {
      entity: "deals",
      query: "Cavenagh",
      include: ["attachments"],
    },
    makeContext(
      createMockSupabase({
        deals: { data: [{ deal_id: DEAL_ID, address: "21 Cavenagh Road" }], error: null },
        record_attachments: { data: [attachment], error: null },
      }),
    ),
  );

  expect(result).toEqual(
    expect.objectContaining({
      results: [
        expect.objectContaining({
          _attachments: [
            expect.objectContaining({
              storage_path: "attachments/deal/deal-1/report.csv",
              agent_path: "/agent/attachments/deal/deal-1/report.csv",
            }),
          ],
        }),
      ],
    }),
  );
});
```

Add one declaration-registry assertion in the declaration test file or the nearest existing managed-agent declaration test:

```ts
expect(MANAGED_AGENT_TOOL_DECLARATIONS.map((tool) => tool.name))
  .toContain("list_record_attachments");
expect(MANAGED_AGENT_TOOL_DECLARATIONS.map((tool) => tool.name))
  .not.toContain("read_record_attachment");
```

**Step 2: Run the test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/managed-agents/tools/crm/__tests__/list-attachments.test.ts src/lib/managed-agents/tools/crm/__tests__/search.test.ts
```

Expected: FAIL because `storage_path` is not selected, `agent_path` is not returned on either discovery path, and the standalone list tool is not yet registered.

**Step 3: Select `storage_path` and append a derived `agent_path` everywhere attachments are surfaced**

In `src/lib/managed-agents/tools/crm/list-attachments.ts`:

```ts
import { toModelPath } from "@/lib/storage/agent-paths";
```

Change the select list:

```ts
.select("attachment_id, filename, file_category, file_size, content_type, storage_path, created_at")
```

Map the rows before returning:

```ts
const attachments = (data ?? []).map((attachment) => ({
  ...attachment,
  agent_path: attachment.storage_path
    ? toModelPath(attachment.storage_path)
    : null,
}));

return {
  success: true as const,
  attachments,
  count: attachments.length,
};
```

In `src/lib/managed-agents/tools/crm/search.ts`, update every attachment include select for deals, contacts, and companies:

```ts
select: "attachment_id, filename, file_category, file_size, content_type, storage_path, created_at",
```

Then map the included attachment rows before they are attached to the parent result:

```ts
const normalizeAttachmentInclude = (attachment: AttachmentRow) => ({
  ...attachment,
  agent_path: attachment.storage_path
    ? toModelPath(attachment.storage_path)
    : null,
});
```

Use the helper only for the `attachments` include path. Do not change the other include shapes.

**Step 4: Register the discovery tool and remove the redundant copy-based read tool**

In `src/lib/managed-agents/tools/declarations.ts`:

- add `listRecordAttachmentsTool` to the imported CRM tools and the exported declaration list
- remove `readRecordAttachmentTool` from the imports and declaration list

In `src/lib/managed-agents/tools/crm/index.ts`:

- keep exporting `listRecordAttachmentsTool`
- remove `readRecordAttachmentTool` from the barrel

In `src/lib/managed-agents/tools/crm/read-attachment.ts`:

- delete the file if nothing else imports it
- if you need a temporary deprecation step, replace the implementation with a thin wrapper that tells callers to use `list_record_attachments` + `storage_read`, then delete it in the next cleanup commit

Prefer deletion in this task. The plan’s goal is one durable attachment reader, not two.

**Step 5: Run the CRM-focused tests to verify they pass**

Run:

```bash
pnpm vitest run src/lib/managed-agents/tools/crm/__tests__/list-attachments.test.ts src/lib/managed-agents/tools/crm/__tests__/search.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/managed-agents/tools/declarations.ts src/lib/managed-agents/tools/crm/index.ts src/lib/managed-agents/tools/crm/list-attachments.ts src/lib/managed-agents/tools/crm/__tests__/list-attachments.test.ts src/lib/managed-agents/tools/crm/search.ts src/lib/managed-agents/tools/crm/__tests__/search.test.ts
git rm src/lib/managed-agents/tools/crm/read-attachment.ts
git commit -m "feat: unify CRM attachment discovery around storage paths"
```

---

### Task 3: Reuse `storage_read` As The Universal Durable File Reader

**Files:**
- Modify: `src/lib/managed-agents/tools/storage/storage-read.ts`
- Modify: `src/lib/managed-agents/tools/storage/__tests__/storage-read.test.ts`
- Reference: `src/lib/managed-agents/session-kickoff.ts`
- Reference: `src/lib/managed-agents/__tests__/session-kickoff.test.ts`

**Why this task exists:** The architecture only works globally if the prompt and tests explicitly bless `/agent/attachments/...`, `/agent/uploads/...`, `/agent/home/...`, `/agent/sessions/...`, and `/agent/toolcalls/...` as valid `storage_read` targets.

**Step 1: Write the failing `storage_read` coverage tests**

Add to `src/lib/managed-agents/tools/storage/__tests__/storage-read.test.ts`:

```ts
it("reads CRM attachments through /agent/attachments", async () => {
  mockDownloadFile.mockResolvedValueOnce("a,b\\n1,2");

  const result = await storageReadTool.execute(
    { path: "/agent/attachments/deal/deal-1/report.csv" },
    makeContext(),
  );

  expect(result).toEqual({
    success: true,
    path: "/agent/attachments/deal/deal-1/report.csv",
    content: "a,b\\n1,2",
  });
});

it("reads mirrored session files through /agent/sessions", async () => {
  mockDownloadFile.mockResolvedValueOnce("done");

  const result = await storageReadTool.execute(
    { path: "/agent/sessions/sess_123/output.txt" },
    makeContext(),
  );

  expect(result).toEqual({
    success: true,
    path: "/agent/sessions/sess_123/output.txt",
    content: "done",
  });
});
```

**Step 2: Run the tests to verify the current behavior**

Run:

```bash
pnpm vitest run src/lib/managed-agents/tools/storage/__tests__/storage-read.test.ts
```

Expected: Either PASS already or fail because the current tests/documentation do not cover these namespaces. If they already pass, keep the tests as the guardrail and continue.

**Step 3: Update the `storage_read` input description**

In `src/lib/managed-agents/tools/storage/storage-read.ts`, change the `path` description to include examples across the durable namespaces:

```ts
"Absolute path to the file or directory (for example '/agent/home/report.csv', '/agent/attachments/deal/123/file.pdf', or '/agent/sessions/sess_123/output.txt')."
```

**Step 4: Run the focused tests**

Run:

```bash
pnpm vitest run src/lib/managed-agents/tools/storage/__tests__/storage-read.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/managed-agents/tools/storage/storage-read.ts src/lib/managed-agents/tools/storage/__tests__/storage-read.test.ts
git commit -m "feat: standardize storage_read on all durable agent file namespaces"
```

---

### Task 4: Standardize Managed-Agent Outputs On `AgentFileRef`

**Files:**
- Modify: `src/lib/managed-agents/download-session-files.ts`
- Modify: `src/lib/managed-agents/__tests__/download-session-files.test.ts`
- Modify: `src/lib/managed-agents/adapter.ts`
- Modify: `src/lib/managed-agents/__tests__/adapter.test.ts`
- Modify: `src/lib/managed-agents/types.ts`

**Why this task exists:** Managed-agent session artifacts already mirror into storage, but their return shape is still ad hoc. They should align with the global durable file contract so assistant message parts, later reads, and downloads all use the same canonical metadata.

**Step 1: Write the failing mirror-helper test**

Extend `src/lib/managed-agents/__tests__/download-session-files.test.ts`:

```ts
expect(result).toEqual([
  {
    anthropicFileId: "file_123",
    filename: "saaa_sorted.csv",
    mediaType: "text/csv",
    storagePath: "sessions/session_abc/saaa_sorted.csv",
    signedUrl: "https://storage.example.com/signed",
  },
]);
```

**Step 2: Run the test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/download-session-files.test.ts
```

Expected: FAIL if the helper/result shape diverges from the shared contract.

**Step 3: Keep the mirrored file shape minimal and canonical**

In `src/lib/managed-agents/download-session-files.ts`, return only:

```ts
{
  anthropicFileId,
  filename,
  mediaType,
  storagePath,
  signedUrl,
}
```

Do not add `agentPath` here. Any consumer that needs the model-facing path should derive it from `storagePath`.

**Step 4: Extend the existing adapter test**

In `src/lib/managed-agents/__tests__/adapter.test.ts`, keep the persisted assistant file-part expectation focused on:

```ts
storagePath: "sessions/sess_123/saaa_sorted.csv",
filename: "saaa_sorted.csv",
mediaType: "text/csv",
```

**Step 6: Run the focused tests**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/download-session-files.test.ts src/lib/managed-agents/__tests__/adapter.test.ts
```

Expected: PASS

**Step 7: Commit**

```bash
git add src/lib/managed-agents/download-session-files.ts src/lib/managed-agents/__tests__/download-session-files.test.ts src/lib/managed-agents/adapter.ts src/lib/managed-agents/__tests__/adapter.test.ts src/lib/managed-agents/types.ts
git commit -m "feat: standardize managed-agent outputs on AgentFileRef fields"
```

---

### Task 5: Make Chat Download And Render Any Durable File Namespace Uniformly

**Files:**
- Modify: `src/components/chat/file-parts.ts`
- Modify: `src/components/chat/message-bubble.test.tsx`
- Modify: `src/components/ai-elements/message.tsx`

**Why this task exists:** The UI should not care whether a file came from CRM, a sandbox output, a mirrored session artifact, or a connection download. If it has `storagePath`, the renderer should resolve it to the signed download route. Legacy messages with only `url` must keep working.

**Step 1: Write the failing message-bubble regression tests**

Extend `src/components/chat/message-bubble.test.tsx`:

```ts
it("resolves CRM attachment file parts to the signed download route", () => {
  render(
    <MessageBubble
      message={{
        id: "crm-file",
        role: "assistant",
        parts: [{
          type: "file",
          url: "https://expired.example.com/report.csv",
          filename: "report.csv",
          mediaType: "text/csv",
          storagePath: "attachments/deal/deal-1/report.csv",
        }],
      } as ChatUIMessage}
    />,
  );

  expect(screen.getByTestId("preview-attachment")).toHaveAttribute(
    "href",
    "/api/files/download?path=attachments%2Fdeal%2Fdeal-1%2Freport.csv&filename=report.csv",
  );
});

it("falls back to url when storagePath is absent (legacy messages)", () => {
  render(
    <MessageBubble
      message={{
        id: "legacy-file",
        role: "assistant",
        parts: [{
          type: "file",
          url: "https://storage.example.com/legacy-signed-url",
          filename: "old-report.csv",
          mediaType: "text/csv",
        }],
      } as ChatUIMessage}
    />,
  );

  expect(screen.getByTestId("preview-attachment")).toHaveAttribute(
    "href",
    "https://storage.example.com/legacy-signed-url",
  );
});
```

Add one markdown-link rewrite test in `src/components/ai-elements/message.test.tsx` or the appropriate message renderer test:

```ts
render(<ChatMessage content="Download [Report](sunder:///agent/attachments/deal/deal-1/report.csv)" />);
expect(screen.getByRole("link", { name: "Report" })).toHaveAttribute(
  "href",
  "/api/files/download?path=attachments%2Fdeal%2Fdeal-1%2Freport.csv",
);
```

**Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm vitest run src/components/chat/message-bubble.test.tsx src/components/ai-elements/message.test.tsx
```

Expected: FAIL if the tests are missing or if the renderer does not yet cover the new durable path examples.

**Step 3: Reuse the existing shared resolver**

In `src/components/chat/file-parts.ts`, keep the implementation simple:

```ts
if (!part.storagePath) return part.url;
return `/api/files/download?${new URLSearchParams({
  path: part.storagePath,
  ...(part.filename ? { filename: part.filename } : {}),
}).toString()}`;
```

No namespace-specific branching.

**Step 4: Ensure markdown path rewriting stays generic**

In `src/components/ai-elements/message.tsx`, keep rewriting any `sunder:///agent/...` link into `/api/files/download?path=...` without hardcoding `home/` only.

**Step 5: Run the tests to verify they pass**

Run:

```bash
pnpm vitest run src/components/chat/message-bubble.test.tsx src/components/ai-elements/message.test.tsx
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/components/chat/file-parts.ts src/components/chat/message-bubble.test.tsx src/components/ai-elements/message.tsx src/components/ai-elements/message.test.tsx
git commit -m "feat: unify chat download rendering for all durable file refs"
```

---

### Task 6: Normalize Connection Tool Downloads Into Durable Agent Files

**Files:**
- Modify: `src/lib/composio/activated-tools.ts`
- Modify: `src/lib/composio/__tests__/activated-tools.test.ts`
- Reference: `docs/product/tasks/2026-03-30-pr65-composio-file-bridge-tasklist.md`

**Why this task exists:** Google Drive and similar connection tools are the other major file ingress path. If they return temp/local paths or provider-specific payloads, the agent cannot reliably inspect, download, attach, or reuse those files later.

**Important pre-step:** Before implementing, inspect one real or mocked Google Drive download result shape and note the exact fields available (`filename`, `mimeType`, bytes/url/temp path). If the current Composio layer does not expose enough metadata directly, introduce the smallest possible bridge helper instead of reshaping the whole module blindly. Do not lock the test to a made-up provider payload before you inspect the real one.

**Step 1: Write the failing connection-tool test**

In `src/lib/composio/__tests__/activated-tools.test.ts`, add a focused test around a downloaded-file result:

```ts
it("normalizes downloaded connection files into AgentFileRef-compatible data", async () => {
  const tools = await loadActivatedConnectionTools(
    [mockGoogleDriveConnection],
    "composio-user-1",
  );

  const result = await (tools.GOOGLEDRIVE_DOWNLOAD_FILE as never).execute({
    fileId: "drive-file-1",
  });

  expect(result).toEqual(
    expect.objectContaining({
      storagePath: expect.stringMatching(/^home\/imports\/googledrive\/[^/]+\/[^/]+$/),
      filename: expect.any(String),
      mediaType: expect.any(String),
    }),
  );
});

it("does not overwrite when two imported files share the same filename", async () => {
  // Add a focused assertion around the storagePath generation helper once implemented.
});
```

Mock whatever lower-level bridge/storage helper the current Composio layer already uses.

**Step 2: Run the test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/composio/__tests__/activated-tools.test.ts
```

Expected: FAIL because the current Composio layer does not yet emit normalized durable file refs.

**Step 3: Implement the minimal normalization wrapper**

In `src/lib/composio/activated-tools.ts`, wrap downloaded-file results so that:

- the file is persisted into `agent-files`
- the returned result includes:

```ts
{
  storagePath: "home/imports/googledrive/2026-04-13/report-abc123.xlsx",
  filename: "report.xlsx",
  mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
```

Do not redesign the whole Composio layer in this task. Only normalize the durable file-returning path.

**Step 4: Add one upload-direction regression test**

If a connection upload tool accepts an `/agent/...` path argument, add a test that verifies it still resolves bytes from durable storage before calling Composio.

**Step 5: Run the focused tests**

Run:

```bash
pnpm vitest run src/lib/composio/__tests__/activated-tools.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/composio/activated-tools.ts src/lib/composio/__tests__/activated-tools.test.ts
git commit -m "feat: normalize connection download files into durable agent refs"
```

---

### Task 7: Align Prompting And Session Mount Guidance Around The Global File Model

**Files:**
- Modify: `scripts/managed-agents/create-agent.ts`
- Modify: `src/lib/managed-agents/upload-files-for-session.ts`
- Modify: `src/lib/managed-agents/__tests__/upload-files-for-session.test.ts`
- Modify: `src/lib/managed-agents/session-kickoff.ts`
- Modify: `src/lib/managed-agents/__tests__/session-kickoff.test.ts`

**Why this task exists:** The agent must reliably choose the global pattern: “if a tool returns an `agent_path`, read it with `storage_read`; if a current-turn file is mounted in `/mnt/session/...`, use sandbox/built-in file tools for that ephemeral copy; if you want durable reuse, save or reference `/agent/...`.”

**Step 1: Write the failing kickoff/prompt tests**

Add assertions that the kickoff instructions mention:

```ts
expect(kickoffText).toContain("When a tool returns an agent_path");
expect(kickoffText).toContain("Use storage_read for durable files under /agent/");
expect(kickoffText).toContain("Use /mnt/session/ only for current-turn mounted files");
```

**Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/session-kickoff.test.ts src/lib/managed-agents/__tests__/upload-files-for-session.test.ts
```

Expected: FAIL because the instructions are not yet explicit enough.

**Step 3: Update the managed-agent instructions**

In `scripts/managed-agents/create-agent.ts` and/or `src/lib/managed-agents/session-kickoff.ts`, add concise guidance:

```ts
"Durable files live under /agent/ (uploads, attachments, home outputs, sessions, toolcalls).",
"If a tool returns an agent_path, use storage_read on that path to inspect it.",
"Current-turn mounted files under /mnt/session/... are ephemeral session resources, not durable storage paths.",
"If you create a file the user may need later, keep it under /agent/home/... and return a markdown link or file reference.",
```

**Step 4: Verify session attachment mount tests still pass**

If necessary, update `src/lib/managed-agents/upload-files-for-session.ts` tests so they continue asserting the `/mnt/session/uploads/...` behavior for first-turn attachments without confusing it with durable `/agent/...` references.

**Step 5: Run the focused tests**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/session-kickoff.test.ts src/lib/managed-agents/__tests__/upload-files-for-session.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add scripts/managed-agents/create-agent.ts src/lib/managed-agents/session-kickoff.ts src/lib/managed-agents/__tests__/session-kickoff.test.ts src/lib/managed-agents/upload-files-for-session.ts src/lib/managed-agents/__tests__/upload-files-for-session.test.ts
git commit -m "feat: align managed-agent prompt with unified durable file model"
```

---

### Task 8: Manual QA Pass Across CRM, Google Drive, Sandbox, And Chat

**Files:**
- No new code expected unless verification finds a gap
- Reference: `http://localhost:3004/chat/*`
- Reference: CRM record drawer files tab
- Reference: connected Google Drive account in dev

**Why this task exists:** This is a global change. It is only real if the same file identity works across the actual product surfaces.

**Step 1: Verify CRM attachment inspection**

Manual:
1. In chat, ask the agent to find a known CRM attachment.
2. Then ask, “what’s in that CSV?”
3. Expected: the agent uses `list_record_attachments`, gets `agent_path`, then reads the file instead of telling the user to download it manually.

**Step 2: Verify CRM attachment chat download**

Manual:
1. Ask the agent to surface the attachment in chat or mention it with a file tile/link.
2. Click download.
3. Expected: `/api/files/download?path=attachments/...` succeeds and preserves filename.

**Step 3: Verify Google Drive download normalization**

Manual:
1. Ask the agent to download a file from Google Drive.
2. Expected: the result becomes a durable file under `/agent/home/imports/googledrive/...` or the chosen import namespace.
3. Ask the agent to summarize the file.
4. Expected: it reads the durable `agentPath` with `storage_read`.

**Step 4: Verify sandbox-generated output**

Manual:
1. Ask the agent to generate a CSV or PDF from sandbox/code execution.
2. Expected: output persists under `/agent/home/...` or mirrors into `sessions/...` and appears as a downloadable chat attachment.
3. Click download and confirm the file opens correctly.

**Step 5: Verify connection upload from durable path**

Manual:
1. Ask the agent to generate a file, then upload it to Google Drive.
2. Expected: the upload tool accepts the durable path and the file appears in Drive.

**Step 6: Commit**

```bash
git add .
git commit -m "feat: unify durable file references across agent surfaces"
```

---

## Expected Outcome

After this plan:

- CRM attachment listing returns `agent_path` as a derived convenience alongside canonical `storage_path`
- The agent can inspect CRM attachments with `storage_read` instead of a new tool
- Session artifacts, sandbox outputs, uploads, and connection downloads all converge on the same durable file identity
- Chat downloads stay on the existing signed route and work for every durable namespace
- Connection tools can move files in and out of the durable agent filesystem without inventing a second file model
- The prompt teaches the agent one boring rule: durable file = `storagePath`, model-facing path = `/agent/...`

## Notes

- This is intentionally in line with the earlier unified-filesystem work in `docs/product/tasks/2026-03-30-pr63-unified-agent-filesystem-tasklist.md`.
- The global model is **Tasklet-shaped**: normalize external/tool-produced files into the filesystem, then reuse the existing file reader instead of multiplying tool names.
- KISS/YAGNI version: `storagePath` is canonical; `agentPath` is a derived view for the model, not stored state.
- The only acceptable reasons to add a new file tool later are:
  - binary/provider behavior that truly cannot be expressed as a durable `/agent/...` path
  - performance constraints that require a separate data-access primitive
  - access-control requirements that cannot be enforced through the existing storage path model

## Handover Prompt

Use this prompt for a second-opinion review or implementation handoff:

```md
Review this implementation plan and challenge it hard:

`docs/tasks/2026-04-13-unified-file-reference-model-tasklist.md`

Context:
- Repo: Sunder (`/Users/sethlim/Documents/sunder-next-migration-20260225`)
- We are trying to unify file handling across:
  - chat uploads
  - CRM attachments
  - Google Drive / connection downloads
  - sandbox / managed-agent generated outputs
  - chat download rendering
- We want one boring file model, not a pile of one-off tools.
- We specifically want to avoid adding a new dedicated CRM attachment read tool if the same problem can be solved through the existing durable filesystem model.
- We prefer `storagePath` as the single source of truth and derive `/agent/...` paths when needed.

Existing architecture constraints:
- `agent-files` is the single bucket
- `/agent/...` is the model-facing durable filesystem root
- `storage_read` / `storage_write` are the existing durable file primitives
- `/api/files/download` is the existing signed download path
- Chat file parts already use `storagePath`
- Managed-agent session files are already mirrored into `sessions/...`
- CRM attachments already live in `attachments/...`

What I want from you:
1. Read the tasklist.
2. Inspect the current code paths it touches.
3. Tell me if this is the right global architecture or if it has a flaw.
4. Identify any hidden edge cases across CRM, Google Drive, sandbox, and chat.
5. Tell me whether `AgentFileRef` is the right unifying abstraction.
6. Tell me whether extending `list_record_attachments` to return `agent_path` and reusing `storage_read` is actually the right answer.
7. Tell me if any part of this should be smaller / more incremental / more Tasklet-like.
8. Call out anything that would break existing flows or create migration debt.

Be opinionated. I want:
- findings first, ordered by severity
- concrete file references
- specific objections, not vague concerns
- if you disagree with the plan, propose the better version

Important:
- Do not default to “looks good”.
- Do not invent a giant artifact platform unless you can justify it.
- Optimize for KISS/YAGNI and consistency with the existing unified-filesystem direction.
```
