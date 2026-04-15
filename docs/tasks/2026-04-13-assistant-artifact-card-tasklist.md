# Assistant Artifact Card Implementation Plan

**Goal:** Render assistant-generated file outputs in chat as explicit artifact cards while keeping user-upload previews unchanged.

**Architecture:** Keep the existing file data flow and signed-download routing exactly as-is. Add a new `AssistantArtifactCard` presentational component for assistant message file parts only, and keep `PreviewAttachment` for composer/user-side upload previews. This is a local chat UI change in the rendering layer, not a storage, schema, or backend redesign.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind 4, ShadCN UI, Vitest, React Testing Library

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Relevant Files

- Design doc: `docs/plans/2026-04-13-assistant-artifact-card-design.md`
- Create: `src/components/chat/assistant-artifact-card.tsx`
- Create: `src/components/chat/assistant-artifact-card.test.tsx`
- Modify: `src/components/chat/message-bubble.tsx`
- Modify: `src/components/chat/message-bubble.test.tsx`
- Reference only: `src/components/chat/preview-attachment.tsx`
- Reference only: `src/components/chat/preview-attachment.test.tsx`
- Reference only: `src/components/chat/file-parts.ts`

## Notes Before Starting

- Use `@test-driven-development` discipline for every task. Do not start implementation before the failing test exists.
- Do not generalize `PreviewAttachment`. The design explicitly rejects a multi-mode attachment component.
- Do not change backend routes, message schemas, `storagePath`, or `resolveFilePartUrl()`.
- Use existing design-system tokens and utility classes. Do not introduce raw Tailwind palette colors for semantic UI states.
- Ship a text `Download` action first. Do not build icon-only or multi-action UI in this pass.

---

### Task 1: Add the assistant artifact card component

**Files:**
- Create: `src/components/chat/assistant-artifact-card.tsx`
- Create: `src/components/chat/assistant-artifact-card.test.tsx`
- Reference: `src/components/chat/preview-attachment.tsx`

**Step 1: Write the failing test file**

Create `src/components/chat/assistant-artifact-card.test.tsx` with the base rendering contract:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssistantArtifactCard } from "./assistant-artifact-card";

describe("AssistantArtifactCard", () => {
  it("renders filename, file type label, and download action", () => {
    render(
      <AssistantArtifactCard
        attachment={{
          filename: "pipeline-report.csv",
          url: "/api/files/download?path=home%2Foutputs%2Fpipeline-report.csv",
          contentType: "text/csv",
        }}
      />,
    );

    expect(screen.getByText("pipeline-report.csv")).toBeInTheDocument();
    expect(screen.getByText("CSV")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download pipeline-report.csv/i })).toHaveAttribute(
      "href",
      "/api/files/download?path=home%2Foutputs%2Fpipeline-report.csv",
    );
  });

  it("uses direct url values for legacy file parts", () => {
    render(
      <AssistantArtifactCard
        attachment={{
          filename: "legacy.pdf",
          url: "https://storage.example.com/legacy.pdf",
          contentType: "application/pdf",
        }}
      />,
    );

    expect(screen.getByRole("link", { name: /download legacy.pdf/i })).toHaveAttribute(
      "href",
      "https://storage.example.com/legacy.pdf",
    );
  });

  it("calls onImageClick for image artifacts", async () => {
    const onImageClick = vi.fn();
    render(
      <AssistantArtifactCard
        attachment={{
          filename: "screenshot.png",
          url: "https://storage.example.com/screenshot.png",
          contentType: "image/png",
        }}
        onImageClick={onImageClick}
      />,
    );

    await screen.getByRole("button", { name: /open screenshot.png/i }).click();
    expect(onImageClick).toHaveBeenCalledWith("https://storage.example.com/screenshot.png");
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/components/chat/assistant-artifact-card.test.tsx --reporter=verbose
```

Expected: FAIL with module-not-found because `assistant-artifact-card.tsx` does not exist yet.

**Step 3: Write the minimal implementation**

Create `src/components/chat/assistant-artifact-card.tsx`:

```tsx
/**
 * Assistant-only artifact card for downloadable file outputs in chat.
 * @module components/chat/assistant-artifact-card
 */
"use client";

interface AssistantArtifactCardProps {
  attachment: {
    filename: string;
    url: string;
    contentType: string;
    storagePath?: string;
  };
  onImageClick?: (url: string) => void;
}

function getArtifactTypeLabel(contentType: string): string {
  if (contentType === "application/pdf") return "PDF";
  if (contentType === "text/csv") return "CSV";
  if (contentType === "application/json") return "JSON";
  if (contentType.startsWith("image/")) return "Image";
  if (contentType.startsWith("text/")) return "Text";
  return "File";
}

export function AssistantArtifactCard({
  attachment,
  onImageClick,
}: AssistantArtifactCardProps) {
  const { filename, url, contentType } = attachment;
  const typeLabel = getArtifactTypeLabel(contentType);
  const isImage = contentType.startsWith("image/");

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"
      data-testid="assistant-artifact-card"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{filename}</p>
        <p className="text-xs text-muted-foreground">{typeLabel}</p>
      </div>

      <div className="shrink-0">
        {isImage && onImageClick ? (
          <button
            type="button"
            className="text-sm font-medium underline underline-offset-4"
            aria-label={`Open ${filename}`}
            onClick={() => onImageClick(url)}
          >
            Download
          </button>
        ) : (
          <a
            href={url}
            aria-label={`Download ${filename}`}
            className="text-sm font-medium underline underline-offset-4"
            rel="noopener noreferrer"
            target="_blank"
          >
            Download
          </a>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run src/components/chat/assistant-artifact-card.test.tsx --reporter=verbose
```

Expected: PASS. All new `AssistantArtifactCard` tests pass.

**Step 5: Commit**

```bash
git add src/components/chat/assistant-artifact-card.tsx src/components/chat/assistant-artifact-card.test.tsx
git commit -m "feat(chat): add assistant artifact card component"
```

---

### Task 2: Switch assistant message file parts to the artifact card

**Files:**
- Modify: `src/components/chat/message-bubble.tsx`
- Modify: `src/components/chat/message-bubble.test.tsx`
- Reference: `src/components/chat/file-parts.ts`

**Step 1: Write the failing message-bubble tests**

In `src/components/chat/message-bubble.test.tsx`, replace the single `PreviewAttachment` mock with separate mocks for the compact preview and the new assistant card:

```tsx
vi.mock("./preview-attachment", () => ({
  PreviewAttachment: ({ attachment }: { attachment: { filename: string; url: string } }) => (
    attachment.url
      ? <a data-testid="preview-attachment" href={attachment.url}>{attachment.filename}</a>
      : <div data-testid="preview-attachment">{attachment.filename}</div>
  ),
}));

vi.mock("./assistant-artifact-card", () => ({
  AssistantArtifactCard: ({ attachment }: { attachment: { filename: string; url: string } }) => (
    <a data-testid="assistant-artifact-card" href={attachment.url}>{attachment.filename}</a>
  ),
}));
```

Add these assertions:

```tsx
it("renders assistant file parts as artifact cards", () => {
  render(
    <MessageBubble
      message={{
        id: "assistant-file-1",
        role: "assistant",
        parts: [{
          type: "file",
          filename: "report.csv",
          mediaType: "text/csv",
          url: "https://storage.example.com/report.csv",
        }],
      } as ChatUIMessage}
    />,
  );

  expect(screen.getByTestId("assistant-artifact-card")).toHaveTextContent("report.csv");
  expect(screen.queryByTestId("preview-attachment")).not.toBeInTheDocument();
});

it("keeps user file parts on compact preview attachments", () => {
  render(
    <MessageBubble
      message={{
        id: "user-file-1",
        role: "user",
        parts: [{
          type: "file",
          filename: "screenshot.png",
          mediaType: "image/png",
          url: "https://storage.example.com/screenshot.png",
        }],
      } as ChatUIMessage}
    />,
  );

  expect(screen.getByTestId("preview-attachment")).toHaveTextContent("screenshot.png");
  expect(screen.queryByTestId("assistant-artifact-card")).not.toBeInTheDocument();
});

it("resolves storagePath for assistant artifact cards", () => {
  render(
    <MessageBubble
      message={{
        id: "assistant-file-2",
        role: "assistant",
        parts: [{
          type: "file",
          filename: "session-output.csv",
          mediaType: "text/csv",
          url: "https://expired.example.com/session-output.csv",
          storagePath: "sessions/thread-1/session-output.csv",
        }],
      } as ChatUIMessage}
    />,
  );

  expect(screen.getByTestId("assistant-artifact-card")).toHaveAttribute(
    "href",
    "/api/files/download?path=sessions%2Fthread-1%2Fsession-output.csv&filename=session-output.csv",
  );
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/components/chat/message-bubble.test.tsx --reporter=verbose
```

Expected: FAIL because `MessageBubble` still routes assistant file parts through `PreviewAttachment`.

**Step 3: Write the minimal implementation**

Update `src/components/chat/message-bubble.tsx`:

1. Add the import:

```tsx
import { AssistantArtifactCard } from "./assistant-artifact-card";
```

2. Keep `filePartToAttachment()` unchanged. It already uses `resolveFilePartUrl(part)`, which is the desired behavior.

3. In the assistant branch inside `message.parts.map(...)`, replace the file-part render:

```tsx
if (part.type === "file") {
  return (
    <AssistantArtifactCard
      key={key}
      attachment={filePartToAttachment(part as ChatFilePart)}
      onImageClick={setLightboxSrc}
    />
  );
}
```

Leave the user-message branch alone so user uploads still render with `PreviewAttachment`.

**Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run src/components/chat/message-bubble.test.tsx --reporter=verbose
```

Expected: PASS. Assistant file parts use the card; user file parts still use compact previews.

**Step 5: Commit**

```bash
git add src/components/chat/message-bubble.tsx src/components/chat/message-bubble.test.tsx
git commit -m "feat(chat): render assistant file parts as artifact cards"
```

---

### Task 3: Harden the card behavior for image artifacts and mixed assistant messages

**Files:**
- Modify: `src/components/chat/assistant-artifact-card.test.tsx`
- Modify: `src/components/chat/message-bubble.test.tsx`
- Modify: `src/components/chat/assistant-artifact-card.tsx`

**Step 1: Write the failing regression tests**

In `src/components/chat/assistant-artifact-card.test.tsx`, add:

```tsx
it("renders a file-type fallback label for markdown artifacts", () => {
  render(
    <AssistantArtifactCard
      attachment={{
        filename: "brief.md",
        url: "/api/files/download?path=home%2Foutputs%2Fbrief.md",
        contentType: "text/markdown",
      }}
    />,
  );

  expect(screen.getByText("Text")).toBeInTheDocument();
});
```

In `src/components/chat/message-bubble.test.tsx`, add:

```tsx
it("renders assistant artifact cards alongside text parts", () => {
  render(
    <MessageBubble
      message={{
        id: "assistant-mixed-1",
        role: "assistant",
        parts: [
          { type: "text", text: "I generated the file below." },
          {
            type: "file",
            filename: "analysis.csv",
            mediaType: "text/csv",
            url: "https://storage.example.com/analysis.csv",
          },
        ],
      } as ChatUIMessage}
    />,
  );

  expect(screen.getByTestId("message-response")).toHaveTextContent("I generated the file below.");
  expect(screen.getByTestId("assistant-artifact-card")).toHaveTextContent("analysis.csv");
});
```

**Step 2: Run tests to verify failures**

Run:

```bash
npx vitest run src/components/chat/assistant-artifact-card.test.tsx src/components/chat/message-bubble.test.tsx --reporter=verbose
```

Expected: FAIL if the label mapping or mixed rendering order is incomplete.

**Step 3: Write the minimal implementation**

In `src/components/chat/assistant-artifact-card.tsx`:

- Expand `getArtifactTypeLabel()` only as needed to satisfy failing tests.
- Keep the mapping intentionally small and aligned with `PreviewAttachment`:

```tsx
if (contentType.startsWith("text/")) return "Text";
```

Do not add speculative metadata or extra state.

**Step 4: Run tests to verify they pass**

Run:

```bash
npx vitest run src/components/chat/assistant-artifact-card.test.tsx src/components/chat/message-bubble.test.tsx --reporter=verbose
```

Expected: PASS. The card behaves correctly for markdown/text artifacts and mixed assistant messages.

**Step 5: Commit**

```bash
git add src/components/chat/assistant-artifact-card.tsx src/components/chat/assistant-artifact-card.test.tsx src/components/chat/message-bubble.test.tsx
git commit -m "test(chat): add artifact card regression coverage"
```

---

### Task 4: Run the focused suite and do manual browser QA

**Files:**
- No code changes required unless QA finds a defect
- Reference: `src/components/chat/preview-attachment.tsx`
- Reference: `src/components/chat/chat-panel.tsx`

**Step 1: Run the focused automated suite**

Run:

```bash
npx vitest run \
  src/components/chat/assistant-artifact-card.test.tsx \
  src/components/chat/message-bubble.test.tsx \
  src/components/chat/preview-attachment.test.tsx \
  --reporter=verbose
```

Expected: PASS. No regression in the compact preview component.

**Step 2: Start the app**

Run:

```bash
npm run dev
```

Expected: Next.js dev server starts successfully on `http://localhost:3000` or the next available port.

**Step 3: Manual QA — assistant artifact**

In a fresh chat thread:

1. Ask the agent to generate a CSV or markdown artifact
2. Confirm the assistant file renders as a bordered card, not a tiny preview tile
3. Confirm the filename is prominent
4. Confirm the file type label is visible
5. Confirm the `Download` action is visually obvious
6. Click `Download` and verify the file opens or downloads correctly

**Step 4: Manual QA — user upload regression**

In the same or another thread:

1. Upload an image or PDF
2. Confirm the composer still shows the compact upload preview tile
3. Send the message
4. Confirm the user-side message still renders the compact preview tile, not the assistant artifact card

**Step 5: Manual QA — assistant image artifact**

If available:

1. Ask the agent to return an image file
2. Confirm it renders in the richer artifact-card shell
3. Confirm clicking the image action still opens the image preview path instead of breaking

**Step 6: Commit only if QA required fixes**

If manual QA required no changes, do not create a no-op commit.

If QA required a fix:

```bash
git add src/components/chat/assistant-artifact-card.tsx src/components/chat/message-bubble.tsx src/components/chat/*.test.tsx
git commit -m "fix(chat): polish assistant artifact card behavior"
```

---

## Execution Handoff

Tasklist complete and saved to `docs/tasks/2026-04-13-assistant-artifact-card-tasklist.md`. Ask user to open a new session to do batch execution with checkpoint.
