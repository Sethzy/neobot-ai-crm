# Sandbox Credential Brokering

**Date:** 2026-04-02
**Status:** Implemented

## Problem

Sandbox scripts need to call external APIs (Brave Search, Exa) for bulk enrichment. The initial approach injected API keys as environment variables inside the sandbox VM. This is insecure — scripts can read keys via `echo $BRAVE_SEARCH_API_KEY` — and error-prone — the agent guesses wrong variable names.

## Solution

Use Vercel Sandbox's native **credential brokering** via `networkPolicy`. API keys never enter the sandbox. Instead, the sandbox infrastructure intercepts outbound HTTPS requests to approved domains and injects auth headers at the network layer.

## How it works

```
Agent writes bash script: curl -s "https://api.search.brave.com/res/v1/web/search?q=hello"
                                    │
                                    ▼
                        Sandbox network layer intercepts
                        request to api.search.brave.com
                                    │
                                    ▼
                        Injects header: X-Subscription-Token: <key>
                                    │
                                    ▼
                        Request reaches Brave API with auth ✓
```

The agent's script has zero knowledge of API keys. It just calls the URL.

## Configuration

```typescript
// In create-lazy-bash-tool.ts — sandbox creation
networkPolicy: {
  allow: {
    "api.search.brave.com": [{
      transform: [{ headers: { "X-Subscription-Token": env.BRAVE_SEARCH_API_KEY } }],
    }],
    "api.exa.ai": [{
      transform: [{ headers: { "x-api-key": env.EXA_API_KEY } }],
    }],
    "*": [],  // allow all other egress without header injection
  },
}
```

## System prompt addition

Added to the bash tool's `extraInstructions` (not the main system prompt):

> API credentials are injected automatically — do NOT pass auth headers or look for API key env vars:
> - Brave Search: `curl -s "https://api.search.brave.com/res/v1/web/search?q=your+query"`
> - Exa: `curl -s -X POST "https://api.exa.ai/contents" -H "Content-Type: application/json" -d '{"urls":["..."]}'`

## Security properties

| Property | Before (env vars) | After (credential brokering) |
|---|---|---|
| Keys in sandbox env | Yes | No |
| Script can read keys | Yes (`echo $VAR`) | No |
| Script can log keys | Yes | No |
| Agent needs key name | Yes (guesses wrong) | No |
| Egress restricted | No | No (allow-all with `"*": []`) |

## Files changed

- `src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts` — replaced `env` injection with `networkPolicy`, added API guidance to `extraInstructions`

## References

- [Vercel Sandbox credential brokering docs](https://vercel.com/docs/vercel-sandbox/concepts/firewall#credentials-brokering)
- [Vercel blog: Security boundaries in agentic architectures](https://vercel.com/blog/security-boundaries-in-agentic-architectures)
- NanoClaw reference: stdin-based secret injection + bash unset hooks (more complex, same goal)

## Verification

1. Restart dev server
2. Prompt: "Use the sandbox to run `curl -s 'https://api.search.brave.com/res/v1/web/search?q=hello'` and show the results"
3. Should return search results (auth injected transparently)
4. `echo $BRAVE_SEARCH_API_KEY` should return empty
