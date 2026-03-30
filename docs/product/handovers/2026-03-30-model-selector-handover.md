# Handover: User-Facing Model Selector

**Date:** 2026-03-30
**Feature:** Per-message model selection — user picks which LLM processes each message
**Status:** Reviewed against the live Sunder codebase, ready for implementation

---

## Context

Sunder currently hardcodes `TIER_1_MODEL` (Gemini Flash 3) for all chat runs. We want users to choose between models (initially Gemini Flash 3 and MiniMax M2.7) on the main `/chat` surface. The Vercel `chatbot` template remains the reference pattern, but this handover now reflects Sunder's actual architecture after review.

## Reference Doc

**Read this first:**
`roadmap docs/Sunder - Source of Truth/references/model-routing/chatbot-model-selector-reference.md`

It contains the chatbot pattern, Sunder-specific drift analysis, queue considerations, and gateway caching notes. The chatbot repo is cloned at `/Users/sethlim/Documents/chatbot` for direct file reference.

## Key Decisions (Locked)

- **No LLM router / complexity classifier.** User picks the model explicitly.
- **Scope:** Main `/chat` flow only in v1. Analyst chat is out of scope.
- **Cookie persistence:** `chat-model`, 1-year expiry, same pattern as chatbot.
- **Initial models:** Gemini Flash 3 (`google/gemini-3-flash`) + MiniMax M2.7 (`minimax/minimax-m2.7`).
- **MiniMax billing:** Goes through Vercel AI Gateway credits. **Preserve existing Google BYOK** behavior when `GEMINI_API_KEY` is set.
- **Automatic caching:** `gatewayProviderOptions` must always include `gateway: { caching: 'auto' }`. Conditionally merge `byok.google` into that object when `GEMINI_API_KEY` exists. Do **not** keep the current "whole object disappears without BYOK" behavior.
- **Queue persistence:** Persist `selectedChatModel` in queued payloads so busy-thread messages do not silently fall back to Gemini.
- **Queue batching rule:** Stop batching when `selectedChatModel` changes. If two queued messages chose different models, they must run separately.
- **Subagents:** Out of scope. Only the top-level chat runner uses the selected model in v1; `run_subagent` stays on `TIER_1_MODEL`.
- **Validation helper:** Add a small shared helper in `src/lib/ai/models.ts` (for example `resolveModelId(id)`) that returns the input when allowed and `DEFAULT_CHAT_MODEL` otherwise. The route still 400s on invalid input; the runner uses the helper as defensive fallback.
- **Logo CDN:** Keep the chatbot `models.dev` logo pattern and whitelist the domain in `next.config.ts`.
- **No reasoning model support** in v1. Skip `extractReasoningMiddleware`.
- **No `selectedVisibilityType`** — Sunder has no public/private chat.

## Files to Touch (Exact Locations)

### Backend

| File | Action | What |
|---|---|---|
| `src/lib/ai/models.ts` | **NEW** | `ChatModel` type, `chatModels`, `DEFAULT_CHAT_MODEL`, `allowedModelIds`, `modelsByProvider`, and a tiny helper such as `resolveModelId(id)`. Initial models: Gemini Flash 3 + MiniMax M2.7. |
| `src/lib/ai/gateway.ts` | **EDIT** | Add `getLanguageModel(modelId: string)` that calls `gateway.languageModel(modelId)`. Change `gatewayProviderOptions` so `gateway: { caching: 'auto' }` is always present, and only `byok.google` is conditional. |
| `src/lib/runner/schemas.ts` | **EDIT** | Add `selectedChatModel: z.string().optional()` to `runnerPayloadSchema`. |
| `app/api/chat/schema.ts` | **EDIT** | Add `selectedChatModel: z.string().optional()` to `postRequestBodySchema`. |
| `app/api/chat/route.ts` | **EDIT** | Validate `selectedChatModel` against `allowedModelIds` when present. Pass it into `runAgent()` payload. |
| `src/lib/runner/run-agent.ts` | **EDIT** | Replace the hardcoded chat model with `payload.selectedChatModel`, resolved defensively through the shared helper before `streamText()`. Keep telemetry/finalization using the resolved model. |
| `src/lib/runner/thread-queue.ts` | **EDIT** | Persist `selectedChatModel` in queued JSON payloads and hydrate it when draining. |
| `src/lib/runner/drain-and-continue.ts` | **EDIT** | Treat a model change as a batch boundary. Requeue remaining messages with their preserved `selectedChatModel`, and replay the next run with that model. |
| `next.config.ts` | **EDIT** | Add `models.dev` to `images.remotePatterns`. |

### Frontend

| File | Action | What |
|---|---|---|
| `src/components/ai-elements/model-selector.tsx` | **NEW** | Copy the chatbot's model-selector primitives. |
| `src/components/chat/chat-composer.tsx` | **EDIT** | Add `selectedModelId` + `onModelChange` props. Embed `ModelSelectorCompact` in the toolbar. Add the `setCookie()` helper here. |
| `src/components/chat/chat-welcome.tsx` | **EDIT** | Thread the model props through to the shared `ChatComposer`. |
| `src/components/chat/chat-panel.tsx` | **EDIT** | Add `initialChatModel` prop. Add `useState(initialChatModel)` + `useRef` for closure stability. In `prepareSendMessagesRequest`, add `selectedChatModel: currentModelIdRef.current`. Pass selector props to both `ChatComposer` and `ChatWelcome`. |
| `app/(dashboard)/chat/page.tsx` | **EDIT** | Read the `chat-model` cookie server-side and pass `initialChatModel` to `ChatDraftPage`. |
| `app/(dashboard)/chat/chat-draft-page.tsx` | **EDIT** | Pass `initialChatModel` into `ChatPanel`. |
| `app/(dashboard)/chat/[threadId]/page.tsx` | **EDIT** | Read the `chat-model` cookie server-side and pass `initialChatModel` into `ChatThreadPageClient`. |
| `app/(dashboard)/chat/[threadId]/chat-thread-page-client.tsx` | **EDIT** | Pass `initialChatModel` into `ChatPanel`. |

### Tests to Add / Update

| File | Action | What |
|---|---|---|
| `src/components/chat/chat-composer.test.tsx` | **EDIT** | Cover the model selector UI, cookie write, and selected model display. |
| `src/components/chat/chat-panel.test.tsx` | **EDIT** | Cover `initialChatModel`, request body injection, and ref-based model stability. |
| `src/lib/ai/__tests__/chat-route.test.ts` | **EDIT** | Cover `selectedChatModel` pass-through and 400 on invalid model ID. |
| `src/lib/runner/__tests__/schemas.test.ts` | **EDIT** | Cover the new optional payload field. |
| `src/lib/runner/__tests__/run-agent.test.ts` | **EDIT** | Cover resolved-model usage and fallback behavior. |
| `src/lib/runner/__tests__/serialization.test.ts` | **EDIT** | Cover queue persistence of `selectedChatModel`. |
| `src/lib/runner/__tests__/thread-queue.test.ts` | **EDIT** | Cover enqueue/drain of `selectedChatModel`. |
| `src/lib/runner/__tests__/drain-and-continue.test.ts` | **EDIT** | Cover batch-splitting on model change. |

## Architecture Summary

```
User picks model in UI
  → setCookie("chat-model", id) + setState
  → Transport adds selectedChatModel to request body
  → API route validates against allowedModelIds
  → Passes selectedChatModel into RunnerPayload
  → If thread is busy, queue payload persists selectedChatModel
  → drain-and-continue replays queued messages and stops batching on model changes
  → run-agent.ts resolves model ID + calls getLanguageModel(modelId)
  → gatewayProviderOptions always includes caching: 'auto'
```

## How to Verify

1. Open `/chat`, verify the model selector appears in the shared chat composer toolbar.
2. Select MiniMax M2.7, send a message, confirm the main run uses MiniMax (Langfuse trace or gateway logs).
3. Refresh page, confirm the cookie restores the last selected model.
4. Open a new thread, confirm the same cookie value is used there too.
5. Start a long-running response, send a second message with a different selected model, and confirm the queued follow-up preserves that model instead of falling back to Gemini.
6. Queue two plain chat messages with different selected models and confirm they do **not** batch into a single follow-up run.
7. Send with default Gemini Flash 3 and confirm existing behavior still works.
8. Try an invalid model ID via curl and confirm the route returns 400.

## Reference Code

The chatbot repo at `/Users/sethlim/Documents/chatbot` still provides the source pattern. Key files:

- `lib/ai/models.ts` — model list pattern
- `lib/ai/providers.ts` — `getLanguageModel()` pattern
- `components/ai-elements/model-selector.tsx` — UI primitive library
- `components/multimodal-input.tsx:464-534` — `ModelSelectorCompact`
- `components/chat.tsx:73-132` — state + transport pattern
- `app/(chat)/api/chat/schema.ts` — schema pattern
- `app/(chat)/api/chat/route.ts:65-157` — validation + usage pattern
- `app/(chat)/page.tsx` — cookie reading pattern

Sunder-specific implementation details that differ from chatbot:

- The live UI surface is `ChatPanel` + `ChatComposer`, not `src/components/analyst/chat-input.tsx`.
- The selected model must survive Sunder's DB-backed thread queue.
- Queue batching must split on model changes.
- Subagent model propagation is explicitly out of scope for this PR.
