# Review Handover: PR 61 — Composio getRawComposioTools Limit Fix

**Date:** 2026-03-30
**For:** Reviewer (independent review, no dependencies on PR 60 or 62)
**Estimated review time:** 15-20 minutes

---

## What This PR Does

Fixes a live bug: `getRawComposioTools()` from the Composio SDK defaults to returning 20 results. Toolkits with >20 tools get silently truncated. Google Drive has 89 tools, Docs 35, Sheets 48 — all truncated to 20. This breaks tool counts displayed to users, activation validation (can't activate tool #21 if we don't know it exists), and capability discovery.

Fix: add `limit: 200` to every call site.

## Files to Review

**Tasklist:** `docs/product/tasks/2026-03-30-pr61-composio-limit-fix-tasklist.md`

**5 call sites to fix (read each one):**

| File | Line | Function |
|---|---|---|
| `src/lib/composio/catalog.ts` | ~39 | `searchIntegrations()` |
| `src/lib/composio/catalog.ts` | ~72 | `getToolkitCapabilities()` |
| `src/lib/runner/tools/connections/manage-tools.ts` | ~63 | Tool activation validation |
| `src/lib/runner/tools/connections/get-connection-details.ts` | ~61 | Tool capability discovery |
| `app/api/connections/callback/route.ts` | ~203 | Schema caching on OAuth callback |

## What to Verify

1. **Are these all the call sites?** Run `grep -rn "getRawComposioTools" src/ app/ --include="*.ts"` and confirm there aren't others.
2. **Does the Composio SDK accept `limit` as a parameter?** Check `node_modules/@composio/core` types or the REST API docs at `https://docs.composio.dev`. The reviewer who found this bug confirmed the REST API supports it, but verify the SDK types.
3. **Is 200 the right limit?** Google Drive has 89 tools — the largest toolkit we've seen. 200 gives headroom. But does Composio paginate, or does it just cap? If it paginates, we might need a loop. If it caps, 200 is fine.
4. **Does `searchIntegrations` (catalog.ts:39) have the same issue?** It uses `{ search: keyword }` not `{ toolkits: [...] }`. The truncation might behave differently for search queries vs toolkit listing. Worth checking.
5. **Test coverage:** Are there existing tests that mock `getRawComposioTools`? If so, do they assert exact call args? The fix will break those assertions — tasklist should update them.

## Context Files

- `src/lib/composio/catalog.ts` — full file, 94 lines
- `src/lib/composio/client.ts` — Composio SDK singleton setup
- Design doc Section 8: `docs/plans/2026-03-30-connection-ui-cards-design.md` (prerequisite fixes)

## Not in Scope

This PR doesn't change any UI, tool behavior, or connection flows. It only adds a parameter to existing SDK calls. No new features.
