# Gemini Prompt Caching Spike Results

> **Run date:** 2026-03-24 (Asia/Singapore) / 2026-03-23T16:37Z
> **Model tested:** `google/gemini-3-flash`
> **Invocation path:** `streamText()` via Vercel AI Gateway + Gemini BYOK
> **Repro script:** `scripts/test-gemini-caching.ts`

## Questions

1. Does Gemini implicit caching work automatically in Sunder's current runtime path?
2. What usage fields does AI SDK return when cache hits happen?
3. Is explicit `CachedContent` setup required?
4. Does `system-reminder` as a user message still work with a cached prefix?

## Method

- Built a stable system prompt large enough to cross Gemini's cache eligibility threshold.
- Kept one dummy tool definition registered so the prompt prefix resembled the production runner shape.
- Ran three sequential `streamText()` calls with the same stable prefix and growing conversation history.
- Ran a fourth call that injected `<system-reminder>...</system-reminder>` as a user message.
- Logged `usage`, `totalUsage`, and step-level usage for each call.

## Raw Results

| Turn | Response | inputTokens | cachedInputTokens | cacheReadTokens | raw.cachedContentTokenCount |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | `READY` | 3363 | 0 | 0 | n/a |
| 2 | `STILLREADY` | 3371 | 0 | 0 | n/a |
| 3 | `CACHED` | 3388 | 2019 | 2019 | 2019 |
| Reminder turn | `SETH` | 3446 | 2030 | 2030 | 2030 |

## Findings

### 1. Implicit caching works in the current stack

Yes. On the third request, AI SDK reported:

- `usage.cachedInputTokens = 2019`
- `usage.inputTokenDetails.cacheReadTokens = 2019`
- `usage.raw.cachedContentTokenCount = 2019`

The reminder test also showed a cache read (`2030` cached input tokens), so the production-style prefix is eligible for reuse without any explicit cache object creation.

### 2. The useful metrics are already exposed by AI SDK

The current runtime can observe cache behavior from standard AI SDK usage objects:

- `usage.cachedInputTokens`
- `usage.inputTokenDetails.cacheReadTokens`
- `totalUsage.cachedInputTokens`
- `totalUsage.inputTokenDetails.cacheReadTokens`
- `usage.raw.cachedContentTokenCount` (provider raw field)

This is enough to build operational cache-hit monitoring later without changing providers.

### 3. Explicit `CachedContent` setup is not required for baseline prefix reuse

For `google/gemini-3-flash` through the Vercel AI Gateway, repeated requests with a stable prefix produced cache reads automatically. No explicit cache creation API was needed for this baseline path.

### 4. `system-reminder` as a user message works

The reminder turn returned `SETH`, proving the model correctly read the injected reminder payload even though it lived in the messages array instead of the system string. That same request still reported cached input tokens, so moving the reminder out of the system prompt does not block cache reuse.

## Caveats

- Turn 2 still showed `0` cached input tokens even though the system prompt and first user message were repeated. Cache reads started on turn 3 in this spike. The likely explanation is that Gemini only reused the longer repeated prefix once enough shared conversation history existed, but that should be treated as an observation, not a confirmed provider guarantee.
- This spike confirms cache reads exist. It does **not** prove the long-run `95%+` hit-rate target from the PR goal. That needs production trace monitoring over real conversations.

## Conclusion

- **Implicit caching:** confirmed
- **Needed metrics:** already available in AI SDK usage objects
- **Explicit cache objects:** not needed for the current path
- **System-reminder as message:** confirmed compatible with cached-prefix reuse
