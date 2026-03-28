# Deep Agents Alignment Proposal: Remove Context-Assembly Bootstrap From Sunder

> Reference repo analyzed: `/Users/sethlim/Documents/deepagents`
> Upstream repo: `langchain-ai/deepagents`
> Date: 2026-03-25
> Scope: the sequential bootstrap bottleneck in Sunder's `loadSystemPromptState()`

## Bottom Line

Sunder still has the bottleneck.

Today the runtime path is:

```txt
POST /api/chat
-> app/api/chat/route.ts
-> src/lib/runner/run-agent.ts
-> src/lib/runner/context.ts assembleContext()
-> loadSystemPromptState()
-> await bootstrapMemoryFiles()
   -> await bootstrapSkills()
-> Promise.all([
     loadMemoryContext(),
     discoverUserSkills(),
     buildSystemReminder(),
     fetchThreadCompactionState(),
   ])
```

That is not how Deep Agents is built.

Deep Agents does not bootstrap memory or skills inside context assembly. It does a one-time initialization step outside the prompt-loading path, then loads memory/skills into agent state once, and injects them read-only on model calls.

The correct fix is not "parallelize `bootstrapMemoryFiles()` with the reads inside `loadSystemPromptState()`". The correct fix is to remove bootstrap from `loadSystemPromptState()` entirely.

## 1. Reference Patterns To Copy From Deep Agents

## 1.1 Bootstrap happens outside the run/context path

Deep Agents CLI performs filesystem setup before the agent graph is created:

- `libs/cli/deepagents_cli/agent.py`
  - creates/touches `AGENTS.md`
  - ensures skills directories exist
  - then wires `MemoryMiddleware` and `SkillsMiddleware`

Relevant local references:

- `/Users/sethlim/Documents/deepagents/libs/cli/deepagents_cli/agent.py`
- `/Users/sethlim/Documents/deepagents/libs/cli/tests/unit_tests/test_agent.py`

Pattern to copy:

- Initialization belongs to a startup/init boundary.
- Prompt construction should not create files.
- Context loading should assume files either exist already or are legitimately absent.

## 1.2 Memory and skills load once, then inject many times

Deep Agents uses `before_agent` / `abefore_agent` guards:

- `MemoryMiddleware` skips loading if `memory_contents` is already in state.
- `SkillsMiddleware` skips loading if `skills_metadata` is already in state.

Relevant local references:

- `/Users/sethlim/Documents/deepagents/libs/deepagents/deepagents/middleware/memory.py`
- `/Users/sethlim/Documents/deepagents/libs/deepagents/deepagents/middleware/skills.py`
- `/Users/sethlim/Documents/deepagents/libs/deepagents/tests/unit_tests/middleware/test_memory_middleware.py`
- `/Users/sethlim/Documents/deepagents/libs/deepagents/tests/unit_tests/middleware/test_memory_middleware_async.py`
- `/Users/sethlim/Documents/deepagents/libs/deepagents/tests/unit_tests/middleware/test_skills_middleware.py`
- `/Users/sethlim/Documents/deepagents/libs/deepagents/tests/unit_tests/middleware/test_skills_middleware_async.py`

Pattern to copy:

- The read path is pure.
- The read path is side-effect free.
- The "already initialized" decision is durable state, not a best-effort in-process cache.

What not to copy literally:

- Deep Agents' `before_agent` middleware hooks.

Why:

- Sunder does not use LangGraph middleware state or a checkpointed graph runtime.
- Sunder is a stateless AI SDK runner over Supabase and Vercel Functions.

So we should copy the control-flow boundary, not the Python API shape.

## 1.3 Built-in skills are a separate source, not copied into user storage

Deep Agents CLI layers skills from lowest to highest precedence:

1. built-in package skills
2. user skills
3. project skills

Later sources override earlier ones.

Relevant local references:

- `/Users/sethlim/Documents/deepagents/libs/cli/deepagents_cli/agent.py`
- `/Users/sethlim/Documents/deepagents/libs/deepagents/deepagents/middleware/skills.py`
- `/Users/sethlim/Documents/deepagents/libs/cli/tests/unit_tests/test_agent.py`

Pattern to copy:

- Built-in defaults should be immutable source material.
- User/project copies should be overrides, not required bootstrap artifacts.
- Discovery should merge sources in memory.

This is the most important upstream pattern Sunder currently does not follow for skills.

## 1.4 Prompt injection is read-only

Deep Agents loads state first, then `wrap_model_call` appends prompt sections. The injection helper is tiny and pure:

- `/Users/sethlim/Documents/deepagents/libs/deepagents/deepagents/middleware/_utils.py`

Pattern to copy:

- prompt assembly should only format already-loaded data
- no storage writes
- no "fixup" side effects

## 1.5 Middleware ordering is deliberate, but this task is not about redoing PR 56

Deep Agents orders middleware so caching happens before memory injection:

- `/Users/sethlim/Documents/deepagents/libs/deepagents/deepagents/graph.py`

Sunder already copied the relevant cache-stability idea in the March 23, 2026 context-pipeline redesign. That is separate from this bottleneck. Do not reopen the memory/message ordering work in this task.

## 2. Actual Sunder Trace Today

Current code path:

- `app/api/chat/route.ts`
  - resolves `clientId`
  - calls `runAgent()`
- `src/lib/runner/run-agent.ts`
  - parallelizes CRM config + Composio
  - calls `assembleContext()`
- `src/lib/runner/context.ts`
  - `assembleContext()` calls `loadSystemPromptState()`
  - `loadSystemPromptState()` starts reminder + compaction early
  - then blocks on `await bootstrapMemoryFiles(supabase, clientId)`
  - only after that does it run `Promise.all([loadMemoryContext, discoverUserSkills, ...])`
- `src/lib/memory/bootstrap.ts`
  - `bootstrapMemoryFiles()` ends with `await bootstrapSkills(supabase, clientId)`
- `src/lib/runner/skills/discover-skills.ts`
  - `discoverUserSkills()` lists `/skills` and downloads each `SKILL.md`

Why the naive `Promise.all` change is wrong:

- `discoverUserSkills()` depends on the skill directories existing on first turn.
- `bootstrapMemoryFiles()` currently calls `bootstrapSkills()`.
- therefore first-turn parallelization creates a real write/read race

This is exactly why PR 56 explicitly dropped bootstrap parallelization.

## 3. Where Sunder Drifts From The Reference

## 3.1 Unjustified drift

### A. Context assembly performs writes

Deep Agents does not do this. Sunder still does.

This is the direct cause of the bottleneck.

### B. Prompt reads depend on same-turn seeding

`discoverUserSkills()` only sees bundled default skills because they were copied into client storage earlier in the same request path.

That coupling does not exist upstream.

### C. The current "already bootstrapped" cache is process-local only

`bootstrappedClients: Set<string>` is an optimization, not a reliable initialization boundary.

On serverless cold starts it disappears.

## 3.2 Justified drift

### A. Sunder uses structured memory, not a single `AGENTS.md`

This is fine. Deep Agents has one memory file. Sunder has `SOUL.md`, `USER.md`, `MEMORY.md`, plus topic files.

This is a product choice, not the source of the bottleneck.

### B. Sunder does not have LangGraph middleware state

So we cannot literally copy `before_agent()` semantics. We need a Sunder-native equivalent.

### C. Sunder's default skills are editable product assets

This is the main reason full no-drift alignment is not an immediate one-file change.

Today these defaults are:

- visible in the dashboard skills UI
- editable by the user
- loaded into sandbox runs from Supabase Storage
- force-migrated in some cases via `migrateSkillBodies()`

Relevant Sunder files:

- `src/lib/runner/skills/skill-bootstrap.ts`
- `src/lib/runner/skills/skill-actions.ts`
- `app/(dashboard)/skills/page.tsx`
- `app/(dashboard)/skills/[slug]/page.tsx`
- `src/lib/sandbox/skill-loader.ts`

Because of those existing behaviors, replacing seeded client copies with a pure built-in source is a larger follow-up, not the first fix.

## 4. Recommended Implementation

## Recommendation

Ship this in two stages:

1. immediate PR-sized fix: move bootstrap out of context assembly and into a durable one-time client initialization boundary
2. follow-up alignment: move bundled default skills toward Deep Agents-style layered sources

Stage 1 is the recommended change for the bottleneck.

## 4.1 Stage 1: Durable client initialization outside context assembly

### Goal

Make `loadSystemPromptState()` read-only.

### Sunder files to touch

- Create: `src/lib/agent/ensure-client-bootstrap.ts`
- Modify: `src/lib/runner/context.ts`
- Modify: `app/api/chat/route.ts`
- Modify: `app/auth/callback/route.ts`
- Modify: `app/api/memory/files/route.ts`
- Modify: `app/(dashboard)/skills/page.tsx`
- Modify: `app/(dashboard)/skills/[slug]/page.tsx`
- Create migration: `supabase/migrations/<timestamp>_add_agent_storage_version_to_clients.sql`
- Update generated types: `src/types/database.ts`

### Deep Agents files to reference

- `/Users/sethlim/Documents/deepagents/libs/cli/deepagents_cli/agent.py`
- `/Users/sethlim/Documents/deepagents/libs/deepagents/deepagents/middleware/memory.py`
- `/Users/sethlim/Documents/deepagents/libs/deepagents/deepagents/middleware/skills.py`

### Exact behavior

Add a durable version field on `clients`, for example:

- `agent_storage_version INT NULL`

Add a constant in Sunder, for example:

- `CURRENT_AGENT_STORAGE_VERSION = 1`

New helper behavior:

```ts
if (client.agent_storage_version === CURRENT_AGENT_STORAGE_VERSION) return;
await bootstrapMemoryFiles(supabase, clientId); // still includes bootstrapSkills()
await update clients set agent_storage_version = CURRENT_AGENT_STORAGE_VERSION;
```

Important rules:

- only update the version after successful bootstrap
- keep `bootstrapMemoryFiles()` idempotent
- do not move prompt loading into the bootstrap helper
- do not call the bootstrap helper from `loadSystemPromptState()`

### Why this is the right Deep Agents-style adaptation

This copies the upstream boundary:

- init/setup happens before prompt loading
- prompt loading is pure
- "already initialized" is durable state, not a local `Set`

### Why the DB column is justified drift

Deep Agents gets durable "already loaded" state from LangGraph checkpoint state.

Sunder does not have that runtime model. The nearest production-grade equivalent is a durable client initialization version in Postgres.

## 4.2 Stage 1 task breakdown

### Task 1: Introduce a single explicit bootstrap helper

Create a new helper that becomes the only supported entrypoint for client storage initialization.

Sunder files:

- `src/lib/agent/ensure-client-bootstrap.ts`
- `src/lib/memory/bootstrap.ts`
- `src/lib/runner/skills/skill-bootstrap.ts`

Tests:

- create unit tests for the new helper
- verify version is not advanced on bootstrap failure
- verify helper is a no-op when version already matches

Docs to check:

- `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`
- `docs/product/tasks/2026-03-20-pr56-runner-pipeline-optimization-tasklist.md`

### Task 2: Delete bootstrap from the context loader

Modify:

- `src/lib/runner/context.ts`

Required change:

- remove `await bootstrapMemoryFiles(supabase, clientId);`
- keep the parallel reads

After the change, `loadSystemPromptState()` should only:

- start reminder/compaction promises
- read memory
- discover skills
- return prompt data

Tests to update:

- `src/lib/runner/__tests__/context.test.ts`
- `src/lib/runner/__tests__/context-crm-config.test.ts`

Regression to add:

- context assembly does not call bootstrap
- context assembly still works when memory files are already absent or empty

### Task 3: Call initialization at the real entrypoints

Minimum entrypoints:

- `app/api/chat/route.ts`
- `app/auth/callback/route.ts`
- `app/api/memory/files/route.ts`
- `app/(dashboard)/skills/page.tsx`
- `app/(dashboard)/skills/[slug]/page.tsx`

Why each one matters:

- chat route: guarantees first real conversation works
- auth callback: pre-warms after OAuth sign-in/sign-up
- memory API: preserves current memory-page behavior
- skills pages: prevents empty skills UI for users who open Skills before chat

Chat route implementation detail:

- start bootstrap early, after `clientId` is known
- overlap it with thread lookup / client row lookup where possible
- await it before invoking `runAgent()`

This is still a drift from Deep Agents, but it is outside context assembly and removes the same-turn write/read race.

### Task 4: Keep the current skill seeding model for now

Do not refactor bundled skills in the same PR.

Keep:

- `bootstrapSkills()`
- `migrateSkillBodies()`
- storage-backed sandbox skill loading
- storage-backed skill editing UI

Reason:

- this is existing product behavior
- existing client data already assumes it
- changing it at the same time increases risk without being necessary for the bottleneck fix

## 4.3 Stage 2: Closer Deep Agents alignment for skills

This is the follow-up that reduces drift further.

### Goal

Stop making bundled default skills depend on client bootstrap at prompt time.

### Pattern to copy from Deep Agents

- built-in skill source is immutable
- user skill source is mutable
- merge sources in memory
- last one wins

### Sunder files to touch

- `src/lib/runner/skills/discover-skills.ts`
- `src/lib/runner/skills/skill-templates.ts`
- `src/lib/runner/skills/skill-actions.ts`
- `app/(dashboard)/skills/page.tsx`
- `app/(dashboard)/skills/[slug]/page.tsx`
- `src/lib/sandbox/skill-loader.ts`
- `src/lib/runner/__tests__/context.test.ts`
- `src/lib/runner/skills/__tests__/discover-skills.test.ts`
- `src/lib/sandbox/__tests__/skill-loader.test.ts`

### Deep Agents files to reference

- `/Users/sethlim/Documents/deepagents/libs/cli/deepagents_cli/agent.py`
- `/Users/sethlim/Documents/deepagents/libs/deepagents/deepagents/middleware/skills.py`
- `/Users/sethlim/Documents/deepagents/libs/cli/tests/unit_tests/test_agent.py`

### Follow-up behavior

- `discoverUserSkills()` becomes merged discovery:
  - bundled default skills
  - client overrides in Supabase Storage
  - later source wins
- `getSkillContent()` falls back to bundled defaults when storage copy does not exist
- skill editor writes an override to storage on first save
- sandbox loader falls back to bundled skill templates for default skill slugs

### Why this is not Stage 1

Because current Sunder behavior assumes seeded storage copies for:

- dashboard editing
- sandbox skill loading
- body migration logic
- existing customer state

This is the cleaner long-term architecture, but it is not the smallest safe bottleneck fix.

## 5. What Not To Do

- Do not change `loadSystemPromptState()` to:

```ts
await Promise.all([
  bootstrapMemoryFiles(...),
  loadMemoryContext(...),
  discoverUserSkills(...),
]);
```

That recreates the first-turn skill seeding race.

- Do not rely only on `bootstrappedClients: Set<string>`.

That is not durable and is weaker than the Deep Agents reference behavior.

- Do not couple this work to another prompt-order rewrite.

PR 56 already changed the cache-sensitive prompt structure. This task is about removing writes from context loading.

## 6. Recommended PR Scope

If we want the smallest correct PR:

1. add durable client initialization versioning
2. move bootstrap to explicit init helper
3. remove bootstrap from `loadSystemPromptState()`
4. call the helper from chat/auth/skills/memory entrypoints
5. keep skill seeding model unchanged for now

If we want the closest Deep Agents alignment after that:

1. layer bundled skills as immutable source
2. treat storage copies as overrides only
3. delete runtime dependence on `bootstrapSkills()` for prompt discovery

## Final Recommendation

For this bug, copy the Deep Agents control-flow boundary exactly:

- initialization first
- prompt loading second
- prompt injection last

Do not copy the Python middleware API literally.

For Sunder, the production-safe version of that pattern is:

- durable client init version in `clients`
- explicit init helper outside context assembly
- `loadSystemPromptState()` becomes read-only

That fixes the bottleneck, resolves the first-turn race correctly, and keeps drift contained to the places where Sunder's current product surface genuinely requires it.
