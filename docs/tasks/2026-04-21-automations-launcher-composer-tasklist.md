# Automations Launcher Composer Implementation Plan

**Goal:** Replace the top-right `/automations` CTA with a sticky bottom composer that launches automation setup into the existing chat flow with one submit.

**Architecture:** Keep automation creation chat-owned. Add a small launcher wrapper on `/automations` that reuses the existing `ChatComposer`, normalizes the user's request into an automation-specific prompt, and routes to `/chat?prompt=...&autosubmit=1`. Extend the existing draft chat path so it auto-submits that prompt once on load, allowing the normal `/chat` surface to own thread creation, `/chat/{id}` URL transition, optimistic sidebar insertion, and the existing `Thinking...` / streaming assistant reply behavior.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, `@ai-sdk/react` `useChat`, TanStack Query, Vitest + Testing Library

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" - Step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Relevant Skills

- `@nextjs-app-router-patterns` - App Router navigation and search-param plumbing
- `@vercel-react-best-practices` - keep the launcher state minimal and colocated

## Relevant Docs

- `docs/plans/2026-04-12-automations-ux-overhaul-design.md` - existing automations UX direction; this task is a narrow launcher-only delta
- Context7 `/vercel/next.js` - `useRouter.push()` and `useSearchParams()` patterns for App Router client components

## Relevant Files

- Modify: `app/(dashboard)/automations/page.tsx:15-73`
- Modify: `app/(dashboard)/automations/page.test.tsx:1-117`
- Modify: `app/(dashboard)/chat/chat-draft-page.tsx:20-39`
- Modify: `app/(dashboard)/chat/chat-draft-page.test.tsx:1-49`
- Modify: `src/components/chat/chat-panel.tsx:76-430`
- Modify: `src/components/chat/chat-panel.test.tsx:1-760`
- Create: `src/components/automations/automation-launcher-composer.tsx`
- Create: `src/components/automations/__tests__/automation-launcher-composer.test.tsx`
- Create: `src/lib/automations/launcher-prompt.ts`
- Create: `src/lib/automations/__tests__/launcher-prompt.test.ts`

## Guardrails

- Do **not** POST to `/api/chat` from `/automations`.
- Do **not** keep both the top-right `New automation` button and the bottom composer.
- Do **not** add fake `Plan` or `Think` controls.
- Do **not** embed live assistant replies on `/automations` in this change.
- Keep the hidden prompt small and transcript-friendly.
- For manual Managed Agents testing, use `Claude Haiku 4.5` / `anthropic/claude-haiku-4-5`, not Sonnet or Opus.

---

### Task 1: Add a Pure Automation Launcher Prompt Helper

**Files:**
- Create: `src/lib/automations/launcher-prompt.ts`
- Test: `src/lib/automations/__tests__/launcher-prompt.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { buildAutomationLauncherPrompt } from "../launcher-prompt";

describe("buildAutomationLauncherPrompt", () => {
  it("wraps a trimmed request in lightweight automation setup guidance", () => {
    expect(buildAutomationLauncherPrompt("  Daily pipeline summary  ")).toBe(
      "Help me create an automation.\n\nRequest:\nDaily pipeline summary\n\nIf key trigger details are missing, ask one concise clarifying question before creating it.",
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm test:run -- 'src/lib/automations/__tests__/launcher-prompt.test.ts'
```

Expected: FAIL with `Cannot find module '../launcher-prompt'` or missing export.

**Step 3: Write minimal implementation**

```ts
/**
 * Builds the first chat message for the automations launcher.
 * Keeps the hidden guidance small so the resulting transcript still reads
 * like a normal user conversation.
 */
export function buildAutomationLauncherPrompt(userText: string): string {
  const trimmedRequest = userText.trim();

  return [
    "Help me create an automation.",
    "",
    "Request:",
    trimmedRequest,
    "",
    "If key trigger details are missing, ask one concise clarifying question before creating it.",
  ].join("\n");
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm test:run -- 'src/lib/automations/__tests__/launcher-prompt.test.ts'
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/automations/launcher-prompt.ts src/lib/automations/__tests__/launcher-prompt.test.ts
git commit -m "feat(automations): add launcher prompt helper"
```

---

### Task 2: Pass an Autosubmit Flag Through the Draft Chat Wrapper

**Files:**
- Modify: `app/(dashboard)/chat/chat-draft-page.tsx:20-39`
- Test: `app/(dashboard)/chat/chat-draft-page.test.tsx:1-49`

**Step 1: Write the failing test**

Extend the `ChatPanel` mock so it exposes the new prop:

```tsx
const mockUseSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("@/components/chat/chat-panel", () => ({
  ChatPanel: ({
    chatId,
    autoResume,
    initialPrompt,
    initialQuota,
    initialChatModel,
    autoSubmitInitialPrompt,
  }: {
    chatId: string;
    autoResume?: boolean;
    initialPrompt?: string;
    initialQuota?: { messagesRemaining: number } | null;
    initialChatModel?: string;
    autoSubmitInitialPrompt?: boolean;
  }) => (
    <div>
      <div data-testid="chat-id">{chatId}</div>
      <div data-testid="auto-resume">{String(autoResume)}</div>
      <div data-testid="auto-submit-initial-prompt">{String(autoSubmitInitialPrompt)}</div>
      <div data-testid="quota-remaining">{String(initialQuota?.messagesRemaining ?? "none")}</div>
      <div data-testid="initial-chat-model">{initialChatModel ?? "none"}</div>
      {initialPrompt ? <div data-testid="initial-prompt">{initialPrompt}</div> : null}
    </div>
  ),
}));

it("reads autosubmit=1 from the draft chat query string", () => {
  mockUseSearchParams.mockReturnValue(
    new URLSearchParams("prompt=Help%20me%20create%20an%20automation&autosubmit=1"),
  );

  render(<ChatDraftPage id="thread-draft" initialChatModel="anthropic/claude-sonnet-4-6" />);

  expect(screen.getByTestId("auto-submit-initial-prompt")).toHaveTextContent("true");
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm test:run -- 'app/(dashboard)/chat/chat-draft-page.test.tsx'
```

Expected: FAIL because `autoSubmitInitialPrompt` is not passed through yet.

**Step 3: Write minimal implementation**

Update the draft wrapper to parse the new query param and forward it:

```tsx
const initialPrompt = searchParams?.get("prompt") ?? undefined;
const autoSubmitInitialPrompt = searchParams?.get("autosubmit") === "1";

<ChatPanel
  key={id}
  chatId={id}
  initialMessages={[]}
  initialQuota={initialQuota}
  autoResume={false}
  initialPrompt={initialPrompt}
  autoSubmitInitialPrompt={autoSubmitInitialPrompt}
  initialChatModel={initialChatModel}
/>
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm test:run -- 'app/(dashboard)/chat/chat-draft-page.test.tsx'
```

Expected: PASS.

**Step 5: Commit**

```bash
git add 'app/(dashboard)/chat/chat-draft-page.tsx' 'app/(dashboard)/chat/chat-draft-page.test.tsx'
git commit -m "feat(chat): plumb draft autosubmit flag"
```

---

### Task 3: Teach `ChatPanel` to Auto-Submit the Initial Prompt Once

**Files:**
- Modify: `src/components/chat/chat-panel.tsx:76-430`
- Test: `src/components/chat/chat-panel.test.tsx:671-760`

**Step 1: Write the failing test**

Add a focused test near the existing `initialPrompt` coverage:

```tsx
it("auto submits the initial prompt once when the draft route requests it", async () => {
  const { rerender } = renderPanel(
    <ChatPanel
      chatId="thread-1"
      initialPrompt="Help me create an automation.\n\nRequest:\nDaily pipeline summary"
      autoSubmitInitialPrompt
    />,
  );

  await waitFor(() => {
    expect(sendMessage).toHaveBeenCalledWith(
      { text: "Help me create an automation.\n\nRequest:\nDaily pipeline summary" },
      { body: { selectedChatModel: DEFAULT_CHAT_MODEL } },
    );
  });

  rerender(
    <TooltipProvider>
      <ChatPanel
        chatId="thread-1"
        initialPrompt="Help me create an automation.\n\nRequest:\nDaily pipeline summary"
        autoSubmitInitialPrompt
      />
    </TooltipProvider>,
  );

  expect(sendMessage).toHaveBeenCalledTimes(1);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm test:run -- 'src/components/chat/chat-panel.test.tsx' -t 'auto submits the initial prompt once'
```

Expected: FAIL because `autoSubmitInitialPrompt` does not exist and no auto-submit effect runs.

**Step 3: Write minimal implementation**

Add the prop and a one-time effect:

```tsx
interface ChatPanelProps {
  chatId: string;
  initialMessages?: UIMessage[];
  initialQuota?: MessageQuotaStatus | null;
  autoResume?: boolean;
  initialPrompt?: string;
  autoSubmitInitialPrompt?: boolean;
  initialChatModel?: string;
}

const hasAutoSubmittedInitialPromptRef = useRef(false);

useEffect(() => {
  if (!autoSubmitInitialPrompt) return;
  if (hasAutoSubmittedInitialPromptRef.current) return;
  if (initialMessages.length > 0) return;
  if (status !== "ready") return;

  const trimmedPrompt = initialPrompt?.trim() ?? "";
  if (trimmedPrompt.length === 0) return;

  hasAutoSubmittedInitialPromptRef.current = true;
  setComposerValue("");
  void handleSubmit({ text: trimmedPrompt, files: [] });
}, [
  autoSubmitInitialPrompt,
  handleSubmit,
  initialMessages.length,
  initialPrompt,
  status,
]);
```

Do **not** change the existing `handleSubmit()` draft-thread logic. The whole point is to reuse it so `/chat` still:
- pushes to `/chat/{chatId}`
- inserts the optimistic draft thread
- calls `sendMessage()`
- shows the normal `Thinking...` / streaming behavior

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm test:run -- 'src/components/chat/chat-panel.test.tsx' -t 'auto submits the initial prompt once'
```

Expected: PASS.

**Step 5: Run nearby regression coverage**

Run:

```bash
pnpm test:run -- 'src/components/chat/chat-panel.test.tsx' -t 'passes initialPrompt through to ChatComposer as initialValue'
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/components/chat/chat-panel.tsx src/components/chat/chat-panel.test.tsx
git commit -m "feat(chat): auto submit draft prompts once"
```

---

### Task 4: Build the Automations Launcher Composer Wrapper

**Files:**
- Create: `src/components/automations/automation-launcher-composer.tsx`
- Test: `src/components/automations/__tests__/automation-launcher-composer.test.tsx`
- Modify: `src/lib/automations/launcher-prompt.ts`

**Step 1: Write the failing test**

Mock the heavy child composer and the router so the wrapper test stays focused:

```tsx
const mockPush = vi.fn();
const mockChatComposer = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/components/chat/chat-composer", () => ({
  ChatComposer: (props: {
    value: string;
    selectedChatModel: string;
    placeholder?: string;
    onSubmit: (message: { text: string; files: [] }) => void;
    onSelectedChatModelChange: (modelId: string) => void;
  }) => {
    mockChatComposer(props);
    return (
      <div>
        <div data-testid="placeholder">{props.placeholder}</div>
        <button type="button" onClick={() => props.onSelectedChatModelChange("anthropic/claude-haiku-4-5")}>
          change-model
        </button>
        <button type="button" onClick={() => props.onSubmit({ text: "Daily pipeline summary", files: [] })}>
          submit-launcher
        </button>
      </div>
    );
  },
}));

it("routes to the draft chat page with a normalized prompt and autosubmit flag", async () => {
  const user = userEvent.setup();
  render(<AutomationLauncherComposer />);

  expect(screen.getByTestId("placeholder")).toHaveTextContent("Describe an automation to create...");

  await user.click(screen.getByRole("button", { name: "submit-launcher" }));

  expect(mockPush).toHaveBeenCalledWith(
    "/chat?prompt=Help+me+create+an+automation.%0A%0ARequest%3A%0ADaily+pipeline+summary%0A%0AIf+key+trigger+details+are+missing%2C+ask+one+concise+clarifying+question+before+creating+it.&autosubmit=1",
  );
});
```

Add one more assertion for the model cookie:

```tsx
await user.click(screen.getByRole("button", { name: "change-model" }));
expect(document.cookie).toContain("chat-model=anthropic/claude-haiku-4-5");
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm test:run -- 'src/components/automations/__tests__/automation-launcher-composer.test.tsx'
```

Expected: FAIL because the wrapper component does not exist yet.

**Step 3: Write minimal implementation**

Create a tiny wrapper that reuses `ChatComposer` and only launches into `/chat`:

```tsx
"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { ChatComposer } from "@/components/chat/chat-composer";
import {
  CHAT_MODEL_COOKIE_MAX_AGE,
  CHAT_MODEL_COOKIE_NAME,
  DEFAULT_CHAT_MODEL,
} from "@/lib/ai/models";
import { buildAutomationLauncherPrompt } from "@/lib/automations/launcher-prompt";

export function AutomationLauncherComposer() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [selectedChatModel, setSelectedChatModel] = useState(DEFAULT_CHAT_MODEL);

  const handleModelChange = useCallback((modelId: string) => {
    setSelectedChatModel(modelId);
    document.cookie = `${CHAT_MODEL_COOKIE_NAME}=${modelId}; path=/; max-age=${CHAT_MODEL_COOKIE_MAX_AGE}`;
  }, []);

  return (
    <ChatComposer
      status="ready"
      selectedChatModel={selectedChatModel}
      value={value}
      onValueChange={setValue}
      onSelectedChatModelChange={handleModelChange}
      placeholder="Describe an automation to create..."
      onSubmit={({ text }) => {
        const prompt = buildAutomationLauncherPrompt(text);
        const params = new URLSearchParams({
          prompt,
          autosubmit: "1",
        });

        router.push(`/chat?${params.toString()}`);
      }}
      className="px-0 pb-0"
    />
  );
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm test:run -- 'src/components/automations/__tests__/automation-launcher-composer.test.tsx'
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/automations/automation-launcher-composer.tsx src/components/automations/__tests__/automation-launcher-composer.test.tsx src/lib/automations/launcher-prompt.ts
git commit -m "feat(automations): add launcher composer wrapper"
```

---

### Task 5: Integrate the Launcher Into `/automations` and Remove the Old Button

**Files:**
- Modify: `app/(dashboard)/automations/page.tsx:15-73`
- Modify: `app/(dashboard)/automations/page.test.tsx:1-117`
- Create or reuse: `src/components/automations/automation-launcher-composer.tsx`

**Step 1: Write the failing page test**

Mock the new launcher so the page test stays focused on integration:

```tsx
vi.mock("@/components/automations/automation-launcher-composer", () => ({
  AutomationLauncherComposer: () => <div data-testid="automation-launcher" />,
}));

it("renders the bottom automation launcher and removes the old top-right CTA", () => {
  mockUseTriggers.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  mockUseSetTriggerEnabled.mockReturnValue({
    mutate: vi.fn(),
    variables: null,
  });

  render(<AutomationsPage />);

  expect(
    screen.getByText("Create and manage automated tasks that run on a schedule."),
  ).toBeInTheDocument();
  expect(screen.getByTestId("automation-launcher")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /new automation/i })).not.toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm test:run -- 'app/(dashboard)/automations/page.test.tsx'
```

Expected: FAIL because the page still renders the top-right button and old subtitle.

**Step 3: Write minimal implementation**

Update the page to:
- remove `Link`, `Plus`, and the top-right button
- update the subtitle copy
- keep the existing list/loading/error logic
- render the launcher in a sticky footer shell
- add bottom padding so the footer does not cover the list

```tsx
import { AutomationLauncherComposer } from "@/components/automations/automation-launcher-composer";

export default function AutomationsPage() {
  const { data: triggers = [], isLoading, isError, refetch } = useTriggers();
  const setTriggerEnabled = useSetTriggerEnabled();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto px-4 py-6 md:px-12 md:py-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Automations</h1>
          <p className="mt-2 text-sm text-muted-foreground/80">
            Create and manage automated tasks that run on a schedule.
          </p>
        </div>

        <div className="mt-6 pb-40 md:pb-52">
          {/* existing list / empty / error states stay here */}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 border-t border-border/40 bg-background/95 px-4 py-4 backdrop-blur md:px-12 md:py-6">
        <AutomationLauncherComposer />
      </div>
    </div>
  );
}
```

Keep this DRY:
- reuse `ChatComposer` through the wrapper
- do not duplicate chat input UI inside the page

Keep this YAGNI:
- no inline transcript
- no API changes
- no extra `automation_setup` route

**Step 4: Run page tests to verify they pass**

Run:

```bash
pnpm test:run -- 'app/(dashboard)/automations/page.test.tsx'
```

Expected: PASS.

**Step 5: Run targeted regression tests**

Run:

```bash
pnpm test:run -- \
  'src/lib/automations/__tests__/launcher-prompt.test.ts' \
  'app/(dashboard)/chat/chat-draft-page.test.tsx' \
  'src/components/chat/chat-panel.test.tsx' \
  'src/components/automations/__tests__/automation-launcher-composer.test.tsx' \
  'app/(dashboard)/automations/page.test.tsx'
```

Expected: PASS.

**Step 6: Run targeted lint**

Run:

```bash
pnpm exec eslint \
  'app/(dashboard)/automations/page.tsx' \
  'app/(dashboard)/automations/page.test.tsx' \
  'app/(dashboard)/chat/chat-draft-page.tsx' \
  'app/(dashboard)/chat/chat-draft-page.test.tsx' \
  'src/components/chat/chat-panel.tsx' \
  'src/components/chat/chat-panel.test.tsx' \
  'src/components/automations/automation-launcher-composer.tsx' \
  'src/components/automations/__tests__/automation-launcher-composer.test.tsx' \
  'src/lib/automations/launcher-prompt.ts' \
  'src/lib/automations/__tests__/launcher-prompt.test.ts'
```

Expected: no lint errors.

**Step 7: Commit**

```bash
git add \
  'app/(dashboard)/automations/page.tsx' \
  'app/(dashboard)/automations/page.test.tsx' \
  'app/(dashboard)/chat/chat-draft-page.tsx' \
  'app/(dashboard)/chat/chat-draft-page.test.tsx' \
  'src/components/chat/chat-panel.tsx' \
  'src/components/chat/chat-panel.test.tsx' \
  'src/components/automations/automation-launcher-composer.tsx' \
  'src/components/automations/__tests__/automation-launcher-composer.test.tsx' \
  'src/lib/automations/launcher-prompt.ts' \
  'src/lib/automations/__tests__/launcher-prompt.test.ts'
git commit -m "feat(automations): launch automation setup from automations page"
```

---

## Manual QA

1. Run the app:

```bash
pnpm dev
```

2. Open `/automations`.
3. Verify the top-right `New automation` button is gone.
4. Verify the bottom composer is visible and styled like a creation dock.
5. Type: `Daily morning briefing about my pipeline at 8 AM`.
6. Press `Enter` once.
7. Verify the app navigates into the normal chat draft flow and then to `/chat/{threadId}` automatically.
8. Verify the user sees the standard chat UX:
   - their normalized automation message
   - `Thinking...`
   - the assistant reply streaming in
9. Use `Claude Haiku 4.5` for this manual test.
10. Complete the automation creation in chat and verify the new automation appears back on `/automations`.

## Done Criteria

- `/automations` feels like a creation entrypoint instead of a read-only management page.
- Users only submit once from `/automations`.
- The existing `/chat` surface still owns thread creation, assistant thinking state, and streamed replies.
- The old top-right CTA is removed.
- No backend trigger architecture changed.
