---
name: adversarial-review
description: >-
  Run an adversarial review that challenges the implementation approach, design choices, tradeoffs, and assumptions in the current working tree or branch diff. Not a style check — a challenge review.
---

# Adversarial Review

**Announce at start:** "Running adversarial review..."

## Arguments

`$ARGUMENTS`

Supported flags:
- `--base <ref>` — diff against a specific base ref instead of auto-detecting
- `--scope working-tree|branch` — force scope (default: auto-detect)
- Any remaining text after flags is treated as **focus text** that weights the review

## Phase 1: Collect Context

Determine what to review based on scope:

### Auto-detect (default)
1. Run `git status --short` and `git diff --shortstat` + `git diff --shortstat --cached`
2. If working tree is dirty (staged, unstaged, or untracked changes) → use **working-tree** mode
3. If working tree is clean → use **branch** mode against the default branch

### Working-tree mode
Collect ALL of the following using Bash:
```bash
git status --short
git diff --cached       # staged diff
git diff                # unstaged diff
git ls-files --others --exclude-standard  # untracked files
```
Then **Read** every untracked file that is text and under 24KB.

### Branch mode
```bash
MERGE_BASE=$(git merge-base HEAD <base-ref>)
git log --oneline --decorate ${MERGE_BASE}..HEAD
git diff --stat ${MERGE_BASE}..HEAD
git diff ${MERGE_BASE}..HEAD
```

### Full file reads
After collecting diffs, **Read the full current content** of every modified/added file. Diffs alone are not enough — you need surrounding context to trace invariants, data flow, and failure paths.

## Phase 2: Adversarial Review

You are now performing an adversarial software review.
**Your job is to break confidence in the change, not to validate it.**

### Operating Stance
- Default to skepticism.
- Assume the change can fail in subtle, high-cost, or user-visible ways until the evidence says otherwise.
- Do not give credit for good intent, partial fixes, or likely follow-up work.
- If something only works on the happy path, treat that as a real weakness.

### Attack Surface
Prioritize failures that are expensive, dangerous, or hard to detect:
- Auth, permissions, tenant isolation, and trust boundaries
- Data loss, corruption, duplication, and irreversible state changes
- Rollback safety, retries, partial failure, and idempotency gaps
- Race conditions, ordering assumptions, stale state, and re-entrancy
- Empty-state, null, timeout, and degraded dependency behavior
- Version skew, schema drift, migration hazards, and compatibility regressions
- Observability gaps that would hide failure or make recovery harder

### Review Method
- Actively try to disprove the change.
- Look for violated invariants, missing guards, unhandled failure paths, and assumptions that stop being true under stress.
- Trace how bad inputs, retries, concurrent actions, or partially completed operations move through the code.
- If the user supplied focus text, weight it heavily, but still report any other material issue you can defend.

### Finding Bar
Report only **material** findings. Do NOT include:
- Style feedback or naming feedback
- Low-value cleanup
- Speculative concerns without evidence

A finding MUST answer:
1. **What can go wrong?**
2. **Why is this code path vulnerable?**
3. **What is the likely impact?**
4. **What concrete change would reduce the risk?**

### Grounding Rules
- Be aggressive, but stay grounded.
- Every finding must be defensible from the code you actually read.
- Do not invent files, lines, code paths, incidents, attack chains, or runtime behavior you cannot support.
- If a conclusion depends on an inference, state that explicitly and keep the confidence honest.

### Calibration
- Prefer one strong finding over several weak ones.
- Do not dilute serious issues with filler.
- If the change looks safe, say so directly and return no findings.

## Phase 3: Output

Output findings in this exact format:

```
## Adversarial Review — [target description]

**Verdict:** `approve` | `needs-attention`

**Summary:** [1-2 sentence terse ship/no-ship assessment — NOT a neutral recap]

### Findings

#### [severity: critical|high|medium|low] [title]
- **File:** `path/to/file.ts:line_start-line_end`
- **Confidence:** [0.0–1.0]
- **What can go wrong:** [description]
- **Why vulnerable:** [code-grounded reasoning]
- **Impact:** [likely consequence]
- **Recommendation:** [concrete change]

---

[repeat for each finding]

### Next Steps
- [actionable item 1]
- [actionable item 2]
```

### Final Self-Check
Before outputting, verify each finding is:
- Adversarial rather than stylistic
- Tied to a concrete code location you actually read
- Plausible under a real failure scenario
- Actionable for an engineer fixing the issue

## Constraints

- **Review only.** Do NOT fix issues, apply patches, or offer to make changes.
- Do NOT weaken the adversarial framing.
- Use `needs-attention` if there is ANY material risk worth blocking on.
- Use `approve` ONLY if you cannot support any substantive adversarial finding from the code.
