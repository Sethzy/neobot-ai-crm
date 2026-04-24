# Rule: Generating a Task List

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for this codebase and questionable taste. Document everything they need to know: which files to touch for each task, relevant code and docs to read first, how to test the work, and how to keep scope tight.

Assume the implementer is a skilled developer, but knows almost nothing about Sunder, our stack, or our conventions. Assume they do not naturally write strong tests unless the plan forces them to.

Optimize for:

- DRY
- YAGNI
- TDD
- frequent commits
- exact file paths
- exact test commands
- exact expected outcomes

## Default Save Path

- **Format:** Markdown (`.md`)
- **Default location:** `docs/tasks/YYYY-MM-DD-<feature-name>-tasklist.md`

### Path Override Rule

If the referenced design doc, handoff, or origin document explicitly overrides the tasklist location, follow that override instead of the default. Otherwise use `docs/tasks/`.

## Process

1. **Receive design doc reference**
   The user points to a specific design doc, requirements doc, plan, or handoff file.
2. **Read the source doc thoroughly**
   Read the entire file, not just the header or acceptance criteria.
3. **Extract implementation context**
   Capture:
   - user-facing goal
   - architecture decisions
   - constraints
   - non-goals
   - dependencies
   - rollout or migration notes
   - open questions that are explicitly deferred
4. **Read local code before planning**
   Inspect the real implementation area before writing tasks.
   At minimum, identify:
   - routes/pages
   - components
   - hooks
   - server actions / API routes
   - schemas / types
   - tests
   - QA docs
5. **Generate parent tasks first**
   Break the work into a small number of logical chunks.
   Each parent task should produce a coherent unit of working software.
6. **Break parent tasks into bite-sized steps**
   Each step should be one action that takes roughly 2-5 minutes.
   Prefer explicit TDD flow:
   - write failing test
   - run the test and confirm failure
   - implement the smallest code change
   - rerun tests and confirm pass
   - commit
7. **List relevant files**
   Include exact paths for files to create, modify, or test.
   Include docs and QA files when they are part of the implementation.
8. **Generate the final Markdown**
   Combine:
   - header
   - relevant files
   - skills to use
   - source docs
   - task list
   - execution handoff
9. **Save the tasklist**
   Save to the resolved path from the rules above.

## Required Planning Standards

### Assume Zero Context

Do not write vague instructions like:

- "update the hook"
- "add validation"
- "wire the UI"
- "test the flow"

Instead write:

- which file to open
- what existing code to mirror
- what exact test to add
- what command to run
- what failure to expect
- what code to write
- what success condition proves the step is done

### Stay DRY

- Reuse existing primitives before introducing new abstractions.
- Do not create a new abstraction in the plan unless the plan explains why existing abstractions are insufficient.
- If multiple tasks touch the same reusable primitive, make that primitive its own earlier parent task.

### Stay YAGNI

- Do not include speculative extensibility.
- Do not add optional follow-up architecture inside the implementation tasks.
- Keep the plan scoped to the source document, plus only the minimum supporting refactors required to make the feature clean.

### Enforce TDD

Every parent task should follow test-first unless the work is pure documentation or pure cleanup with no observable behavior. If a task cannot be tested meaningfully, say why.

### Frequent Commits

Every parent task should end with a commit step.
If the task is large, add one or more intermediate commit steps.

## Tasklist Document Header

Every generated tasklist must start with this header:

```md
# [Feature Name] Implementation Plan

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" - Step
- "Run it to make sure it fails" - Step
- "Implement the minimal code to make the test pass" - Step
- "Run the tests and make sure they pass" - Step
- "Commit" - Step
```

## Recommended Top-Level Structure

Use this section order unless there is a strong reason not to:

```md
# [Feature Name] Implementation Plan

**Goal:** ...

**Architecture:** ...

**Tech Stack:** ...

## Bite-Sized Step Granularity

...

## Relevant Files

- Create: `...`
- Modify: `...`
- Test: `...`
- Docs: `...`

## Skills To Use

- `@nextjs-best-practices` for ...
- `@test-driven-development` for ...

## Source Documents

- Origin: `docs/...`
- Related plan: `docs/...`

## Scope Guardrails

- In scope: ...
- Out of scope: ...

---

### Task 1: ...
...
```

## Relevant Files Section Rules

The `## Relevant Files` section must:

- list exact file paths
- separate `Create`, `Modify`, `Test`, and `Docs` entries when useful
- include corresponding test files for every implementation file when applicable
- include QA docs to update when the change affects manual test coverage
- avoid duplicates

Good:

```md
## Relevant Files

- Create: `src/components/crm/record-link-cell.tsx`
- Create: `src/components/crm/__tests__/record-link-cell.test.tsx`
- Modify: `app/(dashboard)/customers/people/page.tsx`
- Modify: `src/components/crm/quick-edit-cell.tsx`
- Test: `app/(dashboard)/customers/people/__tests__/page.test.tsx`
- Docs: `docs/qa/16-crm-working-surfaces.md`
```

Bad:

```md
## Relevant Files

- CRM page
- tests
- docs
```

## Task Structure

Each parent task must use this format:

```md
### Task N: [Component or Workstream Name]

**Files:**
- Create: `exact/path/to/new-file.ts`
- Modify: `exact/path/to/existing-file.tsx`
- Test: `exact/path/to/test-file.test.tsx`
- Docs: `docs/qa/exact-doc.md`

**Step 1: Read the existing implementation**

Open:
- `src/...`
- `app/...`

Look for:
- existing abstraction to reuse
- current test patterns
- existing type/schema definitions

**Step 2: Write the failing test**

Create or update `src/example/__tests__/feature.test.ts`:

```tsx
import { describe, expect, it } from "vitest";

import { formatStageLabel } from "../format-stage-label";

describe("formatStageLabel", () => {
  it("returns a human label for snake_case stages", () => {
    expect(formatStageLabel("in_progress")).toBe("In Progress");
  });
});
```

**Step 3: Run the test to verify it fails**

Run:

```bash
pnpm vitest run src/example/__tests__/feature.test.ts -t "returns a human label for snake_case stages"
```

Expected:

```txt
FAIL
Error: Failed to resolve import "../format-stage-label"
```

**Step 4: Write the minimal implementation**

Create or update `src/example/format-stage-label.ts`:

```ts
/**
 * Converts a snake_case status string into a human-readable label.
 */
export function formatStageLabel(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
```

**Step 5: Run the test to verify it passes**

Run:

```bash
pnpm vitest run src/example/__tests__/feature.test.ts -t "returns a human label for snake_case stages"
```

Expected:

```txt
PASS
```

**Step 6: Run the nearest full test file**

Run:

```bash
pnpm vitest run src/example/__tests__/feature.test.ts
```

Expected:

```txt
PASS
```

**Step 7: Commit**

```bash
git add src/example/format-stage-label.ts src/example/__tests__/feature.test.ts
git commit -m "feat(prNN): add stage label formatter"
```
```

## Step-Writing Rules

Every step should be:

- one action
- observable
- testable
- ordered
- explicit

Do not combine multiple actions into one step.

Bad:

- "Implement the UI and API and test everything"

Good:

- "Write the failing component test"
- "Run the component test and confirm failure"
- "Add the minimal component code"
- "Run the component test and confirm pass"
- "Wire the component into the page"
- "Run the page test and confirm pass"
- "Commit"

## Testing Rules

Plans must tell the implementer exactly how to test the work.

Include:

- the exact command
- the exact file or test name
- whether failure or success is expected
- manual verification steps when UI or integration behavior matters

For this repo, prefer:

- `pnpm vitest run <file>`
- `pnpm vitest run <file> -t "<test name>"`
- `pnpm lint`

When the feature touches UI, also include manual verification against the relevant QA doc, for example:

```md
**Manual verification**

Open the app and verify:
- the new button appears on desktop and mobile
- keyboard focus remains visible
- empty, loading, and error states still render correctly

Cross-check:
- `docs/qa/16-crm-working-surfaces.md`
```

## Docs and Reference Rules

If the implementer needs background context, include it directly in the tasklist.

Reference:

- origin design docs
- related plans
- QA docs
- nearby components or hooks to mirror
- relevant skills with `@` syntax

Example:

```md
## Skills To Use

- `@nextjs-best-practices` for App Router boundaries and route composition
- `@vercel-react-best-practices` for React extraction choices
- `@test-driven-development` for each parent task
- `@requesting-code-review` after each parent task goes green
```

Only include skills that are actually relevant to the work.

## Scope Guardrails

Every tasklist should state what not to do.

Add a short guardrail section when scope can drift:

```md
## Scope Guardrails

- Do not change database schema in this tasklist.
- Do not redesign unrelated settings navigation.
- Do not add a second abstraction when an existing primitive already exists.
- Do not touch dirty files outside the listed file set.
```

## Quality Bar

A good tasklist is:

- specific enough that a new engineer can execute it without guessing
- narrow enough that it does not balloon scope
- test-first
- commit-oriented
- grounded in exact local files
- honest about risks, dependencies, and non-goals

A bad tasklist is:

- abstract
- hand-wavy
- full of placeholder verbs
- missing tests
- missing commands
- missing file paths
- missing scope boundaries

## Remember

- Exact file paths always
- Exact commands always
- Expected failure/pass output always
- Prefer TypeScript examples in this repo
- Include complete code snippets in the plan, not vague prose like "add validation"
- Include both automated and manual verification when relevant
- Reference relevant skills with `@` syntax
- Keep the plan DRY
- Keep the plan YAGNI
- Force TDD
- Commit frequently

## Execution Handoff

Every tasklist must end with this handoff:

```md
Tasklist complete and saved to `docs/tasks/YYYY-MM-DD-<feature-name>-tasklist.md`. Ask user to open a new session to do batch execution with checkpoint.
```

If the save path was explicitly overridden by the source document, replace the path in the handoff with the actual saved path.
