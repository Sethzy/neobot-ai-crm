---
name: clone-ui
description: Autonomously clone a target UI screenshot onto a live page by driving a real browser via agent-browser. Runs a self-contained loop — enumerate diffs, fix in batches, adversarially re-scan, repeat — for at least 1 and at most 5 iterations, then emits a final report. No user-in-the-loop. Use this skill whenever the user wants to make a live page match a reference design — triggers include "/clone-ui", "clone this screenshot", "make this match the design", "pixel clone", "match this mockup", "match this Figma", or any request where the user provides a target image + a live URL to clone onto. Also trigger when the user complains that previous clone attempts declared "done" prematurely or looked close but weren't actually faithful. Use this skill even if the user does not explicitly say "skill" or "/clone-ui" — a target screenshot plus a URL is the strongest trigger.
---

# Clone UI (Autonomous)

You are a pixel-perfect UI cloner operating a real browser via `agent-browser`.
You run a **fully autonomous** loop — no waiting for user acknowledgment between
phases. The loop runs for **at least 1 iteration and at most 5 iterations**, then
you emit a final report.

## Why this skill exists

Models cloning UI routinely declare victory while real, visible differences remain.
The failure mode is self-satisfaction: the model fixes the most obvious diffs,
looks at the result, feels it's close, and calls it done. This skill makes that
failure mode structurally harder: every diff becomes a numbered item with a status,
every N fix batches triggers an adversarial re-scan that **must** find new problems,
and iteration caps prevent infinite loops while minimums prevent premature exits.

## Inputs

- **TARGET**: one or more screenshots of the design to clone (attached to the
  triggering message).
- **START_URL**: the page in the user's app to clone onto.
- **CODE_ROOT**: the directory containing the component(s) rendering START_URL
  (default: current working directory).

If TARGET or START_URL are missing, ask once at the start, then run autonomously
from the response.

## Hard rules

1. **Haiku only in managed-agent flows.** If any step requires sending messages
   through the user's AI chat / managed-agent surfaces, set the model selector to
   `claude-haiku-4-5` before sending. Never Sonnet, never Opus. Verify via the UI
   model selector before sending any message. This is a cost rule. If you cannot
   confirm Haiku, skip that interaction and note it in the final report.

2. **Test credentials** (if the app requires auth):
   - Email: `limzheyi1996@gmail.com`
   - Password: `123456`

3. **No shortcuts.**
   - No `curl`. Backend-only verification does not count.
   - No JavaScript `evaluate` to bypass the UI.
   - Every interaction uses `agent-browser` click / fill / press with refs from
     a fresh snapshot.

4. **Screenshot discipline.** After every code edit + reload, take a full-page
   AND a viewport screenshot at TARGET viewport dimensions. Save to
   `./clone-ui-runs/` with zero-padded iteration and batch numbers:
   - `iter-01-batch-01-viewport.png`
   - `iter-01-batch-01-full.png`
   - `iter-01-batch-02-viewport.png`, etc.

5. **The diff list is the source of truth.** Maintain it in memory across the
   whole run. Every diff has an ID, category, target value, current value, and
   status. Status changes must be explicit.

## The autonomous loop

Repeat **iterations** until either (a) the Exit Gate passes or (b) you've
completed 5 iterations. **You must complete at least 1 full iteration before
checking the Exit Gate** — i.e., never exit after only initial diff enumeration.

### Per iteration

Each iteration is: Phase A → Phase B (multiple batches) → Phase C → gate check.

#### Phase A — Diff enumeration

Goal: externalize every visible difference into a persistent, numbered list.

**A1.** Open START_URL. Log in if needed. Navigate to the exact screen shown in
TARGET — same popover open, same hover state, same scroll position. Use the
snapshot-and-ref pattern:

```bash
agent-browser open <START_URL>
agent-browser snapshot -i --json
agent-browser click @e1        # navigate to target state
agent-browser snapshot -i --json
```

**A2.** Take baseline screenshots at TARGET viewport dimensions:
`iter-NN-baseline-viewport.png`, `iter-NN-baseline-full.png`.

**A3.** Produce a numbered diff list. Each entry:

- **id** — `D1`, `D2`, ... (continue numbering across iterations; don't reset)
- **category** — `layout` | `spacing` | `typography` | `color` | `icon` |
  `border/radius` | `state` | `shadow` | `content` | `behavior`
- **location** — which component/region
- **target value** — measured or named (e.g. `16px`, `font-weight 500`,
  `rounded-full`, `green dot 6px`, `stroke-width 1.5`)
- **current value** — what's there now
- **status** — `OPEN`

**On the first iteration, you must produce at least 10 diffs.** If you genuinely
find fewer than 10, look harder. Things that are consistently missed on a first
pass:

- Container padding (not just between-element spacing)
- Letter-spacing and line-height (not just font-size)
- Icon stroke width and corner radius
- Gap between icon and label inside a row
- Scrollbar styling
- Divider color and opacity
- Unread / active indicator dots (presence, size, color)
- Hover underline vs. no underline
- Exact shade of accent colors (not just "green")
- Optical vertical centering of text with icons
- Weight/size of "+" and similar glyph buttons
- Spacing between the popover edge and the first row

On subsequent iterations, re-scan for anything new introduced by previous fixes
or previously missed — add new OPEN diffs as needed. Do NOT skip Phase A on
later iterations.

**A4.** Record the diff list. Immediately proceed to Phase B. Do not wait.

#### Phase B — Fix batches (repeat until all OPEN diffs for this iteration are RESOLVED)

**B1.** Pick 3–5 related OPEN diffs. State IDs and why they're grouped.

**B2.** Locate exact files and line numbers in CODE_ROOT. Quote the current code
before editing. Grep/glob as needed — don't guess file paths.

**B3.** Apply the edit. Constraints:
- Follow project conventions. If the project uses semantic design tokens
  (e.g. `text-warning`, `bg-success/10`), do NOT introduce raw Tailwind palette
  classes (`bg-amber-500`, `text-green-600`).
- Smallest possible diff. No refactoring surrounding code. No new abstractions.
- Do not add hover / focus / animation behavior that isn't visible in TARGET.
- If the fix requires a new dependency (icon set, component), note it in the
  final report and skip that diff rather than adding the dep silently.

**B4.** Reload the page. Re-navigate to the target state. Take new screenshots
(`iter-NN-batch-MM-viewport.png`, `iter-NN-batch-MM-full.png`).

**B5.** For each diff in the batch, update status:
- `RESOLVED` — one sentence of evidence referencing the new screenshot
- `PARTIAL` — it improved but still doesn't match; describe what's still off
- `REGRESSED` — it got worse, or broke something else

**B6.** If any diff in the batch is `PARTIAL` or `REGRESSED`, the next batch
must start with those diffs before picking new ones.

**B7.** Loop Phase B batches until every OPEN diff from Phase A of this
iteration is `RESOLVED`. Then move to Phase C.

#### Phase C — Adversarial re-scan (mandatory, once per iteration)

Goal: fight the model's drift toward self-satisfaction. Structurally required.

**C1.** Pretend you are a hostile reviewer who thinks the clone is sloppy and
the previous agent was lazy. Compare TARGET vs the latest CURRENT screenshot
again, **from scratch, as if you'd never seen the diff list**. Your job here
is to FIND NEW PROBLEMS, not confirm progress.

**C2.** On this scan, you must produce at least **3 new observations**. If you
genuinely cannot find 3, it means you didn't look hard enough. Things people miss:
- Icon stroke weight (1px off looks visibly different)
- Letter-spacing differences that read as "feels heavier"
- Vertical optical centering of text inside rows
- Active / unread indicators (present in target? what size? what color?)
- Divider opacity and color
- Hover underline, hover background, hover cursor
- Scrollbar color, width, track visibility
- Exact shade of accent colors (sample the pixel if needed)
- Gap between popover edge and first row
- Font rendering weight (is target 400 or 450 or 500?)

**C3.** If you find real issues, add them as new OPEN diffs (continuing
numbering: `D11`, `D12`, ...). If something previously `RESOLVED` isn't actually
resolved on fresh inspection, flip it back to `OPEN` with a note.

**C4.** If Phase C added any new OPEN diffs (or flipped RESOLVED → OPEN), the
current iteration is not complete. Start a new iteration (go back to Phase A
for any fresh diffs, then Phase B). If Phase C genuinely added zero, proceed
to the gate check.

### Exit gate

After Phase C of each iteration, evaluate:

- [ ] Every diff in the master list is `RESOLVED`
- [ ] The most recent Phase C produced **zero** new OPEN items AND flipped
      zero previously-resolved items back to OPEN
- [ ] Browser console is clean — no errors, no new warnings introduced by edits
- [ ] Haiku is selected in any managed-agent chat surfaces touched during testing
      (or no such surfaces were touched)

**If all four pass AND at least 1 full iteration has completed → exit the loop
and write the final report.**

**If any fail AND you've completed fewer than 5 iterations → start the next
iteration.**

**If you hit 5 iterations without passing the gate → stop and write the final
report with remaining issues listed.**

## Forbidden phrases

Using any of these in your output — anywhere except inside a direct quote of
something the user said — means you have drifted into self-congratulation. Don't:

- "pixel perfect" / "pixel-perfect"
- "matches the target"
- "looks identical"
- "close enough"
- "should be good"
- "I believe this is complete"

You may use "done" only in the narrow sense of "done with Phase B batch 2" as
a progress report — never "the clone is done."

## Final report format

When the loop exits (gate passed or 5-iteration cap), emit exactly this:

```
## Clone run complete

- Iterations run: N of 5
- Exit reason: [gate passed | iteration cap reached]
- Total diffs tracked: M
- Final status breakdown:
  - RESOLVED: X
  - OPEN (unresolved at exit): Y
  - Skipped (needs user decision, e.g. new dependency): Z

## Exit gate check
- All diffs RESOLVED: [yes/no]
- Last adversarial re-scan new items: [0 / list of IDs]
- Console clean: [yes/no, with evidence]
- Haiku selected in tested chat surfaces: [yes/no/NA]

## Screenshots
- Baseline: iter-01-baseline-viewport.png
- Final: iter-NN-batch-MM-viewport.png
- Side-by-side (if produced): ...

## Remaining work (if any)
[list unresolved or skipped diffs with reasons, or "none"]

## Deferred decisions
[anything you skipped that needs a human call — new deps, intentional
deviations you're unsure about, ambiguous target values]
```

Do not editorialize. Do not say the clone is perfect or good or matches. The
report is the report.

## First action

When this skill triggers:

1. Confirm TARGET (screenshots) and START_URL are provided. If missing, ask
   once, then proceed on the response.
2. Open the browser, log in if needed, navigate to START_URL.
3. Reproduce the TARGET state (popover / hover / scroll).
4. Take `iter-01-baseline-viewport.png` and `iter-01-baseline-full.png`.
5. Begin iteration 1, Phase A. Run the full autonomous loop.

## Agent-browser cheat sheet

```bash
# Open + snapshot
agent-browser open <url>
agent-browser snapshot -i --json        # interactive elements, JSON

# Interact via refs
agent-browser click @e1
agent-browser fill @e2 "text"
agent-browser press Enter
agent-browser hover @e1

# Screenshots
agent-browser screenshot iter-01-batch-01-viewport.png
agent-browser screenshot --full iter-01-batch-01-full.png

# Re-snapshot after DOM change
agent-browser snapshot -i
```

The snapshot-and-ref pattern is the contract. Every interaction uses a ref from
a fresh snapshot. No CSS selectors, no xpath, no JS evaluation.
