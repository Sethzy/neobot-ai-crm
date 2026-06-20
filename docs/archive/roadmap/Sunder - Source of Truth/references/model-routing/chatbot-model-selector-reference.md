# Reference: User-Facing Model Selector (Vercel Chatbot)

**Source repo:** `chatbot` (cloned at `/Users/sethlim/Documents/chatbot`)
**Feature:** Per-message model selection — user picks which LLM runs each message, persisted via cookie.
**Date documented:** 2026-03-30

---

## 1. What the Reference Repo Does

The Vercel `chatbot` template gives every user a model picker in the chat input toolbar. The selected model is:

1. **Persisted** in a `chat-model` cookie (1-year expiry, client-side `document.cookie`).
2. **Read server-side** on page load (`cookies().get("chat-model")`) and passed as `initialChatModel` prop to the `Chat` component.
3. **Sent per-message** in the request body as `selectedChatModel` via the transport's `prepareSendMessagesRequest`.
4. **Validated** against an `allowedModelIds` set in the API route.
5. **Resolved** to an AI SDK `LanguageModel` via `gateway.languageModel(modelId)`.

No LLM routing, no classification step, no complexity tiers. The user chooses; the system obeys.

---

## 2. Architecture: Complete Data Flow

```
Cookie "chat-model"
        │
        ▼
  Page (Server Component)
  ├─ reads cookie
  └─ passes initialChatModel to Chat
        │
        ▼
  Chat (Client Component)
  ├─ useState(initialChatModel) → currentModelId
  ├─ ref (currentModelIdRef) for closure stability
  └─ passes selectedModelId + onModelChange to MultimodalInput
        │
        ▼
  MultimodalInput → ModelSelectorCompact
  ├─ user picks model → onModelChange(id) + setCookie("chat-model", id)
  └─ (model state updates in Chat via setCurrentModelId)
        │
        ▼
  Transport (prepareSendMessagesRequest)
  ├─ reads currentModelIdRef.current
  └─ adds { selectedChatModel } to request body
        │
        ▼
  API Route (POST /api/chat)
  ├─ Zod validates selectedChatModel: z.string()
  ├─ allowedModelIds.has(selectedChatModel) guard
  └─ streamText({ model: getLanguageModel(selectedChatModel) })
        │
        ▼
  providers.ts → getLanguageModel()
  ├─ if reasoning model → wrapLanguageModel with extractReasoningMiddleware
  └─ else → gateway.languageModel(modelId)
```

---

## 3. Files to Copy / Reference (with exact source paths)

### 3.1 Model List — `lib/ai/models.ts`

**Source:** `/Users/sethlim/Documents/chatbot/lib/ai/models.ts`

Defines the `ChatModel` type, the full model list, and derived exports:

```typescript
export const DEFAULT_CHAT_MODEL = "openai/gpt-4.1-mini";

export type ChatModel = {
  id: string;       // Vercel AI Gateway model ID, e.g. "google/gemini-3-flash"
  name: string;     // Human-readable label
  provider: string; // Grouping key for the UI
  description: string;
};

export const chatModels: ChatModel[] = [ /* ... models ... */ ];

// Derived: validation set + UI grouping
export const allowedModelIds = new Set(chatModels.map((m) => m.id));
export const modelsByProvider = chatModels.reduce(/* ... */);
```

**Key pattern:** `allowedModelIds` is a `Set` derived from the model list. The API route checks `allowedModelIds.has(selectedChatModel)` — any model ID not in the list is rejected as 400.

---

### 3.2 Model Resolution — `lib/ai/providers.ts`

**Source:** `/Users/sethlim/Documents/chatbot/lib/ai/providers.ts`

The `getLanguageModel(modelId)` function resolves a gateway model string to an AI SDK `LanguageModel`. Has three branches:

1. **Test environment** → returns a mock provider model.
2. **Reasoning model** (ID ends in `-thinking` or contains `reasoning`) → wraps with `extractReasoningMiddleware`.
3. **Normal model** → `gateway.languageModel(modelId)`.

```typescript
import { gateway } from "@ai-sdk/gateway";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";

export function getLanguageModel(modelId: string) {
  // Test mock branch omitted
  const isReasoningModel = modelId.endsWith("-thinking") || /* ... */;

  if (isReasoningModel) {
    return wrapLanguageModel({
      model: gateway.languageModel(modelId.replace(/-thinking$/, "")),
      middleware: extractReasoningMiddleware({ tagName: "thinking" }),
    });
  }

  return gateway.languageModel(modelId);
}
```

---

### 3.3 UI Components — Model Selector

**Source:** `/Users/sethlim/Documents/chatbot/components/ai-elements/model-selector.tsx`

A thin wrapper library over shadcn's `Command` + `Dialog`:

| Export                   | Wraps                 | Purpose                          |
|--------------------------|-----------------------|----------------------------------|
| `ModelSelector`          | `Dialog`              | Root open/close state            |
| `ModelSelectorTrigger`   | `DialogTrigger`       | Button that opens the dialog     |
| `ModelSelectorContent`   | `DialogContent`       | Dialog body with `Command` shell |
| `ModelSelectorInput`     | `CommandInput`        | Search field                     |
| `ModelSelectorList`      | `CommandList`         | Scrollable list container        |
| `ModelSelectorGroup`     | `CommandGroup`        | Provider group (heading)         |
| `ModelSelectorItem`      | `CommandItem`         | Individual model option          |
| `ModelSelectorLogo`      | `next/image`          | Provider logo from models.dev    |
| `ModelSelectorName`      | `<span>`              | Truncated model name             |

Logo source: `https://models.dev/logos/${provider}.svg` — external CDN of provider logos.

---

### 3.4 Model Picker in Chat Input — `components/multimodal-input.tsx`

**Source:** `/Users/sethlim/Documents/chatbot/components/multimodal-input.tsx` (lines 464–534)

The `ModelSelectorCompact` component is embedded in the input toolbar:

```typescript
function PureModelSelectorCompact({
  selectedModelId,
  onModelChange,
}: {
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const selectedModel =
    chatModels.find((m) => m.id === selectedModelId) ??
    chatModels.find((m) => m.id === DEFAULT_CHAT_MODEL) ??
    chatModels[0];
  const [provider] = selectedModel.id.split("/");

  return (
    <ModelSelector onOpenChange={setOpen} open={open}>
      <ModelSelectorTrigger asChild>
        <Button className="h-8 w-[200px] justify-between px-2" variant="ghost">
          <ModelSelectorLogo provider={provider} />
          <ModelSelectorName>{selectedModel.name}</ModelSelectorName>
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorInput placeholder="Search models..." />
        <ModelSelectorList>
          {Object.entries(modelsByProvider).map(([providerKey, models]) => (
            <ModelSelectorGroup heading={providerNames[providerKey]} key={providerKey}>
              {models.map((model) => (
                <ModelSelectorItem
                  key={model.id}
                  onSelect={() => {
                    onModelChange?.(model.id);
                    setCookie("chat-model", model.id);
                    setOpen(false);
                  }}
                  value={model.id}
                >
                  <ModelSelectorLogo provider={model.id.split("/")[0]} />
                  <ModelSelectorName>{model.name}</ModelSelectorName>
                  {model.id === selectedModel.id && <CheckIcon className="ml-auto size-4" />}
                </ModelSelectorItem>
              ))}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}
```

Cookie helper (same file, line 50):

```typescript
function setCookie(name: string, value: string) {
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}`;
}
```

---

### 3.5 Chat Component — State + Transport

**Source:** `/Users/sethlim/Documents/chatbot/components/chat.tsx` (lines 73–132)

```typescript
const [currentModelId, setCurrentModelId] = useState(initialChatModel);
const currentModelIdRef = useRef(currentModelId);

useEffect(() => {
  currentModelIdRef.current = currentModelId;
}, [currentModelId]);

// Inside useChat transport:
transport: new DefaultChatTransport({
  api: "/api/chat",
  prepareSendMessagesRequest(request) {
    return {
      body: {
        id: request.id,
        ...(isToolApprovalContinuation
          ? { messages: request.messages }
          : { message: lastMessage }),
        selectedChatModel: currentModelIdRef.current,  // ← injected here
        ...request.body,
      },
    };
  },
}),
```

**Why a ref?** The `prepareSendMessagesRequest` closure captures the ref, not the state value. Without this, stale closures would send the wrong model ID if the user changes the model between messages.

---

### 3.6 API Route Schema — `app/(chat)/api/chat/schema.ts`

**Source:** `/Users/sethlim/Documents/chatbot/app/(chat)/api/chat/schema.ts`

```typescript
export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  message: userMessageSchema.optional(),
  messages: z.array(messageSchema).optional(),
  selectedChatModel: z.string(),                    // ← added field
  selectedVisibilityType: z.enum(["public", "private"]),
});
```

---

### 3.7 API Route — Validation + Usage

**Source:** `/Users/sethlim/Documents/chatbot/app/(chat)/api/chat/route.ts` (lines 65–157)

```typescript
const { selectedChatModel } = requestBody;

// Validation
if (!allowedModelIds.has(selectedChatModel)) {
  return new ChatbotError("bad_request:api").toResponse();
}

// Usage — passed directly to streamText
const result = streamText({
  model: getLanguageModel(selectedChatModel),
  system: systemPrompt({ selectedChatModel, requestHints }),
  // ...
});
```

The system prompt also receives `selectedChatModel` to customize behavior for reasoning models (disables artifacts prompt).

---

### 3.8 Page-Level Cookie Reading

**New chat page** (`app/(chat)/page.tsx`):

```typescript
const cookieStore = await cookies();
const modelIdFromCookie = cookieStore.get("chat-model");

return (
  <Chat
    initialChatModel={modelIdFromCookie?.value ?? DEFAULT_CHAT_MODEL}
    // ...
  />
);
```

**Existing chat page** (`app/(chat)/chat/[id]/page.tsx`): identical pattern.

---

### 3.9 E2E Tests

**Source:** `/Users/sethlim/Documents/chatbot/tests/e2e/model-selector.test.ts`

Playwright tests covering:
- Model button displays
- Opening/closing the selector dialog
- Searching for models
- Provider group headings visible
- Selecting a different model updates the button text

---

## 4. Where Sunder Drifts Today

### 4.1 No `selectedChatModel` field yet

Sunder's `app/api/chat/schema.ts` and `src/lib/runner/schemas.ts` do not currently include a `selectedChatModel` field, and `run-agent.ts` still hardcodes `TIER_1_MODEL`.

### 4.2 The live chat UI surface is not the analyst input

The correct Sunder UI path is:

```text
app/(dashboard)/chat/page.tsx
  → chat-draft-page.tsx
  → ChatPanel
  → ChatComposer
```

and

```text
app/(dashboard)/chat/[threadId]/page.tsx
  → chat-thread-page-client.tsx
  → ChatPanel
  → ChatComposer
```

The earlier handover incorrectly targeted `src/components/analyst/chat-input.tsx`, which is the separate analyst tab flow and posts to `/api/analyst/chat`.

### 4.3 Sunder has a DB-backed thread queue that chatbot does not

Busy-thread messages are persisted via `thread_queue_records`, replayed by `drain-and-continue.ts`, and sometimes batched into a single follow-up run. This means model selection must survive queueing, and queue batching must stop when the selected model changes.

### 4.4 Sunder uses `createGateway()` and conditional BYOK

Sunder's `gateway.ts` uses `createGateway({ apiKey })` plus optional Google BYOK. This is legitimate drift from chatbot and should stay. The important fix is that `gateway: { caching: 'auto' }` must exist even when BYOK is absent.

### 4.5 No cookie reading, no selector UI, and no transport injection yet

The main chat pages do not yet read the `chat-model` cookie, `ChatComposer` has no model picker, and `ChatPanel` does not inject `selectedChatModel` into `prepareSendMessagesRequest`.

### 4.6 `models.dev` is not yet allowlisted

The chatbot selector uses `next/image` with `https://models.dev/logos/...`. Sunder's `next.config.ts` currently only whitelists Supabase-hosted images, so the new domain must be added.

---

## 5. Drift Analysis: What to Copy vs. What to Adapt

| Chatbot Pattern | Copy Verbatim? | Sunder Adaptation | Reason |
|---|---|---|---|
| `ChatModel` type + model list | **Mostly** | Same shape, Sunder model entries + small helper like `resolveModelId(id)` | Keeps model metadata centralized and DRY |
| `allowedModelIds` Set | **Yes** | — | Identical pattern |
| `modelsByProvider` grouping | **Yes** | — | Identical pattern |
| `getLanguageModel()` | **Mostly** | Keep `createGateway()` and always-on `gateway.caching` with conditional `byok.google` | Sunder already uses custom gateway config |
| `ModelSelector` ai-elements | **Yes** | — | Copy the primitive library |
| `ModelSelectorCompact` | **Mostly** | Embed in `ChatComposer`, not analyst input | Correct Sunder UI surface |
| `setCookie()` helper | **Yes** | — | Identical |
| `useState` + `useRef` in Chat | **Yes** | Apply in `ChatPanel` | Same closure-stability need |
| `prepareSendMessagesRequest` injection | **Yes** | Add `selectedChatModel` alongside existing body fields | Same transport pattern |
| `selectedChatModel` in Zod schema | **Yes** | Make it optional in Sunder | Allows default/fallback path |
| `allowedModelIds.has()` guard | **Yes** | Route validates, runner defensively resolves | Explicit route error + safe fallback for non-HTTP callers |
| `streamText({ model: getLanguageModel(id) })` | **Yes** | Happens in `run-agent.ts`, not route.ts | Sunder's runner owns the model call |
| Cookie reading in page components | **Yes** | Thread through `chat-draft-page.tsx` and `chat-thread-page-client.tsx` | Sunder has extra wrapper components |
| Queue persistence of selected model | **No chatbot equivalent** | Add to `thread-queue.ts` + `drain-and-continue.ts` | Sunder-specific architecture |
| Queue batch split on model change | **No chatbot equivalent** | Stop batching when model differs | Preserves per-message semantics |
| `selectedVisibilityType` | **No** | Skip | Sunder has no public/private chat visibility |
| Reasoning model branch | **No (for now)** | Skip middleware wrapping | No reasoning models in Sunder v1 |
| `systemPrompt({ selectedChatModel })` | **No** | Keep Sunder's model-agnostic 7-layer prompt | No model-specific prompt behavior needed |
| Logo CDN (`models.dev`) | **Yes** | Add to `next.config.ts` | Minimal drift from reference |
| Subagent model propagation | **No** | Keep out of scope | v1 only changes the top-level chat runner |

---

## 6. Locked Sunder Decisions

| # | Decision | Why |
|---|---|---|
| 1 | **Main `/chat` only** | Analyst chat is a separate feature surface and route. |
| 2 | **Keep `createGateway()`** | Sunder's existing gateway + BYOK setup is legitimate and should not be regressed. |
| 3 | **Always-on `gateway.caching`** | MiniMax needs explicit caching markers; the current conditional object shape is insufficient. |
| 4 | **Preserve Google BYOK** | Existing cost/billing behavior stays intact when `GEMINI_API_KEY` is present. |
| 5 | **Queue persists `selectedChatModel`** | Otherwise busy-thread messages silently fall back to Gemini. |
| 6 | **Batch split on model change** | Two queued messages with different selected models must not collapse into one run. |
| 7 | **Route validates, runner resolves defensively** | Explicit HTTP rejection plus safe fallback for queue/internal call paths. |
| 8 | **Top-level runner only** | Subagents remain on `TIER_1_MODEL` for v1 to keep scope tight. |
| 9 | **Whitelist `models.dev`** | Keeps the UI close to the chatbot reference with minimal drift. |

---

## 7. Implementation Task Map

### Task 1: Model catalog + helper (`src/lib/ai/models.ts` — NEW)

- Copy `ChatModel` shape
- Define Sunder's initial two-model list
- Export `DEFAULT_CHAT_MODEL`, `allowedModelIds`, `modelsByProvider`
- Add a tiny helper such as `resolveModelId(id)` for fallback behavior

### Task 2: Gateway helper + caching config (`src/lib/ai/gateway.ts` — EDIT)

- Add `getLanguageModel(modelId: string)`
- Keep `createGateway()`
- Make `gateway: { caching: 'auto' }` unconditional
- Merge `byok.google` only when `GEMINI_API_KEY` exists

### Task 3: Model selector primitives (`src/components/ai-elements/model-selector.tsx` — NEW)

- Copy the chatbot selector primitives
- Reuse existing shadcn `Command` + `Dialog`

### Task 4: Main chat composer UI (`src/components/chat/chat-composer.tsx` — EDIT)

- Add `selectedModelId` + `onModelChange`
- Copy/adapt `ModelSelectorCompact`
- Write the `chat-model` cookie client-side

### Task 5: Shared empty state wiring (`src/components/chat/chat-welcome.tsx` — EDIT)

- Pass model props into the shared `ChatComposer`

### Task 6: Chat state + transport (`src/components/chat/chat-panel.tsx` — EDIT)

- Add `initialChatModel`
- Add `useState(initialChatModel)` + `useRef`
- Inject `selectedChatModel` into `prepareSendMessagesRequest`
- Pass props through to both `ChatComposer` and `ChatWelcome`

### Task 7: Cookie reading on both chat entry paths

- `app/(dashboard)/chat/page.tsx` reads `chat-model` and passes it to `chat-draft-page.tsx`
- `app/(dashboard)/chat/chat-draft-page.tsx` passes it into `ChatPanel`
- `app/(dashboard)/chat/[threadId]/page.tsx` reads `chat-model` and passes it to `chat-thread-page-client.tsx`
- `app/(dashboard)/chat/[threadId]/chat-thread-page-client.tsx` passes it into `ChatPanel`

### Task 8: Request schema + route (`app/api/chat/schema.ts` + `route.ts`)

- Add optional `selectedChatModel`
- Validate it against `allowedModelIds`
- Pass it into `runAgent()` payload

### Task 9: Runner (`src/lib/runner/run-agent.ts` + `src/lib/runner/schemas.ts`)

- Add optional `selectedChatModel` to `RunnerPayload`
- Resolve it defensively before `streamText()`
- Use `getLanguageModel()` instead of the direct hardcoded chat model

### Task 10: Queue persistence (`src/lib/runner/thread-queue.ts`)

- Persist `selectedChatModel` in queued JSON payloads
- Hydrate it on `drainQueue()`

### Task 11: Queue replay semantics (`src/lib/runner/drain-and-continue.ts`)

- Treat a model change as a batch boundary
- Requeue remaining items with their original `selectedChatModel`
- Replay the next run with the preserved model

### Task 12: External image allowlist (`next.config.ts`)

- Add `models.dev` to `images.remotePatterns`

---

## 8. Automatic Caching (IMPORTANT)

Vercel AI Gateway supports automatic prompt caching. Some providers cache implicitly (Google, OpenAI, DeepSeek), while others require **explicit cache markers** (Anthropic, **MiniMax**).

Setting `caching: 'auto'` in `providerOptions.gateway` tells the gateway to inject cache markers automatically for providers that need them. It's a no-op for implicit-caching providers.

**This matters for Sunder because MiniMax requires explicit caching.** Without it, Sunder's large 7-layer system prompt is re-processed at full cost on every MiniMax call.

| Provider | Caching type | `caching: 'auto'` effect |
|---|---|---|
| Google (Gemini) | Implicit | No change needed |
| **MiniMax** | **Explicit** | **Adds cache markers to static content** |
| Anthropic | Explicit | Adds `cache_control` breakpoint |
| OpenAI | Implicit | No change needed |
| DeepSeek | Implicit | No change needed |

### Required change

Sunder's `gatewayProviderOptions` currently makes the entire `gateway` object conditional on BYOK. That is too narrow, because MiniMax still needs caching markers when no Google BYOK key exists.

Current shape:

```typescript
gateway: {
  byok: {
    google: [{ apiKey: process.env.GEMINI_API_KEY }],
  },
}
```

Must become:

```typescript
gateway: {
  caching: 'auto',  // ← enables prompt caching for MiniMax + future explicit providers
  ...(process.env.GEMINI_API_KEY
    ? {
        byok: {
          google: [{ apiKey: process.env.GEMINI_API_KEY }],
        },
      }
    : {}),
}
```

**Source:** https://vercel.com/docs/ai-gateway/models-and-providers/automatic-caching

---

## 9. Review Outcome

| # | Review Item | Status | Resolution |
|---|---|---|---|
| 1 | MiniMax gateway model ID | **Resolved** | `minimax/minimax-m2.7` — confirmed in Vercel AI Gateway dashboard |
| 2 | shadcn Command component | **Resolved** | Already installed at `src/components/ui/command.tsx` |
| 3 | shadcn Dialog component | **Resolved** | Already installed at `src/components/ui/dialog.tsx` |
| 4 | Wrong frontend surface in earlier handover | **Resolved** | Use `ChatPanel` + `ChatComposer`, not analyst input |
| 5 | Queue persistence missing from original plan | **Resolved** | Persist `selectedChatModel` through queue + replay |
| 6 | Queue batching semantics undefined | **Resolved** | Split batches when model changes |
| 7 | BYOK vs caching interaction | **Resolved** | Keep Google BYOK, make `gateway.caching` unconditional |
| 8 | `models.dev` external logo host | **Resolved** | Add to `next.config.ts` |
| 9 | Subagent propagation scope | **Resolved** | Explicitly out of scope for v1 |
