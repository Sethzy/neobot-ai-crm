---
title: "Agent Tool Steps No Final Response"
type: issue
status: resolved
updated: "2026-03-05"
---

# Agent Tool Steps No Final Response

## Status

**Resolved** - v5 fix implemented 2026-03-05

## Problem

When an agent chat reaches its maximum step limit (15 steps), the agent stops without providing a final text response. Instead of summarizing findings and answering the user's question, the agent abruptly ends after the last tool call.

**User Experience:**
- User asks: "What's the best fitness plan?"
- Agent makes 15 web searches
- Agent stops with "Done in 15 steps"
- User sees search results but NO summary or answer

**Expected Behavior:**
- Agent should provide a text summary answering the user's question
- Even after hitting the step limit, the user should get a helpful response

## Root Cause

This is caused by **Gemini's AFC (Automatic Function Calling) Persistence Bug** - a severe bug where Gemini attempts tool calls based on conversation history patterns, ignoring explicit API parameters.

### The AFC Bug Explained

When conversation history contains prior function calls, Gemini's AFC mechanism "remembers" it's in a tool-using context and attempts tool calls regardless of:

1. `functionCallingConfig.mode: 'NONE'` being set
2. `activeTools: []` being set
3. **No tools being defined at all**

This third point was the critical discovery - Gemini will attempt tool calls even when the `tools` parameter is completely absent, as long as the conversation history contains tool-related message parts.

### Evidence

**Initial observation:**
```
[Agent Step] {
  finishReason: 'tool-calls',  // Gemini ignores mode: NONE
  hasText: false,
  toolCallsCount: 1
}
```

**v4 debugging revealed deeper issue:**
```
[Summary Call] onFinish {
  textLength: 0,           // No text generated
  finishReason: 'tool-calls'  // Even with NO tools defined!
}
[Summary Call] Usage {
  outputTokens: 89,
  textTokens: 61,  // Tokens generated but not as text
}
```

The summary call had NO tools defined, yet Gemini still finished with `finishReason: 'tool-calls'`. The model generated 61 text tokens but they weren't captured as text output.

## Solution Architecture

The fix uses a **two-part approach**:

### Part 1: Detect Step Limit Hit

After the main agent stream completes, check if we hit the step limit without generating text:

```typescript
const steps = await result.steps;
const finalStep = steps[steps.length - 1];
const hitStepLimit = steps.length >= MAX_AGENT_STEPS;
const finalStepHasToolCalls = (finalStep?.toolCalls?.length ?? 0) > 0;
const finalStepHasNoMeaningfulText = !finalStep?.text?.trim();

if (hitStepLimit && finalStepHasToolCalls && finalStepHasNoMeaningfulText) {
  // Make follow-up summary call
}
```

### Part 2: Strip Tool Parts for Summary Call

Remove ALL tool-related content from messages before sending to the summary call. This breaks Gemini's AFC pattern-matching:

```typescript
function stripToolPartsForSummary(messages: ModelMessage[]): ModelMessage[] {
  return messages
    // Remove 'tool' role messages entirely (tool results)
    .filter(msg => msg.role !== 'tool')
    // For assistant messages, remove tool-call parts
    .map(msg => {
      if (msg.role !== 'assistant') return msg;
      const filteredContent = Array.isArray(msg.content)
        ? msg.content.filter((part: { type: string }) =>
            part.type !== 'tool-call' && part.type !== 'tool-invocation'
          )
        : msg.content;
      return { ...msg, content: filteredContent };
    })
    // Remove messages that ended up empty
    .filter(msg => Array.isArray(msg.content) ? msg.content.length > 0 : true);
}
```

### Part 3: Proper Stream Chaining

Use Vercel AI SDK's stream chaining to ensure the summary appears in the same message:

```typescript
// Main stream: don't send finish event yet
writer.merge(result.toUIMessageStream({ sendFinish: false }));

// ... check conditions and make summary call ...

// Summary stream: don't send new start, continue existing message
writer.merge(summaryResult.toUIMessageStream({ sendStart: false }));
```

## Complete Implementation

Located in `/app/api/chat/route.ts`:

```typescript
// Main agent stream
const result = streamText({
  model: getTracedGoogleModel(modelId, { ... }),
  tools,
  stopWhen: stepCountIs(MAX_AGENT_STEPS),
  // ... other config
});

// Don't send finish yet - we might need to add a summary
writer.merge(result.toUIMessageStream({ sendFinish: false }));

const response = await result.response;
const steps = await result.steps;
const finalStep = steps[steps.length - 1];
const hitStepLimit = steps.length >= MAX_AGENT_STEPS;
const finalStepHasToolCalls = (finalStep?.toolCalls?.length ?? 0) > 0;
const finalStepHasNoMeaningfulText = !finalStep?.text?.trim();

if (hitStepLimit && finalStepHasToolCalls && finalStepHasNoMeaningfulText) {
  // Transform and strip tool parts
  const allMessages = [...transformedMessages, ...response.messages];
  const transformedForLLM = transformWebSearchResultsForLLM(allMessages);
  const summaryInputMessages = stripToolPartsForSummary(transformedForLLM);

  const summaryResult = streamText({
    model: getTracedGoogleModel(modelId, { ... }),
    system: `You are Atlas. Based on the conversation history above,
             provide a helpful summary that answers the user's original question.`,
    messages: summaryInputMessages,
    // NO TOOLS - and no tool-related content in messages
  });

  // Continue the existing message stream
  writer.merge(summaryResult.toUIMessageStream({ sendStart: false }));
  await summaryResult.response;
}
```

## Failed Approaches (v1-v4)

### v1: Manual Counter in onStepFinish

```typescript
let lastStepNumber = 0;
onStepFinish: ({ text, finishReason }) => {
  lastStepNumber++;
  if (lastStepNumber >= MAX_AGENT_STEPS && finishReason === 'tool-calls' && !text) {
    hitStepLimitWithToolCalls = true;
  }
},
```

**Why it failed:**
- Manual counter could drift from SDK's internal step count
- `onStepFinish` callback doesn't receive `stepNumber`
- `!text` too strict - fails on whitespace

### v2: Post-Stream Summary Call

```typescript
writer.merge(result.toUIMessageStream());  // Sends finish event

if (hitStepLimit) {
  const summaryResult = streamText({ ... });
  writer.merge(summaryResult.toUIMessageStream());  // Client already stopped!
}
```

**Why it failed:**
- Main stream sent "finish" event
- Client stopped listening before summary could be sent
- Summary was generated but never displayed

### v3: prepareStep with activeTools: []

```typescript
prepareStep: ({ stepNumber }) => {
  if (stepNumber >= MAX_AGENT_STEPS - 1) {
    return { activeTools: [] };  // Remove all tools
  }
  return {};
},
```

**Why it failed:**
- Gemini ignores `activeTools: []` just like it ignores `toolChoice: 'none'`
- AFC bug affects all tool-limiting parameters
- Final step still had `finishReason: 'tool-calls'`

### v4: Proper Stream Chaining

```typescript
writer.merge(result.toUIMessageStream({ sendFinish: false }));
// ... summary call with NO tools ...
writer.merge(summaryResult.toUIMessageStream({ sendStart: false }));
```

**Why it failed:**
- Stream chaining worked correctly
- BUT summary call still had `finishReason: 'tool-calls'` with `textLength: 0`
- Discovered that AFC triggers even without tools defined
- Root cause: conversation history contained tool-related message parts

### v5: Strip Tool Parts (SUCCESS)

Added `stripToolPartsForSummary()` to remove all tool-related content from messages before the summary call. This breaks AFC pattern-matching.

**Evidence of success:**
```
[Summary Call] onFinish {
  textLength: 3578,           // Text generated!
  textPreview: 'Based on ten systematic searches...',
  finishReason: 'stop'        // Proper finish!
}
```

## Debug Steps

If the bug recurs:

1. Check server logs for:
   ```
   [Agent Step Limit] {
     stepsCount: X,
     maxSteps: 15,
     willMakeSummaryCall: true/false
   }
   ```

2. If `willMakeSummaryCall: true` but no text appears:
   - Add `onFinish` callback to summary call
   - Check `finishReason` - should be `'stop'` not `'tool-calls'`
   - Check `textLength` - should be > 0

3. If `finishReason: 'tool-calls'`:
   - Tool-related parts are leaking into summary input
   - Check `stripToolPartsForSummary()` is being called
   - Log `summaryInputMessages` to inspect content

## Files Involved

| File | Role |
|------|------|
| `/app/api/chat/route.ts` | Main implementation |
| `/lib/ai/tools.ts` | Tool definitions |
| `/docs/engineering/GEMINI_API_GOTCHA_BUGS.md` | Related bug documentation |

## Key Learnings

1. **AFC bug is more severe than documented** - Gemini attempts tool calls based on conversation history patterns, not just when tools are defined

2. **Message content matters** - The presence of `tool-call`, `tool-invocation`, or `tool` role messages triggers AFC, even in a separate API call with no tools

3. **Stream chaining is necessary** - Must use `{ sendFinish: false }` and `{ sendStart: false }` for multi-stream responses

4. **Debug with onFinish** - The `onFinish` callback reveals `finishReason` which is critical for diagnosing AFC issues

## References

- [googleapis/python-genai#1818](https://github.com/googleapis/python-genai/issues/1818) - AFC persistence bug report
- [vercel/ai#5026](https://github.com/vercel/ai/issues/5026) - Vercel AI SDK maintainer workaround
- [langchain-ai/langchain-google#1055](https://github.com/langchain-ai/langchain-google/issues/1055) - LangChain workaround
- [GEMINI_API_GOTCHA_BUGS.md](../engineering/GEMINI_API_GOTCHA_BUGS.md) - Full technical documentation
