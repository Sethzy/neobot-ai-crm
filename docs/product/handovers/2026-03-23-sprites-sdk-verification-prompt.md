# Sprites SDK Verification — Handover Prompt for Dev Review

**Date:** 2026-03-23
**Goal:** Verify that Sunder's planned Sprites integration patterns are sound against the official docs and SDK, and find any reference repos we can learn from.

---

## Context

We're building two sandbox tools (`analyze_spreadsheet`, `publish_artifact`) that delegate coding tasks to Claude Code running inside a Fly.io Sprite. The full architecture is in:

- **Design doc:** `docs/product/designs/sandbox-skill-execution.md`
- **Handover:** `docs/product/handovers/2026-03-23-sandbox-sprites-architecture-handover.md`
- **PR 52 tasklist:** `docs/product/tasks/2026-03-20-pr52-sandbox-excel-analysis-tasklist.md`
- **PR 53 tasklist:** `docs/product/tasks/2026-03-20-pr53-sandbox-artifact-publishing-tasklist.md`

The pattern: Sunder's runner (Gemini Flash, Vercel Functions) gathers data via CRM/web/browser tools, writes data + skill files into a Sprite via the `@fly/sprites` SDK, runs `claude --dangerously-skip-permissions -p "..."` inside the Sprite, reads output files back, and returns results to the user. The Sprite auto-sleeps between iterations and wakes in <1s for follow-ups.

---

## What to verify

### 1. SDK API correctness

Check our planned usage against the official `@fly/sprites` SDK docs. Use context7 to query `/superfly/sprites-js` (benchmark score 95.3) and `/llmstxt/sprites_dev_llms-full_txt` (benchmark score 81.2).

**Verify these specific patterns:**

```typescript
import { SpritesClient } from '@fly/sprites';

const client = new SpritesClient(process.env.SPRITES_TOKEN!);
const sprite = client.sprite('sunder-thread-abc');

// Q1: Is this how you create/reference a Sprite? Or do we need to call
//     a create method first? Check if sprite() auto-creates or just references.

// Q2: Filesystem operations — do parent dirs auto-create?
const fs = sprite.filesystem('/workspace');
await fs.writeFile('skills/re-analyst/SKILL.md', skillContent);
await fs.writeJSON('data/property.json', propertyData);
await fs.writeFile('input/deals.xlsx', fileBuffer);  // Can we write binary buffers?

// Q3: Command execution — does exec() wait for completion and return stdout?
const { stdout, stderr } = await sprite.exec(
  'claude --dangerously-skip-permissions -p "..." --max-turns 20'
);

// Q4: Reading output files — can we read binary files (xlsx) back as buffers?
const output = await fs.readFile('output/result.xlsx');  // Buffer or string?

// Q5: Environment variables — how to set ANTHROPIC_API_KEY inside the Sprite?
//     Via spawn options? Or write to .bashrc? Or Sprite creation config?

// Q6: Detachable sessions for dev server (publish_artifact):
const session = sprite.createSession('npm', ['run', 'dev'], { cwd: '/workspace/app' });
// Does this work? Can we later check if port 8080 is serving?

// Q7: Port exposure — how does the preview URL work?
//     Is it automatic on port 8080? Or do we need to call something?
//     What's the URL format? sprite-name.sprites.dev?

// Q8: Auto-sleep/wake — does the Sprite auto-sleep after idle?
//     How long before it sleeps? Is it configurable?
//     Does sprite.exec() auto-wake a sleeping Sprite?

// Q9: Cleanup — how to delete a Sprite when the thread is done?
await sprite.delete();  // Does this exist? Is it sprite.delete() or client.deleteSprite()?
```

### 2. Claude Code inside Sprites

Verify from the Sprites docs:

- **Is Claude Code really pre-installed?** The docs say Ubuntu 25.10 with Claude CLI, Gemini CLI, Codex pre-installed. Confirm.
- **Does `pip install pandas openpyxl` persist across hibernation?** The docs claim installs persist. Confirm.
- **Can we set `ANTHROPIC_API_KEY` as an env var?** How? Via `sprite exec --env KEY=value`? Or write to `/root/.bashrc`? Or is there an SDK method?
- **Does `--dangerously-skip-permissions` work inside Sprites?** Any security restrictions that would block it?
- **Can we set `ANTHROPIC_BASE_URL` for OpenRouter routing (PR 54)?** Same env var question.

### 3. Network egress policy

Our design says we restrict outbound traffic to `api.anthropic.com` + package registries. Verify:

- **How do you set network policy?** REST API `POST /v1/network-policy`? SDK method?
- **Can we allowlist specific domains?** e.g., `api.anthropic.com`, `registry.npmjs.org`, `pypi.org`
- **Does the allowlist persist across hibernation?**
- **Can Claude Code still make API calls to Anthropic with the allowlist active?**

### 4. Pricing and limits

Verify against official docs:

- **CPU pricing:** We have $0.07/CPU-hr. Still current?
- **Memory pricing:** We have $0.04375/GB-hr. Still current?
- **Storage pricing:** Hot (NVMe) vs cold. What do we actually pay for a sleeping Sprite?
- **Free credits:** $30 still available for new accounts?
- **Max Sprites per account:** Any limit?
- **Max storage per Sprite:** 100GB, auto-scaling?
- **Hibernation timeout:** How long before auto-sleep? Configurable?

### 5. Reference repos

Search for repos that use `@fly/sprites` or Sprites.dev for agent-style workloads (not just dev environments). Known repos to check:

| Repo | What it does | Relevance |
|---|---|---|
| [superfly/sprites-js](https://github.com/superfly/sprites-js) | Official JS SDK | API reference, examples in README |
| [superfly/sprites-py](https://github.com/superfly/sprites-py) | Official Python SDK | Cross-reference API patterns |
| [superfly/sprites-ex](https://github.com/superfly/sprites-ex) | Official Elixir SDK | Has CLAUDE.md with Sprites context |
| [clouvet/sprite-mobile](https://github.com/clouvet/sprite-mobile) | PWA chat UI for Claude Code on a Sprite | Multi-session management, service architecture, Claude process lifecycle |
| [mcintyre94/wisp](https://github.com/mcintyre94/wisp) | iOS app for Claude on Sprites | Another Claude-on-Sprite implementation |
| [diggerhq/openlovable](https://github.com/diggerhq/openlovable) | Open Lovable clone (OpenComputer, not Sprites) | Same architectural pattern but on different infra. Closest reference for our use case. |

**Also search for:**
- Any repo that runs Claude Code (or any agent) inside a Sprite and reads results back programmatically (not interactively)
- Any repo that uses `sprite.filesystem()` to write data in and read artifacts out
- Any example of running `claude --dangerously-skip-permissions -p "..."` via `sprite.exec()`
- Fly.io community forum posts about running agents on Sprites (`community.fly.io`)

### 6. Gap analysis

After reviewing docs and repos, identify:

- **Any API we're using that doesn't exist** (methods we assumed but aren't in the SDK)
- **Any missing capability** (e.g., can't set env vars via SDK, can't read binary files, no port events)
- **Any gotcha** (e.g., Sprite names have length limits, filesystem has path restrictions, exec has timeout limits)
- **Any better pattern** (e.g., the SDK has a cleaner way to do something we planned the hard way)

---

## How to do this review

1. **Use context7 MCP** to query the official docs:
   - `/superfly/sprites-js` — JS SDK (highest quality, benchmark 95.3)
   - `/llmstxt/sprites_dev_llms-full_txt` — Full Sprites docs (benchmark 81.2)
   - `/websites/sprites_dev_api` — REST API reference (benchmark 74.45)

2. **Read the design doc** (`docs/product/designs/sandbox-skill-execution.md`) to understand what we're planning

3. **Check each pattern** in §1-4 above against the official docs

4. **Search GitHub** for reference repos per §5

5. **Write findings** to `docs/product/references/sprites-sdk-verification.md` with:
   - Each question from §1-4, answered with evidence from docs
   - Any gaps or gotchas found
   - Reference repos with relevance notes
   - Recommended changes to our design if any patterns are wrong

---

## Expected output

A single markdown file at `docs/product/references/sprites-sdk-verification.md` with:

```markdown
# Sprites SDK Verification

## API Correctness
Q1: [answer with doc reference]
Q2: [answer]
...

## Claude Code on Sprites
- Pre-installed: [yes/no, doc reference]
- Installs persist: [yes/no]
...

## Network Policy
...

## Pricing Verification
...

## Reference Repos
| Repo | Relevance | Key patterns to borrow |
...

## Gaps & Gotchas
- [any issues found]

## Recommended Design Changes
- [any changes needed based on findings]
```
