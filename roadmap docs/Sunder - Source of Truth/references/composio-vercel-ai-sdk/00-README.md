# Composio + Vercel AI SDK Reference

Reference documentation for integrating Composio with Vercel AI SDK in the Sunder project (PR 25: Composio connections + OAuth).

## Contents

| File | Source | Description |
|------|--------|-------------|
| `01-docs-providers-vercel.md` | https://docs.composio.dev/docs/providers/vercel | Official Composio Vercel provider docs |
| `02-docs-toolkits-vercel.md` | https://docs.composio.dev/toolkits/vercel | Vercel toolkit capabilities reference |
| `03-composio-dev-framework-ai-sdk.md` | https://composio.dev/toolkits/vercel/framework/ai-sdk | Composio + Vercel AI SDK framework integration guide |
| `04-npm-composio-vercel.md` | https://www.npmjs.com/package/@composio/vercel | npm package README (from cloned repo) |
| `05-source-vercel-provider.md` | Cloned repo: `ts/packages/providers/vercel/` | Verbatim VercelProvider source code + tests |
| `06-source-examples.md` | Cloned repo: `ts/examples/vercel/` + `ts/examples/connected-accounts/` | All official examples |
| `07-source-core-composio.md` | Cloned repo: `ts/packages/core/src/composio.ts` | Core SDK class + create() method |
| `08-deepwiki-analysis.md` | DeepWiki AI analysis of ComposioHQ/composio | Deep analysis of VercelProvider, Sessions, Meta-tools |
| `09-integration-recommendation.md` | Our analysis | How Sunder should integrate Composio |

## Key Findings

1. **Two integration patterns**: Direct (`composio.tools.get()`) vs Session (`composio.create()`)
2. **VercelProvider** wraps Composio tools for Vercel AI SDK's `streamText()`/`generateText()` with Zod schemas + execute functions
3. **5 meta-tools** in session mode: SEARCH_TOOLS, MANAGE_CONNECTIONS, MULTI_EXECUTE_TOOL, REMOTE_WORKBENCH, REMOTE_BASH
4. **OAuth flow**: `connectedAccounts.initiate()` or `connectedAccounts.link()` → redirectUrl → `waitForConnection()`
5. **Peer deps**: `@composio/core@0.6.4` + `ai@^5.0.0 || ^6.0.0` (we use AI SDK v6)

## Cloned Repo Location

`/Users/sethlim/Documents/composio` (ComposioHQ/composio)
