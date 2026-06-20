---
title: "Gemini API Gotcha Bugs"
type: spec
area: engineering
updated: "2026-03-05"
---

# Gemini API Gotcha Bugs

This document catalogs known Gemini API bugs that affect production applications and their workarounds.

---

## 1. Control Token Leak (`<ctrl46>` and friends)

### Problem

Gemini models occasionally leak internal control tokens into user-facing output. These tokens (`<ctrl1>` to `<ctrl3360>`) are used internally for search/grounding operations but should never appear in responses.

**Example output with leaked tokens:**
```
The search results indicate<ctrl46> that the market is growing<ctrl46> rapidly.
```

### Root Cause

- Gemini's tokenizer uses `<ctrl1>` to `<ctrl3360>` for internal routing
- `<ctrl46>` specifically relates to the search/grounding tool and acts as a delimiter for fan-out queries
- The model occasionally fails to filter these before output
- **No official fix from Google** - marked P2, no timeline

### Affected Models

- Gemini 2.5 Flash (including lite variant)
- Gemini 3 Flash

### Solution: Client-Side Filtering

Since there's no server-side fix, we implement client-side filtering.

**File:** `/lib/ai/sanitize.ts`

```typescript
/**
 * Regex to match Gemini internal control tokens.
 */
const GEMINI_CTRL_TOKEN_REGEX = /<ctrl\d+>/gi;

/**
 * Remove Gemini control tokens from text output.
 */
export function sanitizeGeminiOutput(text: string): string {
  return text.replace(GEMINI_CTRL_TOKEN_REGEX, '');
}

/**
 * Create a stream transform that filters out Gemini control tokens.
 * For use with AI SDK's experimental_transform in streamText().
 */
export function createCtrlTokenFilter() {
  return (): TransformStream<any, any> => {
    return new TransformStream({
      transform(chunk: any, controller: TransformStreamDefaultController) {
        if (chunk.type === 'text-delta' && chunk.textDelta) {
          const filtered = chunk.textDelta.replace(GEMINI_CTRL_TOKEN_REGEX, '');
          if (filtered) {
            controller.enqueue({ ...chunk, textDelta: filtered });
          }
        } else {
          controller.enqueue(chunk);
        }
      }
    });
  };
}
```

### Usage

**For streaming endpoints (`streamText`):**
```typescript
import { createCtrlTokenFilter } from '@/lib/ai/sanitize';

const result = streamText({
  model: getTracedGoogleModel('gemini-3-flash-preview', { ... }),
  system: systemPrompt,
  messages: modelMessages,
  experimental_transform: createCtrlTokenFilter(),
  // ...
});
```

**For non-streaming endpoints (`generateText`):**
```typescript
import { sanitizeGeminiOutput } from '@/lib/ai/sanitize';

const { text: rawText } = await generateText({ ... });
const cleanText = sanitizeGeminiOutput(rawText);
```

### Files Modified

| File | Type | Change |
|------|------|--------|
| `/lib/ai/sanitize.ts` | New | Utility functions |
| `/app/api/chat/route.ts` | Streaming | Added `experimental_transform` |
| `/app/api/note-chat/route.ts` | Streaming | Added `experimental_transform` |
| `/app/api/note-map/route.ts` | Streaming | Added `experimental_transform` |
| `/app/api/map/route.ts` | Non-streaming | Wrapped result with `sanitizeGeminiOutput()` |
| `/lib/summarization.ts` | Non-streaming | Wrapped result with `sanitizeGeminiOutput()` |
| `/lib/ai/titleGeneration.ts` | Non-streaming | Wrapped result with `sanitizeGeminiOutput()` |

### Verification

1. Run the app and trigger tool-calling conversations (searches, etc.)
2. Check for `<ctrl` strings in outputs
3. Query database for affected records:
   ```sql
   SELECT id, messages::text FROM chats
   WHERE messages::text LIKE '%<ctrl%'
   LIMIT 10;
   ```

### References

- [GitHub #4486](https://github.com/google-gemini/gemini-cli/issues/4486) - Primary bug report
- [LinkedIn research](https://www.linkedin.com/posts/seoguy_note-to-self-geminis-control-tokens-range-activity-7397922352673521664-6BjL) - ctrl46 = search tool
- [AI SDK streamText docs](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) - experimental_transform

---

## 2. AFC Persistence Bug (Final Step No Text Response)

### Problem

When an agent chat reaches its maximum step limit, Gemini stops without providing a final text response. Instead of summarizing findings and answering the user's question, the agent abruptly ends after the last tool call.

**User Experience Issue:**
- User asks: "Summarize this article"
- Agent reads/searches for 10 steps
- Agent stops without providing the summary
- User sees tool results but no helpful answer

### Root Cause: Automatic Function Calling Persistence

This is a **known Google Gemini bug** where the model ignores `functionCallingConfig.mode: 'NONE'` when conversation history contains prior function calls.

**Evidence from Logs:**
```
[prepareStep] Final step - setting toolChoice: none
[Google API Request] {
  toolConfig: { functionCallingConfig: { mode: 'NONE' } },  // Sent correctly
}
[Agent Step] {
  finishReason: 'tool-calls',  // But Gemini IGNORES it!
  hasText: false,
  toolCallsCount: 1
}
```

**Technical Explanation:**
1. **AFC Persistence**: When conversation history contains prior function calls, Gemini's AFC mechanism "remembers" it's in a tool-using context
2. **Context Override**: Gemini pattern-matches from conversation context and attempts tool calls regardless of `mode: 'NONE'`
3. **API Parameter Ignored**: The `functionCallingConfig` setting is overridden by conversation context signals

### Failed Approaches

| Approach | Why It Failed |
|----------|---------------|
| `toolChoice: 'none'` | Gemini ignores `mode: 'NONE'` (AFC bug) |
| `activeTools: []` | Gemini ignores it (same AFC bug) |
| Follow-up call (v2-v4) | Stream chaining worked, but summary still had `finishReason: 'tool-calls'` |

**Critical Discovery**: Gemini's AFC bug is MORE severe than expected. Even when NO tools are defined, Gemini attempts tool calls if conversation history contains tool-related parts (`tool-call`, `tool-invocation`, `tool` role messages).

### Solution: Strip Tool Parts (v5)

The key insight: Remove all tool-related parts from messages before sending to the summary call. This breaks Gemini's AFC pattern-matching.

```typescript
function stripToolPartsForSummary(messages: ModelMessage[]): ModelMessage[] {
  return messages
    .filter(msg => msg.role !== 'tool')
    .map(msg => {
      if (msg.role !== 'assistant') return msg;
      const filteredContent = Array.isArray(msg.content)
        ? msg.content.filter((part: { type: string }) =>
            part.type !== 'tool-call' && part.type !== 'tool-invocation'
          )
        : msg.content;
      return { ...msg, content: filteredContent };
    })
    .filter(msg => Array.isArray(msg.content) ? msg.content.length > 0 : true);
}
```

**Implementation in `/app/api/chat/route.ts` (v5 - 2026-03-05):**

```typescript
// Main stream: don't send finish yet
writer.merge(result.toUIMessageStream({ sendFinish: false }));

if (hitStepLimit && finalStepHasToolCalls && finalStepHasNoMeaningfulText) {
  // Strip tool parts to prevent AFC bug
  const summaryInputMessages = stripToolPartsForSummary(transformedForLLM);

  const summaryResult = streamText({
    model: ...,
    messages: summaryInputMessages,
    // NO TOOLS
  });

  writer.merge(summaryResult.toUIMessageStream({ sendStart: false }));
}
```

### Status: Fixed (v5)

**Evidence:**
```
[Summary Call] onFinish {
  textLength: 3578,  ← Text generated!
  finishReason: 'stop'  ← Proper finish, not 'tool-calls'
}
```

**Debug:** Check server logs for `[Agent Step Limit]` with `willMakeSummaryCall: true`

### References

- [googleapis/python-genai#1818](https://github.com/googleapis/python-genai/issues/1818) - AFC persistence bug
- [vercel/ai#5026](https://github.com/vercel/ai/issues/5026) - Vercel AI SDK maintainer workaround
- [langchain-ai/langchain-google#1055](https://github.com/langchain-ai/langchain-google/issues/1055) - LangChain workaround

---

## Future Considerations

- **Monitor Google Fixes**: Both bugs are known to Google. If fixed server-side, our workarounds become unnecessary overhead.
- **Test After Model Updates**: New model versions may resolve or introduce new variants of these bugs.
- **Centralize Sanitization**: Consider adding sanitization at a lower level (e.g., model wrapper) to catch all outputs.
