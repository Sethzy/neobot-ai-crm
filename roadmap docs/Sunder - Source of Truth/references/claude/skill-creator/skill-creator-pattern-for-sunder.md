# Anthropic Skill Creator Pattern — Applicability to Sunder

**Source:** [anthropics/skills/skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator) (official Anthropic skill)
**Guidebook:** [skills.sh/anthropics/skills/skill-creator](https://skills.sh/anthropics/skills/skill-creator)
**Date captured:** 2026-03-06
**Sunder context:** Deferred skill system (SKILL-01 through SKILL-08, cut from v2 scope)

---

## What the Skill Creator Is

The Skill Creator is Anthropic's official meta-skill — a skill that teaches Claude how to build, evaluate, and iterate on other skills. It codifies Anthropic's best practices for the full skill lifecycle:

1. **Capture intent** — interview the user, understand what the skill should do
2. **Draft the skill** — write `SKILL.md` with YAML frontmatter + markdown instructions
3. **Create test prompts** — 2–3 realistic prompts that exercise the skill
4. **Run evals** — spawn parallel subagents (with-skill vs baseline), capture outputs
5. **Human review** — browser-based viewer for qualitative feedback + quantitative benchmarks
6. **Iterate** — rewrite the skill based on feedback, rerun, repeat
7. **Trigger-tune** — optimize the `description` field so the skill fires accurately on natural language
8. **Package** — bundle into distributable `.skill` file

The key insight: **skills are just markdown files** — plain text instructions that transform a general-purpose agent into a specialized one. No code compilation, no DAGs, no state machines. The power comes from the eval/iterate loop that makes the instructions reliable at scale.

---

## Why This Matters for Sunder

Sunder's deferred skill system (SKILL-01–08) already mirrors this architecture almost exactly. The Skill Creator pattern validates our design choices and fills gaps we hadn't fully specified — particularly around **quality assurance** and **trigger accuracy**.

### Architecture Alignment

| Concept | Anthropic Skill Creator | Sunder SKILL-01–08 | Alignment |
|---|---|---|---|
| **Skill format** | `SKILL.md` (YAML frontmatter + markdown body) | `.md` files in Supabase Storage | Identical |
| **Progressive disclosure** | 3 levels: metadata → body → bundled resources | 3 levels: pointer (~20 tokens) → `read_file()` → sub-references | Identical philosophy, different mechanics |
| **Triggering** | `description` field in YAML frontmatter | System-reminder skill pointers → agent calls `read_file()` | Analogous — both use concise metadata for routing |
| **Bundled resources** | `scripts/`, `references/`, `assets/` subdirectories | Per-skill directories in Supabase Storage | Analogous |
| **Lazy loading** | Body loaded only after trigger; references loaded on demand | `read_file()` on demand, saves ~4,000–8,000 tokens/turn | Both optimize for token economics |
| **Creation flow** | Guided interview → draft → eval → iterate | Guided interview → plain-language preview → user approval (SKILL-07) | Both are interview-driven, but Sunder adds explicit approval gate |
| **Eval/iterate** | Formal: parallel runs, grading, benchmarks, viewer | **Not specified** — this is the gap | Major opportunity |
| **Trigger tuning** | Automated: generate test queries, optimize description via loop | **Not specified** | Major opportunity |

### What Sunder Already Has Right

**File-based skills (SKILL-01).** The decision to use markdown files in Supabase Storage, read lazily via `read_file()`, is exactly the Anthropic pattern. No database-driven skill execution, no compiled artifacts — just text instructions that the LLM interprets.

**Lazy loading via pointers (SKILL-02).** Sunder's system-reminder injects ~20–30 token pointers per skill. The LLM decides which skills to `read_file()` based on these pointers. This is structurally identical to the Skill Creator's progressive disclosure (metadata always in context, body loaded on trigger).

**Interview-driven creation (SKILL-07).** The Sunder spec requires a fixed flow: guided interview → plain-language preview → explicit user approval → co-located write. This matches the Skill Creator's capture-intent phase, but Sunder adds a stronger approval gate before any skill becomes active.

**Skills ship as proposals, not defaults (SKILL-08).** Growth Plan items are proposals. Each becomes active only after a Skill-Building Interview. This aligns with the Skill Creator's philosophy that skills should be intentional, not auto-activated.

### What the Skill Creator Adds That Sunder Hasn't Specified

These are the patterns we should adopt when the skill system gets undeferred.

#### 1. Eval/Iterate Loop

The Skill Creator's most valuable contribution is its **formalized quality loop**:

- Run the skill on test prompts (with-skill vs without-skill baseline)
- Capture outputs, timing, and token usage
- Human reviews outputs qualitatively via a browser viewer
- Quantitative assertions check objectively verifiable criteria
- Skill gets rewritten based on combined feedback
- Repeat until satisfactory

**Why this matters for Sunder:** Our real estate agent users will create custom skills via the Growth Plan (e.g., "weekly property briefing for District 15 condos"). These skills will run unsupervised in autopilot. Without an eval loop, we have no way to verify a skill works reliably before it starts auto-running. The Skill Creator's eval pattern gives us a framework for "skill confidence" before activation.

**Adaptation for Sunder:** We don't have Claude Code subagents in-product. But the runner itself can execute test runs. The eval loop could look like:

1. User completes Skill-Building Interview → skill draft is written
2. Runner executes 2–3 synthetic test prompts against the skill
3. Results shown to user for approval (this extends the existing SKILL-07 approval gate)
4. If user approves → skill activates. If not → iterate.

This keeps the human-in-the-loop philosophy (SKILL-08) while adding empirical validation.

#### 2. Trigger Tuning

The Skill Creator includes an automated trigger optimization loop:

- Generate 20 test queries (10 should-trigger, 10 should-not-trigger)
- Test current description against these queries
- Use extended thinking to propose description improvements
- Re-test, iterate up to 5 times
- Select best description by held-out test score (not training score — avoids overfitting)

**Why this matters for Sunder:** As a user accumulates 10+ skills, trigger accuracy becomes critical. A "property briefing" skill shouldn't fire when the user asks about "client meeting prep." False triggers waste tokens and confuse the agent. False negatives mean the skill never gets used despite being relevant.

**Adaptation for Sunder:** The trigger mechanism is different (system-reminder pointers + `read_file()` vs YAML description), but the eval methodology transfers directly. We could:

1. Generate test queries per skill
2. Run them through the system-reminder pointer assembly + LLM routing
3. Measure trigger accuracy
4. Adjust pointer text until accuracy is acceptable

This would be a **developer-side tool** (not user-facing) used when authoring system template skills or connection skills.

#### 3. Two Skill Categories

The Skill Creator distinguishes between:

- **Capability uplift skills** — teach the agent something it doesn't know well (may fade as models improve)
- **Encoded preference skills** — capture a specific process the user wants followed (durable, user-specific)

**Why this matters for Sunder:** This maps cleanly to our two-tier hierarchy (SKILL-04):

| Skill Creator category | Sunder equivalent | Example |
|---|---|---|
| Capability uplift | System templates (`client_id = NULL`) | "How to draft a Singapore property valuation report" |
| Encoded preference | Per-client custom skills | "Every Monday, brief me on new listings in D15 under $2M" |

Capability uplift skills are authored by the Sunder team and may need retirement as models improve. Encoded preference skills are co-created with users and stay durable because they encode the user's specific process. This distinction should inform our prioritization: **invest in the encoded-preference creation flow first** (it's the user-facing value), use capability uplift skills for baseline quality (team-authored, lower iteration cost).

#### 4. Benchmark-Driven Skill Maintenance

The Skill Creator supports benchmarking across model versions:

- Run the same eval set on a new model
- Compare pass rates, timing, token usage
- Detect regressions (skill got worse) or growth (skill is no longer needed)

**Why this matters for Sunder:** We're starting with Gemini Flash as Tier 1 (LLM-01, LLM-02). When we add multi-tier routing or swap models, skills that worked on Flash might break on a different model. The benchmark pattern gives us a regression detection mechanism.

**Adaptation for Sunder:** This would be a **CI/CD-level concern**, not user-facing. When we update the model tier:

1. Run system template skills against the benchmark set
2. Flag any regressions
3. Iterate on affected skills before deploying the model change

---

## Progressive Disclosure — Token Economics Comparison

The Skill Creator's three-level loading maps to Sunder's architecture:

| Level | Skill Creator | Sunder equivalent | Token cost |
|---|---|---|---|
| 1. Always in context | `name` + `description` (~100 words) | System-reminder pointer (~20–30 tokens) | Sunder is leaner |
| 2. On trigger | SKILL.md body (<5k words) | Full `.md` file via `read_file()` | Similar |
| 3. On demand | `references/`, `scripts/`, `assets/` | Sub-files in skill directory | Similar |

Sunder's pointer system is more token-efficient at Level 1 (20–30 tokens vs ~100 words), which matters when a user has 10+ skills. This is a correct design choice — validated by the Skill Creator's own guidance that "the context window is a public good."

---

## What to Build When Skills Get Undeferred

Prioritized by impact, mapped to existing architecture decisions:

### Must-Have (addresses gaps in current spec)

1. **Skill test-run before activation** — Extend SKILL-07's approval flow to include 2–3 synthetic test runs. User sees example outputs before the skill goes live. This is the single highest-impact adoption from the Skill Creator pattern.

2. **Trigger accuracy testing (dev-side)** — Build a simple eval harness that tests whether system-reminder pointers route the agent to the correct skill. Run this when authoring new system template skills or when the model changes.

### Should-Have (improves long-term quality)

3. **Skill benchmarking on model change** — When swapping or upgrading the LLM tier, run system template skills against a saved benchmark set. Detect regressions before deploying.

4. **Iteration support for custom skills** — After a user's custom skill runs in autopilot for a week, surface a "How's this working?" prompt. Let the user give feedback that the agent uses to iterate on the skill. This is the Skill Creator's eval/iterate loop, adapted for async in-product use.

### Nice-to-Have (future polish)

5. **Capability uplift retirement** — Track which system template skills are still providing uplift vs which the model can now handle natively. Retire deprecated skills to reduce pointer clutter.

6. **Blind A/B comparison** — For high-stakes skills (e.g., client communication drafts), run two versions and let an independent agent judge quality. The Skill Creator includes a comparator/analyzer agent pattern for this.

---

## Key Takeaways

1. **Our architecture is validated.** File-based skills, lazy loading, interview-driven creation — the Skill Creator pattern confirms these choices.

2. **The gap is quality assurance.** We have the creation flow designed (SKILL-07, SKILL-08) but no eval/iterate loop. The Skill Creator's eval pattern fills this gap cleanly.

3. **Trigger tuning is a real problem we'll face.** At 10+ skills per user, routing accuracy matters. The Skill Creator's automated trigger optimization is a proven solution we should plan for.

4. **The distinction between capability uplift vs encoded preference skills is strategically useful.** It tells us where to invest (user-specific encoded preferences are the durable value) and what to expect to deprecate (team-authored capability uplift skills may fade as models improve).

5. **Benchmark-driven maintenance is a CI/CD concern.** When we add multi-tier model routing, we need skill regression detection. The Skill Creator's benchmark pattern is the right approach.
