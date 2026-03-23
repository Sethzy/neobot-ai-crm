<!-- Reference doc for verifying Sunder's proposed Sprites integration patterns against official docs, API docs, and the currently published JS SDK packages. -->

# Sprites SDK Verification

**Date:** 2026-03-23  
**Status:** Verified against the official Sprites docs/API, current public site pricing, the published `@fly/sprites` npm packages, and public reference repos/community posts.  
**Scope note:** As of the local v2 plan updated on 2026-03-23, sandbox/code-gen scope is currently deferred from the active build plan. Treat this as reference material unless that scope is explicitly reinstated.

## Sources Reviewed

- Official docs:
  - [Sprites docs](https://docs.sprites.dev/)
  - [Working with Sprites](https://docs.sprites.dev/working-with-sprites/)
  - [Networking](https://docs.sprites.dev/concepts/networking/)
  - [JavaScript SDK docs](https://docs.sprites.dev/sdks/javascript/)
  - [Sprites API](https://docs.sprites.dev/api/dev-latest/sprites/)
  - [Exec API](https://docs.sprites.dev/api/v001-rc30/exec/)
  - [Filesystem API](https://docs.sprites.dev/api/v001-rc30/filesystem/)
  - [Policy API](https://docs.sprites.dev/api/v001-rc30/policy/)
- Official site:
  - [sprites.dev](https://sprites.dev/)
- Official repos:
  - [superfly/sprites-js](https://github.com/superfly/sprites-js)
  - [superfly/sprites-py](https://github.com/superfly/sprites-py)
  - [superfly/sprites-ex](https://github.com/superfly/sprites-ex)
- Public references/community:
  - [clouvet/sprite-mobile](https://github.com/clouvet/sprite-mobile)
  - [mcintyre94/wisp](https://github.com/mcintyre94/wisp)
  - [diggerhq/opencomputer](https://github.com/diggerhq/opencomputer)
  - [Wisp Fly community thread](https://community.fly.io/t/i-built-an-ios-app-to-use-claude-on-sprites/27188)
  - [Tokenizer proxy thread](https://community.fly.io/t/sprites-tokenizer-secret-injecting-proxy-pattern-for-sandboxed-ai-agents/27054)
  - [Fly blog: Design & Implementation of Sprites](https://fly.io/blog/design-and-implementation/)
- Published SDK inspection:
  - `@fly/sprites@0.0.1`
  - `@fly/sprites@0.0.1-rc37`

## Executive Summary

- `client.sprite(name)` only returns a handle. It does **not** create a Sprite.
- The public docs/API are ahead of the npm **stable** package. `@fly/sprites@0.0.1` has `exec`, sessions, and checkpoints, but does **not** ship the filesystem, services, URL, or network-policy helpers the docs describe.
- Those helpers **do** exist in npm **pre-release** `@fly/sprites@0.0.1-rc37`, so the main issue is version drift, not platform capability.
- The current `sprite.exec('claude ... "long prompt"...')` pattern is unsafe because `exec()` splits on whitespace and does not preserve shell quoting. Use `execFile()` with arg arrays, or `bash -lc` when shell behavior is truly required.
- For preview servers, **Services** are the right primitive. Detached exec/TTY sessions do not survive hibernation; Services do.
- Preview URLs are real, but default auth is private. Official docs currently disagree on `*.sprites.app` vs `*.sprites.dev`, so the URL should always be read from Sprite metadata instead of being synthesized.
- The published JS SDK currently requires **Node 24+**.

## Version Reality

Sprites is currently version-skewed across docs and packages:

- `docs.sprites.dev` JS docs describe the smaller command/session SDK surface.
- npm **stable** `@fly/sprites@0.0.1` matches that smaller surface.
- npm **pre-release** `@fly/sprites@0.0.1-rc37` adds `filesystem()`, services, network policy helpers, proxy helpers, and URL settings helpers.
- REST/API docs describe those newer capabilities too.

This matters because PR 52-54 as currently written only works if we either:

1. pin an RC build such as `@fly/sprites@0.0.1-rc37`, or
2. call the REST/WebSocket APIs directly for filesystem/services/policy/URL operations.

## API Correctness

### Q1. How do you create or reference a Sprite?

`client.sprite(name)` only references an existing Sprite by name. It does not auto-create anything. Creation is a separate call: `await client.createSprite(name, config?)`.

Two important corrections:

1. The published JS SDK is **name-addressed**, not ID-addressed. Its methods take a Sprite name.
2. The stable JS SDK's `createSprite()` returns a `Sprite` object, not `{ id }`. The current tasklist assumption `const spriteId = createResult.id` is wrong for stable `@fly/sprites@0.0.1`.

Nuance:

- In `0.0.1-rc37`, the returned `Sprite` object is assigned API metadata including `id`.
- Even there, the method still returns a `Sprite`, not a plain `{ id }` object.

Evidence:

- [sprites-js README](https://github.com/superfly/sprites-js)
- [Sprites API: Create Sprite](https://docs.sprites.dev/api/dev-latest/sprites/)
- Published package inspection of `dist/client.d.ts` and `dist/client.js`

### Q2. Filesystem operations: parent dirs, JSON helpers, binary writes

At the REST API level, the filesystem definitely supports raw bytes:

- `GET /v1/sprites/{name}/fs/read` returns raw file bytes
- `PUT /v1/sprites/{name}/fs/write` accepts raw file bytes
- parent directory creation is available via a create-parents flag at the API layer

Package reality:

- npm **stable** `@fly/sprites@0.0.1` does **not** ship `sprite.filesystem()`
- npm **pre-release** `@fly/sprites@0.0.1-rc37` **does** ship `sprite.filesystem()`, `readFile`, `writeFile`, `writeJSON`, and `readJSON`

Important rc37 detail:

- `writeFile()` accepts `string | Buffer`
- rc37 implementation auto-creates parent directories on `writeFile()`

Bottom line:

- Binary file round-trips are supported by the platform/API.
- The current tasklist pattern `const fs = sprite.filesystem('/workspace')` is not valid against npm **stable**, but it is valid against `0.0.1-rc37`.

Evidence:

- [Filesystem API](https://docs.sprites.dev/api/v001-rc30/filesystem/)
- Published package inspection of stable and rc37 tarballs

### Q3. Does `sprite.exec()` wait for completion and return stdout/stderr?

Yes. In the published JS SDK, `sprite.exec()` waits for process completion and resolves with:

```ts
{
  stdout: string | Buffer;
  stderr: string | Buffer;
  exitCode: number;
}
```

Non-zero exit codes reject with `ExecError`, but the error still contains `stdout`, `stderr`, and `exitCode`.

Important gotcha: the published JS SDK's `exec()` implementation is **not shell-aware**. It does a naive whitespace split before calling `execFile()`. That means a command like:

```ts
sprite.exec('claude --dangerously-skip-permissions -p "analyze this spreadsheet carefully"')
```

will not preserve shell quoting correctly.

For Claude CLI prompts, use:

```ts
await sprite.execFile('claude', [
  '--dangerously-skip-permissions',
  '-p',
  prompt,
  '--max-turns',
  '20',
], options);
```

or:

```ts
await sprite.execFile('bash', ['-lc', fullShellCommand], options);
```

Evidence:

- [sprites-js README](https://github.com/superfly/sprites-js)
- [JavaScript SDK docs](https://docs.sprites.dev/sdks/javascript/)
- Published package inspection of `dist/exec.d.ts` and `dist/exec.js`

### Q4. Can we read binary files back as buffers?

Yes at the API layer, but not with the npm **stable** JS helper surface.

- Filesystem API `read` returns raw bytes, so binary download is supported.
- npm **rc37** exposes `fs.readFile(path, null)` returning `Buffer`.
- `exec()` / `execFile()` can also return `Buffer` when `encoding: 'buffer'` is used.

So for binary file retrieval we have two viable paths:

1. use rc37 `sprite.filesystem()`, or
2. call the raw Filesystem API directly

Evidence:

- [Filesystem API](https://docs.sprites.dev/api/v001-rc30/filesystem/)
- Published package inspection of stable and rc37 tarballs

### Q5. How do we set `ANTHROPIC_API_KEY` inside the Sprite?

For per-command execution, this is supported in the published JS SDK. `SpawnOptions` includes:

```ts
env?: Record<string, string>
```

So this works for `exec`, `execFile`, `spawn`, and `createSession`:

```ts
await sprite.execFile(
  'claude',
  ['--dangerously-skip-permissions', '-p', prompt],
  {
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL ?? '',
    },
  },
);
```

What is **not** clearly verified:

- a persistent Sprite-level env API in npm stable JS SDK
- a documented service-level `env` field in the public Services API

The package types hint at `environment` fields on Sprite metadata and create requests, but:

- the public JS SDK signature does not expose them cleanly
- the public Sprite creation/update API docs do not document them as a supported stable pattern

Important caveat: the Exec API docs say `env` "replaces the default environment" when provided, while the JS SDK examples imply partial env maps are fine. That is an official-docs ambiguity worth smoke-testing before implementation.

Recommendation: treat provider keys as **per-command env vars**, not persistent Sprite config.

Evidence:

- [JavaScript SDK docs](https://docs.sprites.dev/sdks/javascript/)
- [Exec API](https://docs.sprites.dev/api/v001-rc30/exec/)
- Published package inspection of `SpawnOptions` and `ExecOptions`

### Q6. Do detachable sessions work for `npm run dev`?

Yes, detachable exec sessions exist:

- `createSession(command, args?, options?)`
- `attachSession(sessionId, options?)`
- `listSessions()`

But they are the wrong primitive for a resilient preview server.

Official docs say:

- Services survive hibernation
- processes started via `sprite exec` or `sprite console` stop when the Sprite sleeps

So a detached `npm run dev` session will work while the Sprite stays awake, but it is not the best way to model a preview server that should resume after sleep.

Package reality:

- Services helpers are documented
- they are missing from npm **stable**
- they are present in npm **rc37**

Recommendation: for artifact previews, use the Services API directly over REST, or explicitly adopt rc37. Do not model preview servers as detached exec sessions.

Evidence:

- [JavaScript SDK docs](https://docs.sprites.dev/sdks/javascript/)
- [working with Sprites](https://docs.sprites.dev/working-with-sprites)
- rc37 package inspection of `dist/services.d.ts` and `dist/sprite.d.ts`

### Q7. How does port exposure and the preview URL work?

Confirmed:

- every Sprite gets a URL
- requests to the URL auto-wake the Sprite
- traffic is proxied to port `8080`
- URL auth defaults to private (`"sprite"`) and must be switched if you want public access

Important correction: official docs currently disagree on the hostname domain.

- Create API responses and the working guide show `*.sprites.app`
- the networking concept page still shows `*.sprites.dev`

So the safe rule is:

- do **not** synthesize the URL
- always read it from `sprite.url` / `client.getSprite(name)`

Second correction: "Preview URL out of the box" is true, but "public user-accessible preview out of the box" is false. Public access requires explicit URL auth changes.

The Services API also introduces `httpPort`, which suggests more structured routing than the marketing site's simple "listen on 8080" wording. For Sunder, the safest path is still: run the preview service on `8080`, then explicitly configure URL auth to match the product's sharing model.

Evidence:

- [Sprites API: Create Sprite](https://docs.sprites.dev/api/dev-latest/sprites/)
- [working with Sprites](https://docs.sprites.dev/working-with-sprites/)
- [Networking](https://docs.sprites.dev/concepts/networking/)
- [sprites.dev](https://sprites.dev/)

### Q8. Auto-sleep and auto-wake

Confirmed:

- Sprites sleep when idle
- normal wake is roughly `100-500ms`
- cold starts are roughly `1-2s`
- URL requests auto-wake the Sprite
- files, installed packages, policies, and services persist across warm/cold transitions
- RAM does not persist

Not verified:

- a documented idle timeout duration
- a documented setting to configure that timeout

The docs describe sleep in activity terms, not in "after N minutes" terms. I did not find an official published timeout value.

`sprite.exec()` on a cold Sprite is not stated as a dedicated guarantee, but it is strongly implied by the documented create-then-exec flow. That is a reasonable inference, not a direct statement.

Evidence:

- [working with Sprites](https://docs.sprites.dev/working-with-sprites)
- [quickstart](https://docs.sprites.dev/quickstart/)
- [sprites.dev](https://sprites.dev/)

### Q9. Cleanup and deletion

Deletion exists in both forms:

- `await sprite.delete()`
- `await client.deleteSprite(name)`

The JS SDK also has `destroy()` as an alias for `delete()`.

Evidence:

- [sprites-js README](https://github.com/superfly/sprites-js)
- Published package inspection of `dist/client.d.ts` and `dist/sprite.d.ts`

## Claude Code on Sprites

- **Pre-installed:** Yes. Official docs describe Claude CLI, Gemini CLI, Codex, and common runtimes/tools as preinstalled.
- **Base image version:** Official docs are inconsistent. `working-with-sprites` currently says Ubuntu `25.04`; `llms-full.txt` says `25.10`. Do not hardcode the minor version in Sunder docs.
- **`pip install pandas openpyxl` persists:** Yes. Official docs explicitly say package installs and files persist across hibernation.
- **Set `ANTHROPIC_API_KEY`:** Yes for per-command execution via `env`. Persistent Sprite-level secret config is not clearly documented in stable JS SDK.
- **Set `ANTHROPIC_BASE_URL`:** Same answer as above. Passing it as a per-command env var is the safest verified pattern.
- **`--dangerously-skip-permissions`:** I found no Sprites restriction that would block it. Strongest evidence is public usage rather than a dedicated docs page:
  - `clouvet/sprite-mobile` explicitly documents running Claude Code that way on Sprites
  - Fly's own blog says Claude is expected to run in `--dangerously-skip-permissions` mode on Sprites

Evidence:

- [working with Sprites](https://docs.sprites.dev/working-with-sprites)
- [sprites.dev](https://sprites.dev/)
- [clouvet/sprite-mobile](https://github.com/clouvet/sprite-mobile)
- [Fly blog: Design & Implementation of Sprites](https://fly.io/blog/design-and-implementation/)

## Network Policy

Confirmed:

- Sprites support Layer 3 outbound filtering by domain
- public docs describe allow/deny rules
- updates are enforced immediately
- policies persist across warm/cold transitions

Official docs are slightly inconsistent on endpoint shape:

- one policy doc describes `POST /v1/sprites/{name}/policy/network`
- another API index page describes account-level `GET/POST /v1/network-policy`

The most concrete per-Sprite policy doc is the former.

Package reality:

- stable npm package does **not** expose network policy helpers
- rc37 exposes `getNetworkPolicy()` and `updateNetworkPolicy()`

What this means for Sunder:

- Allowlisting specific domains is supported.
- The design should allow more than `api.anthropic.com` plus one or two registries.
- A minimum realistic list depends on the workload:
  - Anthropic: `api.anthropic.com`
  - OpenRouter: `openrouter.ai`
  - npm: `registry.npmjs.org` and often `*.npmjs.org`
  - Python: `pypi.org` and `files.pythonhosted.org`
  - apt: Ubuntu archive/security mirrors if apt installs remain in scope

`Can Claude Code still call Anthropic with the allowlist active?` Yes in principle, if the right domains are included. That is an inference from the policy model, not an explicit Claude-specific guarantee.

Evidence:

- [Policy API](https://docs.sprites.dev/api/v001-rc30/policy/)
- [sprites.dev network policy section](https://sprites.dev/)
- [superfly/sprites-py](https://github.com/superfly/sprites-py)
- rc37 package inspection of `dist/policy.d.ts`

## Pricing Verification

- **CPU pricing:** Confirmed at **$0.07 / CPU-hour**
- **Memory pricing:** Confirmed at **$0.04375 / GB-hour**
- **Hot storage:** Confirmed at **$0.000683 / GB-hour**
- **Cold/durable storage:** Confirmed at **$0.000027 / GB-hour**
- **Free credits:** Confirmed at **$30 trial credits**
- **Storage per Sprite:** Confirmed as **100 GB to start**, with public docs saying storage can scale beyond that
- **Max per-run compute:** Official site says up to **8 CPUs** and **16 GB RAM** for a run
- **Max Sprites per account:** I did **not** find a documented public numeric limit in official docs/site
- **SDK evidence of limits:** rc37 package types include `concurrent_sprite_limit_exceeded` and `sprite_creation_rate_limited`, so limits clearly exist even though the public docs I reviewed do not publish the numeric cap
- **Hibernation timeout:** I did **not** find a documented timeout value or a documented configurability knob

Correction to the design doc's "sleeping Sprites cost $0" wording:

- sleeping Sprites stop charging CPU/memory because compute is removed
- persistent storage remains billable
- so "no idle compute cost" is correct, while "literally $0 total while sleeping" is too absolute unless the Sprite has negligible stored data

Evidence:

- [sprites.dev billing section](https://sprites.dev/)
- [working with Sprites](https://docs.sprites.dev/working-with-sprites)
- rc37 package inspection of `dist/types.d.ts`

## Reference Repos

| Repo | Relevance | What it proves | Especially relevant paths / docs |
|---|---|---|---|
| [superfly/sprites-js](https://github.com/superfly/sprites-js) | Official JS surface | Confirms the published JS SDK is currently command/session/checkpoint focused. Also the source of the `exec()` shell-splitting gotcha. | `README.md`, `dist/`, `examples/` |
| [superfly/sprites-py](https://github.com/superfly/sprites-py) | Official cross-check | Confirms network policy is a real supported concept in official SDK land, even where JS stable lags. | `README.md`, `examples/` |
| [superfly/sprites-ex](https://github.com/superfly/sprites-ex) | Official cross-check | Confirms similar handle-vs-create semantics in another SDK. Useful if we need to compare API behavior across languages. | `README.md`, `CLAUDE.md` |
| [clouvet/sprite-mobile](https://github.com/clouvet/sprite-mobile) | Strongest Sprites-native session architecture reference | Multi-client Claude-on-Sprite lifecycle, keepalive mechanics, process/session management, Tailscale-gated preview flow, and explicit `--dangerously-skip-permissions` usage. | README sections `Architecture`, `Services`, `Keepalive`, `Session Lifecycle`, `Security` |
| [mcintyre94/wisp](https://github.com/mcintyre94/wisp) | Strongest Sprites-native non-interactive Claude reference | Uses Sprites services plus Claude `-p --output-format stream-json` and `--resume`. Best reference for "chat UI drives Claude in a Sprite without an interactive terminal". | README sections `How does Chat work?`, `Features`; `sprites-ios-spec.md` |
| [diggerhq/opencomputer](https://github.com/diggerhq/opencomputer) | Best architectural analogue, not Sprites-specific | Shows the outer-agent/inner-sandboxed-coder pattern Sunder actually wants, even though the sandbox provider is OpenComputer. Existing handovers refer to this lineage as the Open Lovable reference. | Repo README and [Building Open Lovable Part 1](https://opencomputer.dev/guides/building-open-lovable-part-1) |

## Community References

- [I built an iOS app to use Claude on Sprites!](https://community.fly.io/t/i-built-an-ios-app-to-use-claude-on-sprites/27188)  
  Best public evidence of a real "Claude-on-Sprites" product. Useful for service-based resume, worktree-per-chat, file upload into Sprites, and inline checkpoint UX.

- [Sprites + Tokenizer: Secret-injecting proxy pattern for sandboxed AI agents?](https://community.fly.io/t/sprites-tokenizer-secret-injecting-proxy-pattern-for-sandboxed-ai-agents/27054)  
  Important security note. Confirms active user demand for a proxy-based secret pattern and suggests Sprites are isolated from Fly private networking/6PN. Good reference for why "put long-lived secrets inside the Sprite" is the risky path.

- [Fly blog: Design & Implementation of Sprites](https://fly.io/blog/design-and-implementation/)  
  Important product-level reference. Explicitly says Sprites are built for agents, that services restart when a Sprite bounces, and that Claude is expected to run in `--dangerously-skip-permissions` mode.

## Gaps & Gotchas

- **Stable-vs-rc drift:** The docs/API mention filesystem, services, network policy, and URL helpers that are missing from npm stable `@fly/sprites@0.0.1` but present in npm prerelease `@fly/sprites@0.0.1-rc37`.
- **`exec()` quoting bug for our use case:** The JS SDK splits the command string on whitespace. Passing long Claude prompts as a single shell string is unsafe.
- **Name vs ID drift:** API responses expose IDs, but the JS SDK is primarily name-addressed. Current tasklists/designs treat Sprite IDs as if they are the primary SDK handle.
- **URL-domain drift:** Official docs currently disagree between `*.sprites.app` and `*.sprites.dev`.
- **Private-by-default preview URLs:** Returning a preview URL to a Sunder user requires explicit auth handling. "There is a URL" does not mean "that URL is public."
- **Session vs service confusion:** Detached sessions are not enough for resilient preview servers. Services are the correct primitive.
- **Idle timeout unknown:** Auto-sleep exists, but I did not find an official timeout number or config option.
- **Security gap for long-lived secrets:** Public docs/community do not yet show a first-class secret-injecting proxy pattern for Sprites. If we place provider keys directly inside the Sprite, exfiltration risk is real.
- **Filesystem capability exists below the stable SDK:** We can still build what we want, but we may need internal REST wrappers rather than assuming npm stable has the helper surface.
- **Node runtime requirement:** Both stable and rc37 npm packages declare `engines.node >= 24.0.0`. We need to verify this is acceptable in the Vercel runtime we intend to use.
- **Base image version drift:** official docs currently disagree on Ubuntu `25.04` vs `25.10`. Avoid pinning the minor version in design docs.

## Recommended Design Changes

- Replace all `sprite.exec("claude ...")` string-building with `execFile()` argument arrays, or `bash -lc` when shell features are actually required.
- Do **not** assume `sprite.filesystem()` exists in npm stable. Either:
  - build a thin internal REST client for filesystem/services/policy/URL operations, or
  - explicitly pin a published prerelease such as `@fly/sprites@0.0.1-rc37` and accept prerelease risk deliberately.
- Do **not** assume `createSprite()` returns `{ id }`. In JS it returns a `Sprite` handle. If we need the UUID-like API ID, fetch/store it explicitly from metadata; otherwise treat the Sprite **name** as the primary SDK handle.
- Use the Services API for artifact preview servers. Do not model preview servers as detached exec sessions.
- Treat preview URL auth as an explicit product decision. Either make the Sprite URL public for that artifact lifecycle, or proxy preview traffic through Sunder.
- Treat `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL` as per-command env vars, not persistent Sprite config.
- Expand the network allowlist design to include the real package/download domains the workload needs.
- Update cost language from "sleeping Sprites cost $0" to "sleeping Sprites have no idle compute cost; storage remains billable."
- Remove hardcoded claims about Ubuntu `25.10`.
- Verify Node 24 compatibility before adopting the JS SDK inside Vercel server code.
- If this scope returns to active implementation, re-verify the latest SDK release before coding. The biggest blocker here is not missing platform capability; it is docs/package drift.
