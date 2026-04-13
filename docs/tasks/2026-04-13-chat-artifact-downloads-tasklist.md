# Chat Artifact Downloads Implementation Plan

**Goal:** Make agent-generated files downloadable from chat by reusing the existing private-file signed download flow instead of inventing a new artifact platform.

**Architecture:** Keep `agent-files` as the storage backend and keep `app/api/files/download` as the only download signer for this sprint. Extend the existing route + chat file-part helpers so mirrored session files under `sessions/` are allowed, then append those mirrored files to persisted assistant message parts during terminal run finalization so the current chat UI can render a real downloadable file tile. Do not add a new `artifacts` table, a new bucket, or a relay/stream endpoint in this implementation.

**Tech Stack:** Next.js 15 App Router, React 19, Anthropic Managed Agents, Supabase Storage, Vitest, React Testing Library, Zod

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" - Step
- "Run it to make sure it fails" - Step
- "Implement the minimal code to make the test pass" - Step
- "Run the tests and make sure they pass" - Step
- "Commit" - Step

## Constraints

- Use `@test-driven-development` for every parent task.
- Keep the existing `app/api/files/download` route; extend it, do not replace it.
- Reuse existing session file mirroring in `src/lib/managed-agents/download-session-files.ts`.
- Do **not** create a new `artifacts` table, a new storage bucket, or a `/stream` relay endpoint.
- Do **not** delete residual download code before the new end-to-end path is proven.
- Keep commits small and task-scoped.

## Relevant Files

- Modify: `app/api/files/download/route.ts`
- Modify: `app/api/files/download/route.test.ts`
- Modify: `src/components/chat/file-parts.ts`
- Modify: `src/components/chat/message-bubble.test.tsx`
- Modify: `src/lib/managed-agents/download-session-files.ts`
- Modify: `src/lib/managed-agents/__tests__/download-session-files.test.ts`
- Modify: `src/lib/managed-agents/adapter.ts`
- Modify: `src/lib/managed-agents/__tests__/adapter.test.ts`
- Reference: `src/components/chat/preview-attachment.tsx`
- Reference: `src/lib/chat/schemas.ts`
- Reference: `app/api/sessions/[sessionId]/files/route.ts`
- Reference: `src/components/ai-elements/message.tsx`

## Non-Goals

- No generalized artifact metadata platform
- No Anthropic Files API redesign
- No mobile/webview special-casing
- No cleanup cron
- No redesign of chat attachment UI

---

### Task 1: Extend The Existing Signed Download Route For Session Files

**Files:**
- Modify: `app/api/files/download/route.ts`
- Modify: `app/api/files/download/route.test.ts`
- Modify: `src/components/chat/file-parts.ts`
- Modify: `src/components/chat/message-bubble.test.tsx`
- Reference: `src/components/ai-elements/message.tsx`

**Why this task exists:** The residual route already signs private downloads, but it currently blocks `sessions/` paths. The chat file-part URL helper also drops `filename`, which weakens filename preservation for generated artifacts.

**Step 1: Write the failing route test for mirrored session files**

Add a new test to `app/api/files/download/route.test.ts`:

```ts
it("allows mirrored session artifact downloads and forwards filename", async () => {
  const response = await GET(
    new Request(
      "http://localhost/api/files/download?path=sessions/session_123/saaa_sorted.csv&filename=saaa_sorted.csv",
    ),
  );

  expect(response.status).toBe(307);
  expect(mockCreateSignedUrl).toHaveBeenCalledWith(
    "client-1/sessions/session_123/saaa_sorted.csv",
    3600,
    { download: "saaa_sorted.csv" },
  );
});
```

**Step 2: Run the route test to verify it fails**

Run:

```bash
pnpm vitest run app/api/files/download/route.test.ts
```

Expected: FAIL because `sessions/` is not yet in the allow-list.

**Step 3: Write the failing chat rendering test for filename-aware session downloads**

Add a new test to `src/components/chat/message-bubble.test.tsx`:

```ts
it("includes filename when resolving assistant session file parts", () => {
  render(
    <MessageBubble
      message={{
        id: "assistant-session-file",
        role: "assistant",
        parts: [{
          type: "file",
          filename: "saaa_sorted.csv",
          mediaType: "text/csv",
          url: "https://expired.example.com/saaa_sorted.csv",
          storagePath: "sessions/session_123/saaa_sorted.csv",
        }],
      } as ChatUIMessage}
    />,
  );

  expect(screen.getByTestId("preview-attachment")).toHaveAttribute(
    "href",
    "/api/files/download?path=sessions%2Fsession_123%2Fsaaa_sorted.csv&filename=saaa_sorted.csv",
  );
});
```

**Step 4: Run the message bubble test to verify it fails**

Run:

```bash
pnpm vitest run src/components/chat/message-bubble.test.tsx
```

Expected: FAIL because `resolveFilePartUrl()` does not append `filename`.

**Step 5: Implement the minimal route allow-list change**

Update `app/api/files/download/route.ts` so the first path segment check allows:

```ts
if (
  firstSegment !== "uploads" &&
  firstSegment !== "home" &&
  firstSegment !== "attachments" &&
  firstSegment !== "sessions"
) {
  return jsonError(
    "Downloads are restricted to uploads/, home/, attachments/, and sessions/.",
    403,
  );
}
```

**Step 6: Implement the minimal filename propagation change**

Update `src/components/chat/file-parts.ts`:

```ts
export function resolveFilePartUrl(part: {
  url: string;
  filename?: string;
  storagePath?: string;
}): string {
  if (!part.storagePath) {
    return part.url;
  }

  const searchParams = new URLSearchParams({ path: part.storagePath });
  if (part.filename) {
    searchParams.set("filename", part.filename);
  }

  return `/api/files/download?${searchParams.toString()}`;
}
```

**Step 7: Run the two focused test files**

Run:

```bash
pnpm vitest run app/api/files/download/route.test.ts src/components/chat/message-bubble.test.tsx
```

Expected: PASS

**Step 8: Commit**

```bash
git add app/api/files/download/route.ts app/api/files/download/route.test.ts src/components/chat/file-parts.ts src/components/chat/message-bubble.test.tsx
git commit -m "feat: allow signed chat downloads for session files"
```

---

### Task 2: Carry MIME Type Through Mirrored Session Files

**Files:**
- Modify: `src/lib/managed-agents/download-session-files.ts`
- Modify: `src/lib/managed-agents/__tests__/download-session-files.test.ts`
- Reference: `src/lib/chat/schemas.ts`

**Why this task exists:** Chat file parts require `mediaType` and the attachment tile uses content type to label/render files correctly. The mirror helper currently returns `filename`, `storagePath`, and `signedUrl`, but not the MIME type.

**Step 1: Write the failing test for returned media type**

Add a new expectation in `src/lib/managed-agents/__tests__/download-session-files.test.ts`:

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

If there is already a happy-path test, extend that one instead of duplicating setup.

**Step 2: Run the mirror helper test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/download-session-files.test.ts
```

Expected: FAIL because `mediaType` is not returned yet.

**Step 3: Extend the return type**

Update `src/lib/managed-agents/download-session-files.ts`:

```ts
export interface DownloadedSessionFile {
  anthropicFileId: string;
  filename: string;
  mediaType: string;
  storagePath: string;
  signedUrl: string;
}
```

**Step 4: Populate `mediaType` using the same upload metadata source**

Use the existing file metadata in `downloadSessionFiles()`:

```ts
const mediaType =
  file.mime_type ??
  blob.type ??
  "application/octet-stream";
```

Return it in the pushed object:

```ts
downloadedFiles.push({
  anthropicFileId: file.id,
  filename: file.filename,
  mediaType,
  storagePath: relativeStoragePath,
  signedUrl: signedUrlData.signedUrl,
});
```

**Step 5: Run the mirror helper test again**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/download-session-files.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/managed-agents/download-session-files.ts src/lib/managed-agents/__tests__/download-session-files.test.ts
git commit -m "feat: return media types for mirrored session files"
```

---

### Task 3: Append Generated Session Files To Persisted Assistant Message Parts

**Files:**
- Modify: `src/lib/managed-agents/adapter.ts`
- Modify: `src/lib/managed-agents/__tests__/adapter.test.ts`
- Reference: `src/lib/managed-agents/download-session-files.ts`
- Reference: `src/lib/managed-agents/events-to-assistant-parts.ts`
- Reference: `src/lib/chat/schemas.ts`

**Why this task exists:** The system already mirrors Anthropic session files into Supabase, but those files never become assistant `file` parts in persisted chat messages. Without that glue, the UI has nothing concrete to render.

**Step 1: Mock the mirror helper in the adapter test file**

If `downloadSessionFiles` is not already mocked in `src/lib/managed-agents/__tests__/adapter.test.ts`, add it:

```ts
vi.mock("../download-session-files", () => ({
  downloadSessionFiles: vi.fn(),
}));
```

**Step 2: Write the failing adapter test for completed turns**

Add a focused test that verifies assistant output persistence includes mirrored session files:

```ts
it("persists mirrored session files as assistant file parts on terminal completion", async () => {
  (getExistingSessionId as Mock).mockResolvedValue("sess_123");
  (consumeAnthropicSession as Mock).mockResolvedValue({
    status: "complete",
    reason: "end_turn",
    accumulatedEvents: [{
      type: "agent.message",
      content: [{ type: "text", text: "File ready." }],
    }],
    cost: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      runtimeSeconds: 0,
    },
    approvalEventIds: [],
    costRetrievePromise: Promise.resolve(),
  });
  (downloadSessionFiles as Mock).mockResolvedValue([
    {
      anthropicFileId: "file_1",
      filename: "saaa_sorted.csv",
      mediaType: "text/csv",
      storagePath: "sessions/sess_123/saaa_sorted.csv",
      signedUrl: "https://storage.example.com/signed",
    },
  ]);

  const stream = await runManagedAgent({
    anthropic: {} as never,
    supabase: mockSupabase,
    clientId: "client_1",
    threadId: "thread_1",
    input: "sort this csv",
    clientProfile: null,
    userPreferences: null,
    threadTitle: null,
  });

  await collectStream(stream);

  expect(upsertMessage).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      role: "assistant",
      parts: expect.arrayContaining([
        expect.objectContaining({ type: "text", text: "File ready." }),
        expect.objectContaining({
          type: "file",
          filename: "saaa_sorted.csv",
          mediaType: "text/csv",
          storagePath: "sessions/sess_123/saaa_sorted.csv",
        }),
      ]),
    }),
  );
});
```

**Step 3: Write the failing adapter test for paused approval runs**

Add a second test:

```ts
it("does not mirror session files while the run is paused for approval", async () => {
  // consumeAnthropicSession returns reason: "requires_action"
  // expect(downloadSessionFiles).not.toHaveBeenCalled()
});
```

**Step 4: Run the adapter test file to verify both tests fail**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/adapter.test.ts
```

Expected: FAIL because `finalizeRun()` does not currently call `downloadSessionFiles()` or append file parts.

**Step 5: Add `sessionId` to finalize-time plumbing**

Update `src/lib/managed-agents/adapter.ts`:

- Extend `FinalizeRunOptions` with `sessionId: string`
- Pass `sessionId` from both `runManagedAgent()` and `resumeManagedAgentFromApproval()` call sites when they call `finalizeRun()`

Use a concrete shape like:

```ts
export interface FinalizeRunOptions {
  supabase: ManagedSupabaseClient;
  clientId: string;
  threadId: string;
  runId: string;
  sessionId: string;
  result: SessionRunnerResult;
  conversationInput: string;
  logLabel: string;
  anthropicModelId: string;
}
```

**Step 6: Mirror session files only for non-approval terminal states**

Inside `finalizeRun()`:

```ts
const mirroredSessionFiles = result.reason === "requires_action"
  ? []
  : await downloadSessionFiles({
      supabase,
      clientId,
      sessionId,
    });
```

Do this before persisting the assistant message, not after.

**Step 7: Merge mirrored files into the assistant parts**

Update `persistAssistantOutput()` so it can accept optional mirrored files:

```ts
const fileParts = mirroredSessionFiles.map((file) => ({
  type: "file" as const,
  url: file.signedUrl,
  mediaType: file.mediaType,
  filename: file.filename,
  storagePath: file.storagePath,
}));

const parts = [
  ...buildAssistantPartsFromEvents(accumulatedEvents),
  ...fileParts,
];
```

Keep the existing text/tool/spec parts unchanged.

**Step 8: Run the adapter test file again**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/adapter.test.ts
```

Expected: PASS

**Step 9: Run the focused regression set**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/adapter.test.ts src/lib/managed-agents/__tests__/download-session-files.test.ts app/api/files/download/route.test.ts src/components/chat/message-bubble.test.tsx
```

Expected: PASS

**Step 10: Commit**

```bash
git add src/lib/managed-agents/adapter.ts src/lib/managed-agents/__tests__/adapter.test.ts src/lib/managed-agents/download-session-files.ts src/lib/managed-agents/__tests__/download-session-files.test.ts app/api/files/download/route.ts app/api/files/download/route.test.ts src/components/chat/file-parts.ts src/components/chat/message-bubble.test.tsx
git commit -m "feat: surface generated session files as chat downloads"
```

---

### Task 4: Verify The Existing Chat UI Works End-To-End Without New UI Abstractions

**Files:**
- Modify: `src/components/chat/message-bubble.test.tsx` (if one more regression is needed)
- Reference: `src/components/chat/preview-attachment.tsx`
- Reference: `src/components/chat/message-bubble.tsx`
- Reference: `app/(dashboard)/chat/page.tsx`

**Why this task exists:** The point of this sprint is to prove the boring path works with the current UI. The expected result is a standard file tile in the assistant message that downloads through the existing signed route.

**Step 1: Add one regression test proving assistant file parts render through `PreviewAttachment`**

If not already covered by Task 1, add a test like:

```ts
it("renders assistant-generated csv files as preview attachments", () => {
  render(
    <MessageBubble
      message={{
        id: "assistant-file-1",
        role: "assistant",
        parts: [{
          type: "file",
          filename: "saaa_sorted.csv",
          mediaType: "text/csv",
          url: "https://signed.example.com/file",
          storagePath: "sessions/sess_123/saaa_sorted.csv",
        }],
      } as ChatUIMessage}
    />,
  );

  expect(screen.getByTestId("preview-attachment")).toHaveTextContent("saaa_sorted.csv");
});
```

**Step 2: Run the chat rendering test file**

Run:

```bash
pnpm vitest run src/components/chat/message-bubble.test.tsx
```

Expected: PASS

**Step 3: Start the app**

Run:

```bash
pnpm dev
```

Expected: Next.js dev server starts successfully.

**Step 4: Manual smoke test with a real artifact-producing prompt**

Use a chat prompt that forces the agent to generate a downloadable file, for example:

```text
Sort this CSV alphabetically by company name, renumber the first column 1..N, and give me the cleaned CSV as a downloadable file.
```

Expected in the UI:
- The assistant finishes normally.
- A file tile appears in the assistant message.
- The tile label shows the generated filename.
- Clicking the tile downloads the file instead of dead-ending on plain text.

**Step 5: Verify repeated clicks still work**

Because `/api/files/download` signs on demand, each new click should mint a fresh signed URL.

Expected:
- The second click also downloads successfully.
- No stale signed URL is embedded permanently in the UI.

**Step 6: Regression-check CRM attachment downloads**

Open any CRM record attachment and click download.

Expected:
- Existing CRM downloads still work.
- No regression from the `sessions/` allow-list change.

**Step 7: Commit test-only changes if any**

```bash
git add src/components/chat/message-bubble.test.tsx
git commit -m "test: cover assistant artifact download rendering"
```

If no code changed in this task, skip the commit.

---

## Final Verification Sweep

Run the focused suite:

```bash
pnpm vitest run app/api/files/download/route.test.ts src/lib/managed-agents/__tests__/download-session-files.test.ts src/lib/managed-agents/__tests__/adapter.test.ts src/components/chat/message-bubble.test.tsx
```

Expected: PASS

Optional wider sweep if the focused suite is green:

```bash
pnpm vitest run src/components/chat/chat-panel.test.tsx src/components/chat/message-list.test.tsx
```

Expected: PASS

## Acceptance Criteria

- Assistant-generated session files are mirrored into `agent-files/sessions/...`
- Completed agent runs persist assistant `file` parts for mirrored session files
- Chat file tiles resolve to `/api/files/download?...`
- `/api/files/download` allows `sessions/` paths while still rejecting unknown prefixes
- Filename is forwarded for file-part downloads when available
- Existing CRM attachment downloads still work
- No new artifact table, bucket, or relay endpoint is introduced

## Implementation Notes

- Reuse the existing signed download route. Do not add `GET /api/files/[id]/url` in this sprint.
- Reuse the existing chat `file` part shape from `src/lib/chat/schemas.ts`.
- Keep `app/api/sessions/[sessionId]/files/route.ts` as a debugging/recovery endpoint; do not delete it.
- Do not rely on the model to emit markdown download links. The adapter should append durable file parts automatically.
- Prefer appending mirrored files after event-derived text/tool parts so the file tile appears after the assistant’s narrative.

## Suggested Review

After Task 3, run `@requesting-code-review` against the working tree before merge.
