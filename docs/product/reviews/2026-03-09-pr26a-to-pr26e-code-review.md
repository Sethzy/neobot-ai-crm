/**
 * Consolidated code review for PR26a-PR26e.
 * Reviewed sequentially against each sub-PR's tasklist and commit range.
 */

# PR26a-PR26e Consolidated Code Review

Date: 2026-03-09

Scope:
- PR26a: `078830f2c3e4d39e6bd4c7578a23264d77df3ae2..cd91982b13f1cc4ed07c89d90b44698adb17eb94`
- PR26b: `cd91982b13f1cc4ed07c89d90b44698adb17eb94..0b685e414fb13d040667030068c0f908d54b4998`
- PR26c: `f48ac9729b8ddea3c3fad5351b6c16c3eb4bdccf..ff0ca4bcbad5e14021a19b82813cb4a1cc5d1a54`
- PR26d: `f431081d68dd53d3bf0f5396c2e0a38e536e56cd..7c1e7470191e4c9ceee34a2b807f781b5a91b28e`
- PR26e: `7c1e7470191e4c9ceee34a2b807f781b5a91b28e..a7298941725e7ab44da258c79b90e01760deb356`

Method:
- Reviewed each sub-PR in sequence against its own tasklist under `docs/product/tasks/2026-03-07-pr26*.md`.
- Findings below are scoped to the code as it existed at that sub-PR head.
- Line numbers refer to the sub-PR head revision, not necessarily the current working tree.

## PR26a

Tasklist:
- `docs/product/tasks/2026-03-07-pr26a-connection-schema-tasklist.md`

### Strengths

- The migration, schema, and query-layer changes stay within the intended data-layer scope.
- The route updates are narrow and consistent with the pending-row model introduced in this sub-PR.
- Test coverage for schema and query helpers is substantial and aligned with the tasklist.

### Issues Found

- No blocking findings in scoped review.

### Recommendations

- No required changes before moving to later PR26 work.

### Merge Readiness Assessment

- Ready as scoped.
- Residual risk: later PRs still needed to finish activation-loading, callback enrichment, and prompt wiring. That gap is intentional in the phase split.

## PR26b

Tasklist:
- `docs/product/tasks/2026-03-07-pr26b-composio-helpers-tasklist.md`

### Strengths

- The helper split is clean: OAuth initiation, catalog lookup, and activated-tool loading are isolated into separate modules.
- The activated-tool loader correctly enforces connection-scoped tool prefixes and partial-load resilience.
- The route refactor keeps the existing initiate flow behavior while removing duplicated Composio SDK logic.

### Issues Found

- No blocking findings in scoped review.

### Recommendations

- No required changes before PR26c/26d consumption.

### Merge Readiness Assessment

- Ready as scoped.
- Residual risk: the helper layer still depends on Composio SDK response contracts that are only lightly type-constrained, but nothing in this sub-PR looked incorrect against the tasklist.

## PR26c

Tasklist:
- `docs/product/tasks/2026-03-07-pr26c-readonly-connection-tools-tasklist.md`

### Strengths

- The four read-only tools match the intended surface area and keep the response-envelope convention consistent with the rest of the runner tools.
- Runner and autopilot wiring are deliberately limited to discovery-only connection tooling in this phase.
- The tests cover the main Tasklet-shaped outputs and the connection barrel registration.

### Issues Found

- No blocking findings in scoped review.

### Recommendations

- No required changes before PR26d.

### Merge Readiness Assessment

- Ready as scoped.
- Residual risk: toolkit-wide Composio loading is still intentionally present here and only becomes correct once PR26d swaps in activated per-connection loading.

## PR26d

Tasklist:
- `docs/product/tasks/2026-03-07-pr26d-mutation-connection-tools-tasklist.md`

### Strengths

- The mutation tool surface is complete and the barrel / runner wiring lands in the right places.
- The callback route now enriches `account_identifier` and `tool_count`, which closes a real metadata gap from earlier PRs.
- Activated per-connection loading is correctly moved into both chat runs and autopilot runs.

### Issues Found

#### Critical

1. Failed reauthorization callbacks can delete the real connection row.

Files:
- `app/api/connections/callback/route.ts:103-113`
- `app/api/connections/callback/route.ts:129-139`
- `app/api/connections/callback/route.ts:149-170`
- `app/api/connections/callback/route.ts:227-231`
- `src/lib/runner/tools/connections/reauthorize-connection.ts:76-83`

Why it matters:
- `reauthorize_connection` marks the existing row itself as `status: "pending"`.
- The callback route's `clearPendingConnection()` helper blindly deletes the pending row for a toolkit on invalid callbacks, failed callbacks, ownership failures, inactive-account checks, and generic callback exceptions.
- In the reauthorization path, that "pending row" is not a disposable placeholder. It is the real saved connection. A failed reauth callback therefore removes the local connection entirely.

What needs to change:
- Stop using hard-delete cleanup for reauthorization rows.
- Distinguish between "new pending placeholder row" and "existing connection temporarily marked pending for reauth".
- On reauth failure, restore or preserve the connection row with a non-active status such as `error` or `inactive` instead of deleting it.

#### Important

1. Tool-created OAuth callbacks cannot clear failed pending rows because the callback URL omits the toolkit slug.

Files:
- `src/lib/runner/tools/connections/create-connection.ts:13-20`
- `src/lib/runner/tools/connections/create-connection.ts:91-111`
- `app/api/connections/callback/route.ts:82-118`
- `app/api/connections/callback/route.ts:129-139`

Why it matters:
- Early failure cleanup in the callback route depends on `?toolkit=` before a connected account has been successfully verified.
- The settings UI initiation route appends this query param, but `create_new_connections` does not.
- If OAuth fails before the route can verify the connected account, the pending row is left behind. Later create attempts for the same toolkit then collide with the unique pending-row constraint instead of recovering cleanly.

What needs to change:
- Add `toolkit` to the callback URL generated by `create_new_connections`, or
- change early cleanup to key off a verifiable pending connected-account identifier before returning.

2. Redirect-based reauthorization does not validate that Composio actually returned a reauth URL.

File:
- `src/lib/runner/tools/connections/reauthorize-connection.ts:76-90`

Why it matters:
- This path immediately updates the local row to `status: "pending"` and returns success, but it never checks whether `refreshResult.redirect_url` exists.
- If Composio returns an empty or undefined URL, the user has no way to complete reauth and the connection is stranded in `pending`.

What needs to change:
- Validate `refreshResult.redirect_url` before mutating local state.
- If no redirect URL is returned, keep the existing row in its prior state and surface an explicit error.

#### Minor

1. Multi-integration creation is not failure-isolated.

File:
- `src/lib/runner/tools/connections/create-connection.ts:101-136`

Why it matters:
- The tool performs side effects sequentially inside one loop.
- If integration `N` succeeds and integration `N+1` throws, earlier pending rows and remote auth flows have already been created, but the caller receives only a top-level failure and loses the successful partial results.

What needs to change:
- Return per-integration success/error entries, or
- pre-validate the whole batch before starting side effects.

### Recommendations

- Fix the reauthorization cleanup model first. That is the only issue here that can delete a valid connection.
- After that, align tool-created callback URLs with the cleanup assumptions already used by the callback route.
- Add one regression test that covers failed reauth callbacks on an existing connection row.

### Merge Readiness Assessment

- Not ready as reviewed.
- Blocking work: the reauth cleanup bug should be fixed before merge.

## PR26e

Tasklist:
- `docs/product/tasks/2026-03-07-pr26e-system-prompt-reminder-tasklist.md`

### Strengths

- The connection-scoped skill-file helper, reminder pointer, and prompt language all converge on the same `skills/connections/{connectionId}/SKILL.md` path convention.
- `skills/**` read-only protection in `agent-files.ts` is the right safety hardening.
- The reminder output is materially more useful than the old flat toolkit list.

### Issues Found

#### Important

1. The new connection instructions removed the approval gate for connection mutations.

File:
- `src/lib/ai/system-prompt.ts:70-94`

Why it matters:
- The prompt now says the model "MUST find, create, and activate connections as needed" and says `manage_activated_tools_for_connections` "will prompt the user".
- That is not how the mutation tools implemented in PR26d behave. In v1 they assume approval already happened in chat; they do not block on a UI approval card.
- Without explicit "describe the action and ask first" guidance, the model is now steered toward calling connection mutation tools without prior user consent.

What needs to change:
- Add explicit approval instructions for `create_new_connections`, `manage_activated_tools_for_connections`, `reauthorize_connection`, and `delete_connection`.
- The prompt should match the PR26d v1 semantics: chat approval first, then tool call.

#### Minor

1. One reminder lookup failure can hide all active connections.

File:
- `src/lib/runner/system-reminder.ts:104-137`

Why it matters:
- The `try/catch` wraps both `getAllConnections()` and every per-connection skill-file read.
- If one skill-file download or `Blob.text()` call rejects, the whole reminder falls back to `Active connections: none`.
- That can push the model into unnecessary reconnect flows even though valid active connections still exist.

What needs to change:
- Keep the global fallback only for the connection query itself.
- Treat per-connection skill lookup failures as local misses and still render the rest of the active connection list.

### Recommendations

- Restore explicit approval language in the prompt before shipping this reminder/prompt pair.
- Narrow the reminder error handling so one bad skill lookup does not wipe the full connection summary.

### Merge Readiness Assessment

- Not ready as reviewed.
- Blocking work: prompt approval guidance should be fixed before merge.
