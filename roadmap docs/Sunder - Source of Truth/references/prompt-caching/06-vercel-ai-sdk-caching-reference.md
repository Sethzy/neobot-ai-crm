# Vercel AI SDK — Caching Reference

- **Source:** Vercel AI SDK Documentation (ai-sdk.dev)
- **URLs:**
  - Response caching: https://ai-sdk.dev/docs/advanced/caching
  - Anthropic provider: https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
  - Google provider: https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai

---

## Two Distinct Caching Concepts

1. **Response caching** — caching the LLM output so identical requests return instantly from a KV store (your own cache layer).
2. **Provider-level prompt caching** — using provider APIs (Anthropic, Google, OpenAI) to cache the prompt prefix computation on the provider side.

---

## Provider-Level Prompt Caching (Anthropic via AI SDK)

Use `providerOptions` on messages, message parts, and tools to set cache control breakpoints.

### Message-Level Cache Control

```typescript
const result = await generateText({
  model: anthropic('claude-sonnet-4-5'),
  messages: [
    {
      role: 'system',
      content: 'Cached system message',
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    },
    { role: 'user', content: 'User prompt' },
  ],
});
```

### Tool-Level Cache Control

```typescript
const result = await generateText({
  model: anthropic('claude-haiku-4-5'),
  tools: {
    cityAttractions: tool({
      inputSchema: z.object({ city: z.string() }),
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    }),
  },
  messages: [{ role: 'user', content: 'User prompt' }],
});
```

### Extended TTL (1 Hour)

```typescript
providerOptions: {
  anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } },
}
```

### Reading Cache Metrics

Cache token counts are returned in `providerMetadata.anthropic`:
- `cacheCreationInputTokens` — tokens written to cache
- `cacheReadInputTokens` — tokens read from cache

### Important Caveat

`useChat` and other UI hooks do NOT support `providerOptions`. You must use `convertToModelMessages()` before passing messages to `generateText` or `streamText` in your API route.

---

## Provider-Level Prompt Caching (Google via AI SDK)

### Implicit Caching (Gemini 2.5+)

Automatic — no setup required. 75% token discount.

```typescript
const { text } = await generateText({
  model: google('gemini-2.5-pro'),
  prompt: `${baseContext}\n\nYour query here...`,
});
```

### Explicit Caching

```typescript
providerOptions: {
  google: {
    cachedContent: cache.name, // Format: "cachedContents/{id}"
  },
}
```

---

## Response Caching (Your Own Cache Layer)

### Language Model Middleware (Recommended)

Uses `LanguageModelV3Middleware` to intercept both `generateText` and `streamText` calls. Caches full response objects in a KV store.

```typescript
import { Redis } from '@upstash/redis';
import {
  type LanguageModelV3Middleware,
  type LanguageModelV3StreamPart,
  simulateReadableStream,
} from 'ai';

export const cacheMiddleware: LanguageModelV3Middleware = {
  wrapGenerate: async ({ doGenerate, params }) => {
    const cacheKey = JSON.stringify(params);
    const cached = await redis.get(cacheKey);
    if (cached !== null) return cached;
    const result = await doGenerate();
    redis.set(cacheKey, result);
    return result;
  },
  // + wrapStream with TransformStream to capture chunks
};
```

---

## Best Practices for Sunder

1. Place `providerOptions.anthropic.cacheControl` on system messages and tool definitions.
2. Place breakpoints on the last block whose prefix is identical across requests.
3. For multi-turn conversations, Anthropic's automatic caching mode moves the cache point forward.
4. Google Gemini 2.5+ does implicit caching — no action needed.
5. Maximum 4 cache breakpoints per Anthropic request.
6. The 20-block lookback window: if conversation grows >20 blocks between turns, add intermediate breakpoints.
