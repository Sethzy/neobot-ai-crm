# Generative UI & Dynamic Chat Hooks Reference — vercel/chatbot

> **Source repo:** [vercel/chatbot](https://github.com/vercel/chatbot) (local clone: `/Users/sethlim/Documents/chatbot`)
> **Feature:** Hooks for building dynamic chat and generative user interfaces
> **Date:** 2026-03-07

---

## 1. Overview

The Vercel chatbot demonstrates three core generative UI patterns built on `@ai-sdk/react` and the `ai` package:

| Pattern | What it does | Key hook/API |
|---------|-------------|-------------|
| **Parts-based messaging** | Messages are `parts[]` (text, file, reasoning, tool-*), not monolithic strings | `useChat()` + `UIMessage` |
| **Tool-driven generative UI** | Server tools produce structured output; client renders custom UI per tool type | `streamText()` tools + `tool-{name}` parts |
| **Data stream side effects** | Server pushes transient data (title updates, artifacts) alongside the message stream | `createUIMessageStream()` + `DataStreamProvider` |

---

## 2. Pattern 1: useChat Hook Configuration

### 2.1 Reference Pattern (vercel/chatbot)

**File:** `components/chat.tsx`

```typescript
const {
  messages,
  setMessages,
  sendMessage,
  status,
  stop,
  addToolApprovalResponse,
  regenerate,
} = useChat({
  id: chatId,
  initialMessages,
  experimental_throttle: 50,         // Batch token updates (50ms)
  generateId: generateUUID,          // Deterministic UUIDs
  sendExtraMessageFields: true,      // Include metadata in transport
  transport: new DefaultChatTransport({
    api: "/api/chat",
    prepareSendMessagesRequest({ id, messages }) {
      const lastMessage = messages.at(-1);
      const isToolApprovalFlow = Boolean(messages);
      return {
        body: isToolApprovalFlow
          ? { id, messages, selectedChatModel, selectedVisibilityType }
          : { id, message: lastMessage, selectedChatModel, selectedVisibilityType },
      };
    },
  }),
  onData: (dataPart) => {
    setDataStream((ds) => (ds ? [...ds, dataPart] : []));
  },
  onFinish: () => {
    queryClient.invalidateQueries();
  },
});
```

### 2.2 Our Current Pattern (Sunder)

**File:** `src/components/chat/chat-panel.tsx`

```typescript
const { messages, sendMessage, status, error, resumeStream, setMessages } = useChat({
  id: chatId,
  messages: initialMessages,
  generateId: () => crypto.randomUUID(),
  experimental_throttle: 50,
  transport,                          // Same DefaultChatTransport pattern
  onData: (dataPart) => {
    if (shouldStoreDataPartForClient(dataPart)) {
      setDataStream((currentParts) => [...currentParts, dataPart]);
    }
  },
  onFinish: () => {
    queryClient.invalidateQueries({ queryKey: threadKeys.all });
  },
});
```

### 2.3 Drift Analysis

| Aspect | Reference | Sunder | Drift? |
|--------|-----------|--------|--------|
| `experimental_throttle` | 50ms | 50ms | No |
| `generateId` | `generateUUID` | `crypto.randomUUID()` | No (equivalent) |
| Transport | `DefaultChatTransport` with `prepareSendMessagesRequest` | Same pattern | No |
| Approval detection | Checks `approval-responded` / `output-denied` in parts | Same check | No |
| `onData` | Stores all data parts | Filters to `data-chat-title` and `data-appendMessage` | Intentional — we only need title + resume |
| `addToolApprovalResponse` | Destructured, wired to UI buttons | **Not destructured, no UI** | **Gap** |
| `regenerate` | Destructured, wired to message actions | **Not used** | Gap (deferred) |
| `stop` | Destructured, wired to stop button | **Not used** | Gap |
| Model selector | User picks model per-message | Single model (Gemini Flash) | Intentional (v1) |

**Bottom line:** The hook wiring is nearly identical. The gaps are in **using** the returned functions (`addToolApprovalResponse`, `stop`, `regenerate`) in UI, not in how the hook is configured.

---

## 3. Pattern 2: Tool-Driven Generative UI

### 3.1 How It Works (Reference)

The reference renders **different UI components per tool type** based on the `type` field in message parts:

**File:** `components/message.tsx`

```typescript
{message.parts?.map((part, index) => {
  const { type } = part;

  if (type === "reasoning") {
    return <MessageReasoning reasoning={part.text} isLoading={isStreaming} />;
  }

  if (type === "text") {
    return <MessageContent><Response>{sanitizeText(part.text)}</Response></MessageContent>;
  }

  if (type === "tool-getWeather") {
    const { toolCallId, state } = part;

    if (state === "output-available") {
      return <Weather weatherAtLocation={part.output} />;
    }

    if (state === "approval-requested" && approvalId) {
      return (
        <Tool>
          <ToolHeader state={state} type="tool-getWeather" />
          <ToolContent>
            <ToolInput input={part.input} />
            <div className="flex gap-2">
              <button onClick={() => addToolApprovalResponse({ id: approvalId, approved: false })}>
                Deny
              </button>
              <button onClick={() => addToolApprovalResponse({ id: approvalId, approved: true })}>
                Allow
              </button>
            </div>
          </ToolContent>
        </Tool>
      );
    }

    // Other states: input-available, output-error, etc.
    return (
      <Tool>
        <ToolHeader state={state} type="tool-getWeather" />
        <ToolContent><ToolInput input={part.input} /></ToolContent>
      </Tool>
    );
  }

  if (type === "tool-createDocument") {
    return <DocumentPreview result={part.output} />;
  }

  if (type === "tool-updateDocument") {
    return <DocumentPreview args={{ ...part.output, isUpdate: true }} result={part.output} />;
  }

  return null;
})}
```

### 3.2 Tool Part State Machine

```
input-available  →  Tool called, waiting for execution
input-streaming  →  Tool input still streaming in
approval-requested  →  Tool requires user approval (has approval.id)
    ↓ user clicks Allow
approval-responded  →  Approved, tool will execute
    ↓ user clicks Deny
output-denied  →  Denied, tool skipped
output-available  →  Tool completed with result
output-error  →  Tool failed with error
```

### 3.3 Our Current State

**File:** `src/components/chat/message-bubble.tsx`

We render tool parts via `StepsSummary` → `ToolCallInline`, which is a **collapsed/expandable pill** showing tool name + JSON input/output.

```typescript
const intermediateParts = message.parts.filter(
  (p) => p.type === "reasoning" || p.type.startsWith("tool-"),
);
const textParts = message.parts.filter((p) => p.type === "text");

return (
  <Message from="assistant">
    <MessageContent>
      {intermediateParts.length > 0 && (
        <StepsSummary parts={intermediateParts} isStreaming={isStreaming} />
      )}
      {textParts.map((part, i) => (
        <MessageResponse key={...}>{part.text}</MessageResponse>
      ))}
    </MessageContent>
  </Message>
);
```

### 3.4 Drift Analysis — Tool Rendering

| Aspect | Reference | Sunder | Drift reason |
|--------|-----------|--------|-------------|
| **Tool dispatch** | Per-tool-type switch (`tool-getWeather`, `tool-createDocument`) with custom UI | Generic `ToolCallInline` for all tools (JSON in/out) | Sunder has ~30 backend tools; custom UI per tool is not practical for v1 |
| **Approval UI** | Inline Approve/Deny buttons | **Missing** — schema supports it, no buttons rendered | Gap: needed for safety model |
| **Custom tool UI** | `<Weather>`, `<DocumentPreview>` components | None — all tools show generic JSON | Intentional for v1 (deferred) |
| **Tool collapsing** | Tools shown inline in message flow | Tools collapsed into `StepsSummary` header | Design choice — progressive disclosure |

**Justified drift:**
- Generic tool display is correct for Sunder v1 (30+ tools, custom UI per tool is premature).
- `StepsSummary` progressive disclosure is a better UX for an agent with many tool calls per message.

**Gap to fix:**
- Approval UI buttons (`addToolApprovalResponse`) must be wired for tools that require user approval.

---

## 4. Pattern 3: Tool Approval Flow

### 4.1 Reference Implementation

**Server side** (`app/(chat)/api/chat/route.ts`):
```typescript
// getWeather tool requires approval
const getWeather = tool({
  description: "Get weather",
  parameters: z.object({ ... }),
  execute: async (params) => { /* ... */ },
  experimental_requireConfirmation: true,  // ← Triggers approval flow
});
```

**Client side** (`components/message.tsx`):
```typescript
if (state === "approval-requested" && approvalId) {
  return (
    <div>
      <button onClick={() => addToolApprovalResponse({ id: approvalId, approved: false, reason: "Denied" })}>
        Deny
      </button>
      <button onClick={() => addToolApprovalResponse({ id: approvalId, approved: true })}>
        Allow
      </button>
    </div>
  );
}
```

**Transport** (detects approval and sends full history):
```typescript
prepareSendMessagesRequest({ id, messages }) {
  const isToolApprovalFlow = messages.some((m) =>
    m.parts?.some((p) => p.state === "approval-responded" || p.state === "output-denied")
  );
  return {
    body: isToolApprovalFlow ? { id, messages } : { id, message: lastMessage },
  };
}
```

### 4.2 Our Current State

| Layer | Status |
|-------|--------|
| Schema (`lib/chat/schemas.ts`) | `approval-requested`, `approval-responded`, `output-denied` all defined |
| Transport (`chat-panel.tsx`) | Detects approval continuation, sends full history |
| Hook (`useChat`) | `addToolApprovalResponse` available but not destructured |
| UI buttons | **Missing** — no approve/deny buttons anywhere |
| Runner tools | Safety model exists but per-tool `requireConfirmation` not wired |

**What to do:** Wire `addToolApprovalResponse` through to message rendering. Add approve/deny buttons when `state === "approval-requested"`.

---

## 5. Pattern 4: Data Stream Provider

### 5.1 Reference Pattern

**File:** `components/data-stream-provider.tsx`

```typescript
type DataStreamContextValue = {
  dataStream: DataUIPart<CustomUIDataTypes>[];
  setDataStream: React.Dispatch<SetStateAction<DataUIPart<CustomUIDataTypes>[]>>;
};

// Custom data part types:
export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  "chat-title": string;
};
```

Used for:
1. **Title generation** — `data-chat-title` part arrives, triggers thread title update
2. **Artifact streaming** — `data-textDelta`, `data-codeDelta` stream content into Document canvas
3. **Resume** — `data-appendMessage` appends persisted message on recovery

### 5.2 Our Current State

**File:** `src/components/chat/data-stream-provider.tsx`

```typescript
type DataStreamContextValue = {
  dataStream: unknown[];
  setDataStream: React.Dispatch<SetStateAction<unknown[]>>;
};
```

We filter for only two part types:
```typescript
function shouldStoreDataPartForClient(part: unknown): boolean {
  return part.type === "data-chat-title" || part.type === "data-appendMessage";
}
```

### 5.3 Drift Analysis

| Aspect | Reference | Sunder | Drift reason |
|--------|-----------|--------|-------------|
| Typed data parts | `CustomUIDataTypes` generic | `unknown[]` | Sunder doesn't have artifacts/canvas — fewer data types needed |
| Part types used | ~12 types (artifacts, suggestions, etc.) | 2 types (title, appendMessage) | Intentional — no artifact system in v1 |
| Title handling | In `onData` + title update query | Same pattern | No drift |

**No action needed** — our simpler data stream is correct for v1. If/when we add artifacts, we'll type it.

---

## 6. Pattern 5: Resumable Streams

### 6.1 Reference Pattern

**Server** (`app/(chat)/api/chat/route.ts`):
```typescript
return createUIMessageStreamResponse({
  stream,
  async consumeSseStream({ stream: sseStream }) {
    const streamContext = getStreamContext();
    const streamId = generateId();
    await createStreamId({ streamId, chatId: id });
    await streamContext.createNewResumableStream(streamId, () => sseStream);
  },
});
```

**Client** (auto-resume hook):
```typescript
// If last message is user (no assistant response yet), resume
useEffect(() => {
  if (autoResume && initialMessages.at(-1)?.role === "user") {
    resumeStream();
  }
}, []);
```

### 6.2 Our Current State

**File:** `app/api/chat/route.ts` — Uses same `createResumableStreamContext` + Redis tracking.
**File:** `src/hooks/use-auto-resume.ts` — Same auto-resume logic.

**No drift.** Implementation matches the reference.

---

## 7. Pattern 6: Message Actions

### 7.1 Reference Components

| Component | Purpose | Our equivalent |
|-----------|---------|----------------|
| `MessageActions` | Copy, edit, regenerate on hover | **Missing** |
| `MessageEditor` | Inline edit + re-send user message | **Missing** |
| `SuggestedActions` | Pre-fill cards before first message | **Missing** (deferred) |
| `StopButton` | Cancel streaming | **Missing** |

### 7.2 Drift Analysis

These are all UX polish features. Not critical for v1 but good to know the patterns exist.

**`StopButton`** is the most impactful missing piece — users currently can't cancel a streaming response.

---

## 8. Files to Reference

### From vercel/chatbot (read for patterns)

| File | Pattern it demonstrates |
|------|------------------------|
| `components/chat.tsx` | Full useChat wiring with all hooks |
| `components/message.tsx` | Per-tool-type part rendering, approval buttons |
| `components/data-stream-provider.tsx` | Typed data stream context |
| `components/message-actions.tsx` | Copy/edit/regenerate actions |
| `components/message-editor.tsx` | Inline message editing |
| `components/message-reasoning.tsx` | Reasoning collapsible |
| `components/suggested-actions.tsx` | Pre-fill suggestion cards |
| `lib/ai/tools/get-weather.ts` | `experimental_requireConfirmation: true` |
| `app/(chat)/api/chat/route.ts` | `convertToModelMessages()`, approval persistence |

### From Sunder (files to modify)

| File | What changes |
|------|-------------|
| `src/components/chat/chat-panel.tsx` | Destructure `addToolApprovalResponse`, `stop`; pass to children |
| `src/components/chat/message-bubble.tsx` | Add approval buttons for `approval-requested` state |
| `src/components/chat/chat-composer.tsx` | Add stop button when `status === "submitted"` |
| `src/components/chat/steps-summary.tsx` | Show approval state in collapsed summary |

---

## 9. Implementation Priority

### Must-do (critical gaps)

1. **Tool approval UI** — Wire `addToolApprovalResponse` with approve/deny buttons in message rendering. Required for safety model.
2. **Stop button** — Add to `ChatComposer` when streaming. Simple, high-impact UX.

### Nice-to-have (v1 polish)

3. **Message actions** — Copy, regenerate on hover
4. **Message editing** — Inline edit + re-send
5. **Suggested actions** — Pre-fill cards for empty chat

### Not needed for v1

6. **Custom tool UI** — Per-tool rendering (Weather, Document) — we have 30+ generic tools
7. **Artifact system** — Document canvas, code editor, sheets — out of scope
8. **Model selector** — Single model in v1

---

## 10. Key AI SDK Functions Reference

| Function | Import | When to use |
|----------|--------|-------------|
| `useChat()` | `@ai-sdk/react` | Client-side chat state management |
| `sendMessage()` | from `useChat()` | Send user message with parts |
| `addToolApprovalResponse()` | from `useChat()` | Approve/deny tool execution |
| `stop()` | from `useChat()` | Cancel streaming response |
| `regenerate()` | from `useChat()` | Re-generate last assistant message |
| `setMessages()` | from `useChat()` | Manual message state manipulation |
| `resumeStream()` | from `useChat()` | Resume interrupted stream |
| `convertToModelMessages()` | `ai` | Convert UI parts to model format |
| `createUIMessageStream()` | `ai` | Server: wrap stream + add data parts |
| `createUIMessageStreamResponse()` | `ai` | Server: SSE response + resumable |
| `streamText()` | `ai` | Server: call LLM with tools |
| `DefaultChatTransport` | `ai` | Custom request preparation |
