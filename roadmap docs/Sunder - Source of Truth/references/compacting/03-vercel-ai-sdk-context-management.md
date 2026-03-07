# Vercel AI SDK — Context Management & Compaction

**Sources:**
- https://ai-sdk.dev/providers/ai-sdk-providers/anthropic (Anthropic compaction)
- https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling (prepareStep)
- https://ai-sdk.dev/docs/agents/loop-control (agent loop context management)

**Retrieved:** 2026-03-06

---

## Overview

The AI SDK offers two complementary approaches to context management:

1. **Provider-native compaction** (Anthropic `compact_20260112`) — server-side LLM summarization
2. **`prepareStep` callback** — client-side message filtering/compression per agentic step

---

## 1. Anthropic Compaction (`compact_20260112`)

Automatic server-side summarization when token limits are approached. Configured via
`providerOptions.anthropic.contextManagement`.

### Configuration

```ts
import { anthropic, AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import { streamText } from 'ai';

const result = streamText({
  model: anthropic('claude-opus-4-6'),
  messages: conversationHistory,
  providerOptions: {
    anthropic: {
      contextManagement: {
        edits: [
          {
            type: 'compact_20260112',
            trigger: {
              type: 'input_tokens',
              value: 50000 // trigger compaction when input exceeds 50k tokens
            },
            instructions:
              'Summarize the conversation concisely, preserving key decisions and context.',
            pauseAfterCompaction: false
          }
        ]
      }
    } satisfies AnthropicLanguageModelOptions
  }
});
```

### Configuration Options

| Option                | Type     | Description                                              |
|-----------------------|----------|----------------------------------------------------------|
| `type`                | string   | `'compact_20260112'` — the compaction edit type           |
| `trigger.type`        | string   | `'input_tokens'` — trigger condition type                 |
| `trigger.value`       | number   | Token threshold to trigger compaction                     |
| `instructions`        | string   | Custom instructions for how the model should summarize    |
| `pauseAfterCompaction`| boolean  | `true` to inspect summary before continuing               |

### Other Available Edits (Anthropic)

| Edit Type                   | Purpose                                    |
|-----------------------------|--------------------------------------------|
| `clear_tool_uses_20250919`  | Remove old tool use/result pairs            |
| `clear_thinking_20251015`   | Remove old extended thinking blocks         |
| `compact_20260112`          | Summarize earlier context                   |

### Checking Applied Edits

```ts
const metadata = result.providerMetadata?.anthropic?.contextManagement;

if (metadata?.appliedEdits) {
  metadata.appliedEdits.forEach(edit => {
    if (edit.type === 'clear_tool_uses_20250919') {
      console.log(`Cleared ${edit.clearedToolUses} tool uses`);
      console.log(`Freed ${edit.clearedInputTokens} tokens`);
    } else if (edit.type === 'clear_thinking_20251015') {
      console.log(`Cleared ${edit.clearedThinkingTurns} thinking turns`);
      console.log(`Freed ${edit.clearedInputTokens} tokens`);
    } else if (edit.type === 'compact_20260112') {
      console.log('Compaction was applied');
      console.log(`Freed ${edit.clearedInputTokens} tokens`);
    }
  });
}
```

### Detecting Compaction in Streams

```ts
for await (const part of result.fullStream) {
  switch (part.type) {
    case 'text-start': {
      const isCompaction =
        part.providerMetadata?.anthropic?.type === 'compaction';
      if (isCompaction) {
        console.log('[COMPACTION SUMMARY START]');
      }
      break;
    }
    case 'text-delta': {
      process.stdout.write(part.text);
      break;
    }
  }
}
```

### Rendering Compaction Summaries in UI

```tsx
{message.parts.map((part, index) => {
  if (part.type === 'text') {
    const isCompaction =
      (part.providerMetadata?.anthropic as { type?: string } | undefined)
        ?.type === 'compaction';

    if (isCompaction) {
      return (
        <div key={index} className="bg-yellow-100 border-l-4 border-yellow-500 p-2">
          <span className="font-bold">[Compaction Summary]</span>
          <div>{part.text}</div>
        </div>
      );
    }
    return <div key={index}>{part.text}</div>;
  }
})}
```

---

## 2. prepareStep Callback (Client-Side)

For agent loops using `streamText` or `ToolLoopAgent`, the `prepareStep` callback
lets you filter/compress messages before each model call.

### Basic Message Windowing

```ts
prepareStep: async ({ stepNumber, steps, messages }) => {
  // Keep only recent messages when history is long
  if (messages.length > 20) {
    return {
      messages: messages.slice(-10),
    };
  }
  return {};
},
```

### Preserve System Instructions + Recent Context

```ts
import { ToolLoopAgent } from 'ai';

const agent = new ToolLoopAgent({
  model: myModel,
  tools: { /* ... */ },
  prepareStep: async ({ messages }) => {
    if (messages.length > 20) {
      return {
        messages: [
          messages[0],         // Keep system instructions
          ...messages.slice(-10), // Keep last 10 messages
        ],
      };
    }
    return {};
  },
});
```

### Summarize Large Tool Results

```ts
prepareStep: async ({ messages, stepNumber }) => {
  const processedMessages = messages.map(msg => {
    if (msg.role === 'tool' && msg.content.length > 1000) {
      return {
        ...msg,
        content: summarizeToolResult(msg.content),
      };
    }
    return msg;
  });
  return { messages: processedMessages };
},
```

---

## Comparison: Provider Compaction vs. prepareStep

| Aspect              | Anthropic Compaction              | prepareStep                       |
|---------------------|-----------------------------------|-----------------------------------|
| Where it runs       | Server-side (Anthropic)           | Client-side (your code)           |
| Intelligence        | LLM-powered summarization         | Rule-based (you write the logic)  |
| Configuration       | `providerOptions`                 | Callback function                 |
| Provider support    | Anthropic only (currently)        | All providers                     |
| Granularity         | Token-threshold triggered          | Per-step, any condition           |
| Summary quality     | High (LLM does the summarization) | Depends on your implementation    |
| Cost                | Uses model tokens for summary     | No extra LLM cost                 |

---

## Relevance to Sunder

For Sunder's runner engine (`run-agent.ts`), context management options:

1. **Anthropic compaction** — if we switch to Claude models, `compact_20260112` gives
   automatic server-side summarization with no code needed beyond config.
2. **prepareStep windowing** — works with Gemini Flash (current Tier 1 model). Simple
   message-count windowing or tool-result summarization.
3. **Hybrid** — use `prepareStep` for immediate windowing + provider compaction for
   deeper summarization when available.

Current state: Runner uses `maxSteps: 9` and doesn't implement context management yet.
Phase 2+ should consider adding `prepareStep` windowing as conversations grow.
